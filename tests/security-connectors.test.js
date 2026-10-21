import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import * as OTPAuth from "otpauth";
import { createApp } from "../server/app.js";
import { pool } from "../server/db.js";
import { seal, unseal } from "../server/security.js";
import {
  connectorHost,
  connectorPayload,
  remoteRequest,
} from "../server/connectors.js";
import { runAutomations } from "../server/automations.js";
process.env.REGISTRATION_ENABLED = "true";
process.env.PUBLIC_APP_URL = "https://maxcess.example.test";
process.env.SMTP_URL = "smtp://127.0.0.1:1";
process.env.MAIL_FROM = "test@example.test";
let app;
beforeEach(() => {
  app = createApp();
});
const created = [];
const password = "Secure-password-2026!";
async function register() {
  const agent = request.agent(app);
  const boot = (await agent.get("/api/bootstrap")).body;
  const credentials = {
    email: randomUUID() + "@example.test",
    password,
    first_name: "Test",
    last_name: "Owner",
    birth_date: "1990-01-01",
    phone: "+525512345678",
    company: "Security " + randomUUID(),
    address: "10 Test Street",
    country: "MX",
    tax_id: "TEST123",
    language: "en",
    accepted_terms: true,
  };
  const response = await agent
    .post("/api/register")
    .set("X-CSRF-Token", boot.csrf)
    .send(credentials)
    .expect(201);
  created.push(response.body.user.tenant_id);
  return { agent, credentials, ...response.body };
}
const send = (u, path, body, method = "post") =>
  u.agent[method]("/api" + path)
    .set("X-CSRF-Token", u.csrf)
    .send(body);
after(async () => {
  for (const tenant of created) {
    for (const table of [
      "ticket_connectors",
      "notification_outbox",
      "workspace_audit",
      "events",
      "tickets",
      "invitations",
      "customer_branches",
      "users",
      "companies",
      "workspace_roles",
    ])
      await pool.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [tenant]);
    await pool.query("DELETE FROM tenants WHERE id=$1", [tenant]);
  }
  await pool.end();
});
test("Registration validates personal and company details, stores them privately and grants exactly twelve days", async () => {
  const u = await register();
  const {
    rows: [profile],
  } = await pool.query(
    "SELECT first_name,last_name,birth_date::text,phone FROM users WHERE id=$1",
    [u.user.id],
  );
  assert.equal(profile.first_name, "Test");
  assert.equal(profile.birth_date, "1990-01-01");
  assert.equal(u.user.birth_date, undefined);
  const {
    rows: [company],
  } = await pool.query(
    "SELECT legal_name,billing_address,billing_country,tax_id,extract(epoch from(trial_ends_at-created_at))/86400 days FROM tenants WHERE id=$1",
    [u.user.tenant_id],
  );
  assert.equal(company.billing_country, "MX");
  assert.equal(company.tax_id, "TEST123");
  assert.equal(Number(company.days), 12);
  for (const change of [
    { phone: "12345" },
    { birth_date: "2026-02-31" },
    { country: "XX" },
    { tax_id: "" },
  ])
    await send(u, "/register", {
      ...u.credentials,
      email: randomUUID() + "@example.test",
      ...change,
    }).expect(400);
});
test("TOTP enrollment requires proof, login blocks access until MFA, rejects replay and consumes recovery codes once", async () => {
  const u = await register();
  await send(u, "/security/setup", {
    password: "wrong",
    method: "totp",
  }).expect(400);
  const setup = (
    await send(u, "/security/setup", { password, method: "totp" }).expect(200)
  ).body;
  assert.ok(setup.qr.startsWith("data:image/png;base64,"));
  const otp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(setup.secret),
  });
  await send(u, "/security/confirm", { code: "invalid" }).expect(400);
  const confirmed = (
    await send(u, "/security/confirm", { code: otp.generate() }).expect(200)
  ).body;
  assert.equal(confirmed.recovery_codes.length, 8);
  const {
    rows: [stored],
  } = await pool.query("SELECT * FROM user_mfa WHERE user_id=$1", [u.user.id]);
  assert.notEqual(stored.secret, setup.secret);
  assert.equal(unseal(stored.secret), setup.secret);
  assert.notEqual(stored.recovery_hashes[0], confirmed.recovery_codes[0]);
  const other = request.agent(app);
  let boot = (await other.get("/api/bootstrap")).body;
  const pending = (
    await other
      .post("/api/login")
      .set("X-CSRF-Token", boot.csrf)
      .send(u.credentials)
      .expect(200)
  ).body;
  assert.equal(pending.mfa_required, true);
  assert.equal(pending.user, undefined);
  await other.get("/api/me").expect(401);
  await other
    .post("/api/security/login")
    .set("X-CSRF-Token", pending.csrf)
    .send({ code: otp.generate() })
    .expect(401);
  const verified = (
    await other
      .post("/api/security/login")
      .set("X-CSRF-Token", pending.csrf)
      .send({ code: confirmed.recovery_codes[0] })
      .expect(200)
  ).body;
  assert.equal(verified.user.id, u.user.id);
  await other.get("/api/me").expect(200);
  const again = (
    await other
      .post("/api/login")
      .set("X-CSRF-Token", verified.csrf)
      .send(u.credentials)
      .expect(200)
  ).body;
  await other
    .post("/api/security/login")
    .set("X-CSRF-Token", again.csrf)
    .send({ code: confirmed.recovery_codes[0] })
    .expect(401);
  await pool.query(
    "UPDATE mfa_challenges SET expires_at=now()-interval '1 second' WHERE user_id=$1",
    [u.user.id],
  );
  await other
    .post("/api/security/login")
    .set("X-CSRF-Token", again.csrf)
    .send({ code: confirmed.recovery_codes[1] })
    .expect(401);
  await send(u, '/security/disable/start', {password}).expect(200);
  await send(u, '/security/disable', {code:confirmed.recovery_codes[1]}).expect(200);
  assert.equal((await u.agent.get('/api/security')).body.method,null);
});
test("Email MFA setup cannot activate without its emailed code; attempts lock after five failures; unsupported methods are rejected", async () => {
  const u = await register();
  await send(u, "/security/setup", { password, method: "sms" }).expect(400);
  await send(u, "/security/setup", { password, method: "email" }).expect(200);
  let {
    rows: [message],
  } = await pool.query(
    "SELECT body FROM notification_outbox WHERE tenant_id=$1 AND dedupe_key LIKE 'mfa:%' ORDER BY id DESC LIMIT 1",
    [u.user.tenant_id],
  );
  const code = message.body.match(/\b\d{6}\b/)[0];
  for (let i = 0; i < 5; i++)
    await send(u, "/security/confirm", { code: "wrong" }).expect(400);
  await send(u, "/security/confirm", { code }).expect(400);
  await send(u, "/security/setup", { password, method: "email" }).expect(200);
  ({
    rows: [message],
  } = await pool.query(
    "SELECT body FROM notification_outbox WHERE tenant_id=$1 AND dedupe_key LIKE 'mfa:%' ORDER BY id DESC LIMIT 1",
    [u.user.tenant_id],
  ));
  await send(u, "/security/confirm", {
    code: message.body.match(/\b\d{6}\b/)[0],
  }).expect(200);
});
test("Overdue alerts are tenant-scoped, deduplicated, optional and stop for resolved tickets", async () => {
  const u = await register();
  await pool.query("UPDATE users SET email_verified_at=now() WHERE id=$1", [
    u.user.id,
  ]);
  const {
    rows: [company],
  } = await pool.query("SELECT id FROM companies WHERE tenant_id=$1", [
    u.user.tenant_id,
  ]);
  const {
    rows: [ticket],
  } = await pool.query(
    "INSERT INTO tickets(tenant_id,company_id,title,description,site,category,priority,requested_priority,created_by,due_at) VALUES($1,$2,'Reports','Private description','Main','Servicio','Media','Media',$3,now()-interval '1 hour') RETURNING id",
    [u.user.tenant_id, company.id, u.user.id],
  );
  await pool.query("UPDATE tenants SET settings=settings-'escalations' WHERE id=$1",[u.user.tenant_id]);
  await runAutomations();
  await runAutomations();
  let { rows } = await pool.query(
    "SELECT * FROM notification_outbox WHERE tenant_id=$1 AND dedupe_key LIKE 'overdue:%'",
    [u.user.tenant_id],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].recipient, u.user.email);
  assert.ok(rows[0].body.includes("Reports"));
  await pool.query("UPDATE tickets SET status='Resuelto' WHERE id=$1", [
    ticket.id,
  ]);
  await runAutomations();
  assert.equal(
    (
      await pool.query(
        "SELECT count(*) FROM notification_outbox WHERE tenant_id=$1 AND dedupe_key LIKE 'overdue:%'",
        [u.user.tenant_id],
      )
    ).rows[0].count,
    "1",
  );
  await pool.query(
    "UPDATE tenants SET settings=jsonb_set(settings,'{overdue_alerts}','false') WHERE id=$1",
    [u.user.tenant_id],
  );
  await pool.query(
    "UPDATE tickets SET status='Abierto',due_at=now()-interval '2 hour' WHERE id=$1",
    [ticket.id],
  );
  await runAutomations();
  assert.equal(
    (
      await pool.query(
        "SELECT count(*) FROM notification_outbox WHERE tenant_id=$1 AND dedupe_key LIKE 'overdue:%'",
        [u.user.tenant_id],
      )
    ).rows[0].count,
    "1",
  );
});
test("Connector credentials stay encrypted and tenant-private; remote requests are restricted and payloads omit internal notes", async () => {
  const a = await register(),
    b = await register();
  await send(
    a,
    "/connectors/zendesk",
    { hostname: "localhost", token: "secret-test-token" },
    "put",
  ).expect(400);
  await send(
    a,
    "/connectors/zendesk",
    { hostname: "example.zendesk.com", token: "secret-test-token" },
    "put",
  ).expect(200);
  assert.equal(
    (await b.agent.get("/api/connectors")).body.connectors.length,
    0,
  );
  const listing = (await a.agent.get("/api/connectors")).body;
  assert.equal(listing.connectors.length, 1);
  assert.ok(!JSON.stringify(listing).includes("secret-test-token"));
  const {
    rows: [stored],
  } = await pool.query("SELECT * FROM ticket_connectors WHERE tenant_id=$1", [
    a.user.tenant_id,
  ]);
  assert.notEqual(stored.credential, "secret-test-token");
  let called;
  await remoteRequest(
    stored,
    "/api/v2/users/me.json",
    "GET",
    undefined,
    async (url, options) => {
      called = { url, options };
      return { ok: true, json: async () => ({}) };
    },
  );
  assert.equal(called.options.redirect, "error");
  assert.equal(
    called.options.headers.Authorization,
    "Bearer secret-test-token",
  );
  for (const host of [
    "https://example.zendesk.com",
    "example.zendesk.com@127.0.0.1",
    "127.0.0.1",
    "example.zendesk.com.evil.test",
  ])
    assert.throws(() => connectorHost("zendesk", host));
  assert.equal(unseal(seal("test secret")), "test secret");
  const payload = connectorPayload("zendesk", {
    tenant_id: 1,
    id: 2,
    title: "Title",
    description: "Description",
    priority: "Media",
    status: "Abierto",
    internal_notes: "NEVER SEND",
  });
  assert.ok(!JSON.stringify(payload).includes("NEVER SEND"));
  assert.equal(payload.ticket.comment.public, false);
  await send(b, "/connectors/zendesk/tickets/1", {}).expect(404);
});
