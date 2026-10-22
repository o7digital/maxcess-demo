import { LEGAL_VERSION } from "../public/legal.js";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import Stripe from "stripe";
import sharp from "sharp";
import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app.js";
import { pool } from "../server/db.js";
import { defaults } from "../server/workspace.js";
const previous = {
  registration: process.env.REGISTRATION_ENABLED,
  origin: process.env.PUBLIC_APP_URL,
  webhook: process.env.STRIPE_WEBHOOK_SECRET,
  smtp: process.env.SMTP_URL,
  mailFrom: process.env.MAIL_FROM,
};
process.env.REGISTRATION_ENABLED = "true";
process.env.PUBLIC_APP_URL = "https://servicehub.example.org";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_unit_test_only";
process.env.SMTP_URL = "smtp://127.0.0.1:1";
process.env.MAIL_FROM = "Service Hub <noreply@example.test>";
let subscription,
  checkoutBody,
  subscriptionUpdate,
  priceId = 0,
  checkoutId = 0;
const createdPrices = new Map();
const createdProducts = [];
const sdk = new Stripe("sk_test_fixture");
const fake = {
  webhooks: sdk.webhooks,
  products: { create: async (body) => { createdProducts.push(body); return { id: "prod_fixture" }; } },
  prices: {
    create: async (body) => {
      const price = { id: "price_fixture_" + ++priceId, ...body };
      createdPrices.set(price.id, price);
      return price;
    },
  },
  customers: {
    create: async (body) => ({ id: "cus_fixture_" + body.metadata.tenant_id }),
  },
  checkout: {
    sessions: {
      create: async (body) => {
        checkoutBody = body;
        return {
          id: "cs_fixture_" + ++checkoutId,
          url: "https://checkout.stripe.com/fixture",
        };
      },
      retrieve: async () => ({ status: "expired" }),
    },
  },
  subscriptions: {
    retrieve: async () => subscription,
    update: async (id, body) => {
      subscriptionUpdate = body;
      return subscription;
    },
  },
  billingPortal: {
    sessions: {
      create: async () => ({ url: "https://billing.stripe.com/fixture" }),
    },
  },
};
const app = createApp({ getStripe: () => fake }),
  created = [];
after(async () => {
  for (const id of created) {
    for (const table of [
      "workspace_logos",
      "configuration_proposals",
      "notification_outbox",
      "workspace_audit",
      "billing_invoices",
      "ai_usage",
      "ai_messages",
      "ai_conversations",
      "reports",
      "user_audit",
      "events",
      "tickets",
      "invitations",
      "customer_branches",
      "contacts",
    ])
      await pool.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [id]);
    await pool.query("DELETE FROM users WHERE tenant_id=$1", [id]);
    await pool.query("DELETE FROM teams WHERE tenant_id=$1", [id]);
    await pool.query("DELETE FROM companies WHERE tenant_id=$1", [id]);
    await pool.query("DELETE FROM workspace_roles WHERE tenant_id=$1", [id]);
    await pool.query("DELETE FROM departments WHERE tenant_id=$1", [id]);
    await pool.query("DELETE FROM tenants WHERE id=$1", [id]);
  }
  await pool.query("DELETE FROM billing_events WHERE id LIKE 'evt_fixture_%'");
  await pool.query(
    "DELETE FROM stripe_price_catalog WHERE stripe_price_id LIKE 'price_fixture_%'",
  );
  process.env.REGISTRATION_ENABLED = previous.registration;
  process.env.PUBLIC_APP_URL = previous.origin;
  process.env.STRIPE_WEBHOOK_SECRET = previous.webhook;
  if (previous.smtp === undefined) delete process.env.SMTP_URL;
  else process.env.SMTP_URL = previous.smtp;
  if (previous.mailFrom === undefined) delete process.env.MAIL_FROM;
  else process.env.MAIL_FROM = previous.mailFrom;
  await pool.end();
});
async function register(label) {
  const agent = request.agent(app),
    b = await agent.get("/api/bootstrap").expect(200);
  const body = {
    name: "Owner " + label,
    first_name: "Test", last_name: "Owner", birth_date: "1990-01-01", phone: "+525512345678", address: "10 Test Street", country: "MX", tax_id: "TEST123",
    company: "Workspace " + label,
    email: `saas-${randomUUID()}@example.test`,
    password: "Secure-password-2026!",
    language: "es",
    accepted_terms: true,
  };
  const result = await agent
    .post("/api/register")
    .set("X-CSRF-Token", b.body.csrf)
    .send(body)
    .expect(201);
  created.push(result.body.user.tenant_id);
  return {
    agent,
    user: result.body.user,
    csrf: result.body.csrf,
    credentials: body,
  };
}
const send = (u, path, body, method = "post") =>
  u.agent[method]("/api" + path)
    .set("X-CSRF-Token", u.csrf)
    .send(body);
let a, b, aCompany, bCompany, agentA, ticketA;
test("Registration creates an empty workspace with exactly twelve calendar trial days and no demo data", async () => {
  a = await register("A");
  b = await register("B");
  assert.notEqual(a.user.tenant_id, b.user.tenant_id);
  assert.equal(a.user.role, "admin");
  const consent = (await pool.query("SELECT details FROM workspace_audit WHERE tenant_id=$1 AND action='registered'",[a.user.tenant_id])).rows[0].details;
  assert.equal(consent.terms_version,LEGAL_VERSION);
  assert.equal(consent.privacy_version,LEGAL_VERSION);
  assert.equal(consent.notice_language,"en");
  assert.equal(a.user.is_platform_owner, false);
  const ws = (await a.agent.get("/api/workspace").expect(200)).body.workspace;
  assert.equal(ws.is_demo, false);
  assert.equal(ws.seat_limit, 5);
  assert.equal(ws.onboarding_completed, false);
  const trial = (await pool.query("SELECT created_at,trial_ends_at FROM tenants WHERE id=$1",[a.user.tenant_id])).rows[0];
  assert.equal(trial.trial_ends_at-trial.created_at,12*86400000);
  assert.equal((await a.agent.get("/api/plans")).body.trial_days,12);
  const welcome = (await pool.query("SELECT body FROM notification_outbox WHERE tenant_id=$1 AND dedupe_key=$2",[a.user.tenant_id,`welcome:${a.user.tenant_id}`])).rows[0];
  assert.ok(welcome.body.includes("12 días naturales"));
  assert.ok(
    Math.abs(Date.parse(ws.trial_ends_at) - Date.now() - 12 * 86400000) < 10000,
  );
  const companies = (await a.agent.get("/api/companies").expect(200)).body
    .companies;
  assert.equal(companies.length, 1);
  aCompany = companies[0];
  bCompany = (await b.agent.get("/api/companies").expect(200)).body
    .companies[0];
  assert.equal(
    (await a.agent.get("/api/tickets").expect(200)).body.tickets.length,
    0,
  );
  await send(a, "/platform/plans/team-5", {}, "put").expect(403);
  await send(a, "/users", {
    name: "Escalation",
    email: `no-${randomUUID()}@example.test`,
    password: "Secure-password-2026!",
    role: "platform_admin",
  }).expect(403);
});
test("Server validates onboarding, settings, forms, foreign rules and membership", async () => {
  const member = await send(a, "/users", {
    name: "Agent A",
    email: `agent-${randomUUID()}@example.test`,
    password: "Secure-password-2026!",
    role: "agent",
  }).expect(201);
  agentA = member.body.user;
  await send(
    a,
    "/workspace",
    { name: "A", settings: { ...defaults, timezone: "invalid/timezone" } },
    "put",
  ).expect(400);
  await send(
    a,
    "/workspace",
    {
      name: "A",
      settings: {
        ...defaults,
        rules: [{ category: "Servicio", agent_id: b.user.id, notify: false }],
      },
    },
    "put",
  ).expect(400);
  const settings = {
    ...defaults,
    categories: ["Mantenimiento"],
    fields: [{ key: "asset", label: "Equipo", type: "text", required: true }],
    sla: { ...defaults.sla, Alta: 3 },
    rules: [{ category: "Mantenimiento", agent_id: agentA.id, notify: true }],
    workflow: [
      ...defaults.workflow,
      { name: "Esperando material", state: "En curso" },
    ],
  };
  await send(
    a,
    "/workspace",
    { name: "Configured A", settings, onboarding_completed: true },
    "put",
  ).expect(200);
  const saved = (await a.agent.get("/api/workspace")).body.workspace;
  assert.equal(saved.onboarding_completed, true);
  assert.equal(saved.settings.categories[0], "Mantenimiento");
  const team = (await send(a, "/teams", { name: "Field team" }).expect(201))
    .body.team;
  await send(a, `/users/${agentA.id}/team`, { team_id: team.id }, "put").expect(
    200,
  );
  await send(b, `/users/${b.user.id}/team`, { team_id: team.id }, "put").expect(
    400,
  );
});
test("Logos upload from files, persist as PNG, stay tenant-owned and can be replaced or removed", async () => {
  const image = await sharp({
    create: {
      width: 900,
      height: 450,
      channels: 4,
      background: { r: 70, g: 90, b: 20, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  await a.agent
    .put("/api/workspace/logo")
    .send({ type: "image/png", file: image.toString("base64") })
    .expect(403);
  await send(
    a,
    "/workspace/logo",
    { type: "image/svg+xml", file: Buffer.from("<svg/>").toString("base64") },
    "put",
  ).expect(400);
  await send(
    a,
    "/workspace/logo",
    { type: "image/png", file: Buffer.from("Not an image").toString("base64") },
    "put",
  ).expect(400);
  const { body: uploaded } = await send(
    a,
    "/workspace/logo",
    { type: "image/png", file: image.toString("base64") },
    "put",
  ).expect(200);
  assert.match(uploaded.url, /^\/api\/workspace\/logo\/[0-9a-f-]+$/);
  const stored = await request(app)
    .get(uploaded.url)
    .expect(200)
    .expect("Content-Type", /image\/png/);
  const metadata = await sharp(stored.body).metadata();
  assert.equal(metadata.width, 512);
  assert.equal(metadata.height, 256);
  assert.equal(
    (await a.agent.get("/api/workspace")).body.workspace.settings.logo,
    uploaded.url,
  );
  const other = (await b.agent.get("/api/workspace")).body.workspace;
  await send(
    b,
    "/workspace",
    { name: other.name, settings: { ...other.settings, logo: uploaded.url } },
    "put",
  ).expect(400);
  const staff = request.agent(app),
    boot = await staff.get("/api/bootstrap");
  const login = await staff
    .post("/api/login")
    .set("X-CSRF-Token", boot.body.csrf)
    .send({ email: agentA.email, password: "Secure-password-2026!" })
    .expect(200);
  await staff
    .put("/api/workspace/logo")
    .set("X-CSRF-Token", login.body.csrf)
    .send({ type: "image/png", file: image.toString("base64") })
    .expect(403);
  const webp = await sharp(image).webp().toBuffer();
  const replacement = (
    await send(
      a,
      "/workspace/logo",
      { type: "image/webp", file: webp.toString("base64") },
      "put",
    ).expect(200)
  ).body;
  assert.notEqual(replacement.url, uploaded.url);
  await request(app).get(uploaded.url).expect(404);
  await send(b, "/workspace/logo", {}, "delete").expect(200);
  await request(app).get(replacement.url).expect(200);
  await send(a, "/workspace/logo", {}, "delete").expect(200);
  await request(app).get(replacement.url).expect(404);
  assert.equal(
    (await a.agent.get("/api/workspace")).body.workspace.settings.logo,
    "",
  );
});
test("Tickets apply tenant forms, assignments, SLA and workflows; cross-tenant reads and writes fail", async () => {
  const body = {
    title: "Pump maintenance",
    description: "Actual workspace request",
    site: "Site A",
    category: "Mantenimiento",
    priority: "Alta",
    company_id: aCompany.id,
  };
  await send(a, "/tickets", body).expect(400);
  await send(a, "/tickets", {
    ...body,
    custom_fields: { asset: "PUMP-01" },
    company_id: bCompany.id,
  }).expect(400);
  const response = await send(a, "/tickets", {
    ...body,
    custom_fields: { asset: "PUMP-01" },
  }).expect(201);
  ticketA = response.body.ticket;
  assert.equal(ticketA.tenant_id, a.user.tenant_id);
  assert.equal(ticketA.agent_id, agentA.id);
  assert.equal(ticketA.custom_fields.asset, "PUMP-01");
  assert.ok(
    Math.abs(
      Date.parse(ticketA.due_at) - Date.parse(ticketA.created_at) - 3 * 3600000,
    ) < 1000,
  );
  await b.agent.get("/api/tickets/" + ticketA.id).expect(404);
  await send(b, `/tickets/${ticketA.id}/actions`, {
    action: "note",
    body: "Intrusion",
  }).expect(404);
  await send(b, `/tickets/${ticketA.id}/transition`, {
    stage: "En curso",
  }).expect(404);
  await send(a, `/tickets/${ticketA.id}/transition`, {
    stage: "Esperando material",
  }).expect(200);
  const loaded = (await a.agent.get("/api/tickets/" + ticketA.id)).body.ticket;
  assert.equal(loaded.workflow_stage, "Esperando material");
  assert.equal(loaded.status, "En curso");
  await send(a, `/tickets/${ticketA.id}/transition`, {
    stage: "Cerrado",
  }).expect(409);
  assert.equal((await b.agent.get("/api/analytics")).body.metrics.total, 0);
  assert.ok(
    !(await b.agent.get("/api/users")).body.users.some(
      (u) => u.id === agentA.id,
    ),
  );
  await send(b, `/users/${agentA.id}/access`, { active: false }).expect(404);
});
test("Ticket lists use bounded pages, non-overlapping cursors and tenant-scoped server search", async () => {
  await pool.query(
    "INSERT INTO tickets(tenant_id,title,company_id,site,category,description,priority,requested_priority,created_by,due_at) SELECT $1,'Fixture request '||n,$2,'Main','Mantenimiento','Pagination fixture','Baja','Baja',$3,now()+interval '1 day' FROM generate_series(1,105) n",
    [a.user.tenant_id, aCompany.id, a.user.id],
  );
  const first = (await a.agent.get("/api/tickets").expect(200)).body;
  assert.equal(first.tickets.length, 100);
  assert.equal(first.total, 106);
  assert.ok(first.next_cursor);
  const second = (
    await a.agent.get("/api/tickets?before=" + first.next_cursor).expect(200)
  ).body;
  assert.equal(second.tickets.length, 6);
  assert.equal(second.next_cursor, null);
  assert.equal(
    new Set([...first.tickets, ...second.tickets].map((t) => t.id)).size,
    106,
  );
  assert.equal((await a.agent.get("/api/tickets?q=Pump")).body.total, 1);
  assert.equal((await b.agent.get("/api/tickets?q=Fixture")).body.total, 0);
  await a.agent.get("/api/tickets?limit=201").expect(400);
  assert.equal((await a.agent.get("/api/tickets?q=Fixture_%25")).body.total, 0);
});
test("Database foreign keys reject cross-tenant references even when bypassing API", async () => {
  await assert.rejects(
    pool.query(
      "INSERT INTO contacts(tenant_id,company_id,name,email,function) VALUES($1,$2,$3,$4,$5)",
      [
        b.user.tenant_id,
        aCompany.id,
        "Wrong",
        `bad-${randomUUID()}@example.test`,
        "Contact",
      ],
    ),
    { code: "23503" },
  );
});
test("International branches stay customer-scoped and user language persists independently", async () => {
  const path = `/companies/${aCompany.id}/branches`;
  const body = {
    name: "Paris",
    country_code: "FR",
    city: "Paris",
    address: "8 rue du Service",
    language: "fr",
    timezone: "Europe/Paris",
  };
  const paris = (await send(a, path, body).expect(201)).body.branch;
  const mexico = (
    await send(a, path, {
      ...body,
      name: "Monterrey",
      country_code: "MX",
      language: "es",
      timezone: "America/Monterrey",
    }).expect(201)
  ).body.branch;
  const technician = request.agent(app),
    technicianBoot = await technician.get("/api/bootstrap");
  const technicianLogin = await technician
    .post("/api/login")
    .set("X-CSRF-Token", technicianBoot.body.csrf)
    .send({ email: agentA.email, password: "Secure-password-2026!" })
    .expect(200);
  await technician
    .post("/api" + path)
    .set("X-CSRF-Token", technicianLogin.body.csrf)
    .send({ ...body, name: "Forbidden" })
    .expect(403);
  await technician
    .put("/api" + path + "/" + paris.id)
    .set("X-CSRF-Token", technicianLogin.body.csrf)
    .send(body)
    .expect(403);
  assert.notEqual(paris.id, mexico.id);
  assert.equal(paris.company_id, aCompany.id);
  assert.equal(paris.tenant_id, a.user.tenant_id);
  for (const patch of [
    { country_code: "XX" },
    { country_code: "fr" },
    { language: "xx" },
    { timezone: "Europe/Nowhere" },
  ])
    await send(a, path, { ...body, ...patch }).expect(400);
  await send(b, path, body).expect(404);
  await send(b, path + "/" + paris.id, body, "put").expect(404);
  await send(
    a,
    `/companies/${bCompany.id}/branches/${paris.id}`,
    body,
    "put",
  ).expect(404);
  await send(a, path + "/" + paris.id, { ...body, city: "Lyon" }, "put").expect(
    200,
  );
  const customer = (
    await a.agent.get("/api/companies").expect(200)
  ).body.companies.find((c) => c.id === aCompany.id);
  assert.equal(customer.branches.length, 2);
  assert.equal(customer.branches.find((v) => v.id === paris.id).city, "Lyon");
  assert.ok(
    (await b.agent.get("/api/companies").expect(200)).body.companies.every(
      (c) => !c.branches.some((v) => v.id === paris.id),
    ),
  );
  const ticketBody = {
    title: "International branch request",
    company_id: aCompany.id,
    branch_id: paris.id,
    description: "Service abroad",
    category: "Mantenimiento",
    priority: "Media",
    custom_fields: { asset: "FR-01" },
  };
  const ticket = (await send(a, "/tickets", ticketBody).expect(201)).body
    .ticket;
  assert.equal(ticket.branch_id, paris.id);
  assert.equal(ticket.site, "Paris");
  assert.equal(
    (await a.agent.get("/api/tickets?country_code=FR")).body.total,
    1,
  );
  assert.equal(
    (await a.agent.get("/api/tickets?country_code=MX")).body.total,
    0,
  );
  assert.equal(
    (await b.agent.get("/api/tickets?country_code=FR")).body.total,
    0,
  );
  await a.agent.get("/api/tickets?country_code=XX").expect(400);
  await send(b, "/tickets", { ...ticketBody, company_id: bCompany.id }).expect(
    400,
  );
  const other = (
    await pool.query(
      "INSERT INTO companies(tenant_id,name,sector,site) VALUES($1,'Other branch customer','Services','HQ') RETURNING id",
      [a.user.tenant_id],
    )
  ).rows[0];
  await send(a, "/tickets", { ...ticketBody, company_id: other.id }).expect(
    400,
  );
  await assert.rejects(
    pool.query("UPDATE tickets SET company_id=$1 WHERE id=$2", [
      other.id,
      ticket.id,
    ]),
    { code: "23503" },
  );
  await pool.query("DELETE FROM companies WHERE id=$1", [other.id]);
  await send(a, "/preferences", { language: "fr" }, "put").expect(200);
  assert.equal(
    (await a.agent.get("/api/me").expect(200)).body.user.language,
    "fr",
  );
  assert.notEqual(
    (await b.agent.get("/api/me").expect(200)).body.user.language,
    "fr",
  );
  assert.equal(
    (await a.agent.get("/api/workspace").expect(200)).body.workspace.settings
      .language,
    "es",
  );
  await send(a, "/preferences", { language: "xx" }, "put").expect(400);
  const fresh = request.agent(app),
    boot = await fresh.get("/api/bootstrap");
  const login = await fresh
    .post("/api/login")
    .set("X-CSRF-Token", boot.body.csrf)
    .send({ email: a.credentials.email, password: a.credentials.password })
    .expect(200);
  assert.equal(login.body.user.language, "fr");
  await send(a, "/preferences", { language: "es" }, "put").expect(200);
});
test("CSV and XLSX imports validate mappings, isolate data and persist rows transactionally", async () => {
  const upload = {
    format: "csv",
    file: Buffer.from("name,sector,site\nNew customer,Health,Main\n").toString(
      "base64",
    ),
  };
  const preview = await send(b, "/import/preview", upload).expect(200);
  assert.equal(preview.body.total, 1);
  const mapping = { name: "name", sector: "sector", site: "site" };
  await send(b, "/import/commit", {
    ...upload,
    kind: "companies",
    mapping,
    confirm: false,
  }).expect(400);
  await send(b, "/import/commit", {
    ...upload,
    kind: "companies",
    mapping,
    confirm: true,
  }).expect(201);
  assert.equal((await b.agent.get("/api/companies")).body.companies.length, 2);
  assert.equal((await a.agent.get("/api/companies")).body.companies.length, 1);
  const workbook = new ExcelJS.Workbook(),
    sheet = workbook.addWorksheet("Customers");
  sheet.addRow(["name", "sector", "site"]);
  sheet.addRow(["Excel customer", "Retail", "North"]);
  const excel = {
    format: "xlsx",
    file: Buffer.from(await workbook.xlsx.writeBuffer()).toString("base64"),
  };
  await send(b, "/import/commit", {
    ...excel,
    kind: "companies",
    mapping,
    confirm: true,
  }).expect(201);
  const tickets = {
    format: "csv",
    file: Buffer.from(
      "title,company,site,category,description,priority\nImported,New customer,Main,Servicio,Imported description,Media\nWrong,Unknown company,Main,Servicio,Bad,Baja",
    ).toString("base64"),
  };
  await send(b, "/import/commit", {
    ...tickets,
    kind: "tickets",
    mapping: Object.fromEntries(
      ["title", "company", "site", "category", "description", "priority"].map(
        (k) => [k, k],
      ),
    ),
    confirm: true,
  }).expect(400);
  assert.equal((await b.agent.get("/api/tickets")).body.tickets.length, 0);
  const customUpload = {
    format: "csv",
    file: Buffer.from(
      `title,company,site,category,description,priority,asset\nImported custom field,${aCompany.name},Main,Mantenimiento,Imported with asset,Baja,EQ-CSV\n`,
    ).toString("base64"),
  };
  const ticketMapping = Object.fromEntries(
    ["title", "company", "site", "category", "description", "priority"].map(
      (key) => [key, key],
    ),
  );
  await send(a, "/import/commit", {
    ...customUpload,
    kind: "tickets",
    mapping: ticketMapping,
    confirm: true,
  }).expect(400);
  await send(a, "/import/commit", {
    ...customUpload,
    kind: "tickets",
    mapping: { ...ticketMapping, custom_asset: "asset" },
    confirm: true,
  }).expect(201);
  const imported = (
    await a.agent.get("/api/tickets?q=Imported%20custom%20field").expect(200)
  ).body;
  assert.equal(imported.tickets[0].custom_fields.asset, "EQ-CSV");
});
test("SLA escalations run once, stay in the workspace and queue the configured notification", async () => {
  const { runAutomations } = await import("../server/automations.js");
  await pool.query(
    "UPDATE tenants SET settings=jsonb_set(settings,'{escalations}',$1) WHERE id=$2",
    [
      JSON.stringify([
        {
          priority: "Alta",
          after_hours: 0.25,
          agent_id: agentA.id,
          notify: true,
        },
      ]),
      a.user.tenant_id,
    ],
  );
  await pool.query(
    "UPDATE tickets SET due_at=now()-interval '2 hours' WHERE id=$1",
    [ticketA.id],
  );
  await runAutomations();
  await runAutomations();
  const {
    rows: [t],
  } = await pool.query("SELECT escalated_at FROM tickets WHERE id=$1", [
    ticketA.id,
  ]);
  assert.ok(t.escalated_at);
  const {
    rows: [count],
  } = await pool.query(
    "SELECT count(*) FROM workspace_audit WHERE tenant_id=$1 AND action='ticket.escalated'",
    [a.user.tenant_id],
  );
  assert.equal(Number(count.count), 1);
});
test("Recovery reports missing email service honestly without revealing accounts or issuing tokens", async () => {
  const smtp = process.env.SMTP_URL;
  delete process.env.SMTP_URL;
  try {
    assert.equal(
      (await a.agent.get("/api/bootstrap")).body.recoveryAvailable,
      false,
    );
    const before = (
      await pool.query(
        "SELECT count(*) FROM account_tokens WHERE user_id=$1 AND purpose='reset'",
        [a.user.id],
      )
    ).rows[0].count;
    const known = await send(a, "/account/recover", {
      email: a.credentials.email,
    }).expect(503);
    const unknown = await send(a, "/account/recover", {
      email: "missing-" + randomUUID() + "@example.test",
    }).expect(503);
    assert.deepEqual(known.body, unknown.body);
    assert.equal(
      (
        await pool.query(
          "SELECT count(*) FROM account_tokens WHERE user_id=$1 AND purpose='reset'",
          [a.user.id],
        )
      ).rows[0].count,
      before,
    );
  } finally {
    process.env.SMTP_URL = smtp;
  }
});
test("Email verification and recovery links are single use, expire and revoke existing sessions on reset", async () => {
  const {
    rows: [message],
  } = await pool.query(
    "SELECT body FROM notification_outbox WHERE tenant_id=$1 AND subject='Service Hub · Confirma tu correo' ORDER BY id DESC LIMIT 1",
    [a.user.tenant_id],
  );
  const token = message.body.split("#")[1].split("\n")[0];
  await send(a, "/account/verify", { token }).expect(200);
  await send(a, "/account/verify", { token }).expect(400);
  await send(a, "/account/reset", {
    token: "wrong",
    password: "New-password-2026!",
  }).expect(400);
  const r = await send(a, "/account/recover", {
    email: a.credentials.email,
  }).expect(200);
  const unknown = await send(a, "/account/recover", {
    email: `missing-${randomUUID()}@example.test`,
  }).expect(200);
  assert.deepEqual(r.body, unknown.body);
  const {
    rows: [reset],
  } = await pool.query(
    "SELECT body FROM notification_outbox WHERE tenant_id=$1 AND subject='Service Hub · Restablecer contraseña' ORDER BY id DESC LIMIT 1",
    [a.user.tenant_id],
  );
  const resetToken = reset.body.split("#")[1].split("\n")[0];
  const fresh = request.agent(app),
    boot = await fresh.get("/api/bootstrap");
  await fresh
    .post("/api/account/reset")
    .set("X-CSRF-Token", boot.body.csrf)
    .send({ token: resetToken, password: "New-password-2026!" })
    .expect(200);
  await a.agent.get("/api/me").expect(401);
  const login = await fresh
    .post("/api/login")
    .set("X-CSRF-Token", boot.body.csrf)
    .send({ email: a.credentials.email, password: "New-password-2026!" })
    .expect(200);
  a.agent = fresh;
  a.csrf = login.body.csrf;
});
test("Olivia configuration proposals are tenant-scoped, quota-limited and require explicit, non-stale approval", async () => {
  const oldFetch = globalThis.fetch;
  const saved = {
    url: process.env.OLIVIA_BASE_URL,
    key: process.env.OLIVIA_API_KEY,
    ready: process.env.OLIVIA_TENANT_READY,
  };
  process.env.OLIVIA_BASE_URL = "https://olivia.example.test/";
  process.env.OLIVIA_API_KEY = "fixture-not-a-real-key";
  process.env.OLIVIA_TENANT_READY = "true";
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).pathname, "/chat");
    const body = JSON.parse(options.body);
    assert.equal(body.scope, `tenant-${a.user.tenant_id}-user-${a.user.id}`);
    return new Response(
      JSON.stringify({
        answer: JSON.stringify({
          categories: ["Mantenimiento"],
          fields: [
            { key: "asset", label: "Equipo", type: "text", required: true },
          ],
        }),
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  };
  try {
    const one = (
      await send(a, "/workspace/suggestions", {
        goal: "Mantener los equipos de nuestros clientes",
      }).expect(200)
    ).body.proposal;
    const two = (
      await send(a, "/workspace/suggestions", {
        goal: "Proponer un formulario de equipos",
      }).expect(200)
    ).body.proposal;
    await send(a, "/workspace/suggestions/" + one.id + "/apply", {
      approved: false,
    }).expect(400);
    await send(b, "/workspace/suggestions/" + one.id + "/apply", {
      approved: true,
    }).expect(404);
    await send(a, "/workspace/suggestions/" + one.id + "/apply", {
      approved: true,
    }).expect(200);
    await send(a, "/workspace/suggestions/" + one.id + "/apply", {
      approved: true,
    }).expect(404);
    await send(a, "/workspace/suggestions/" + two.id + "/apply", {
      approved: true,
    }).expect(409);
    await pool.query("UPDATE tenants SET ai_limit=0 WHERE id=$1", [
      a.user.tenant_id,
    ]);
    await send(a, "/workspace/suggestions", {
      goal: "Una nueva propuesta",
    }).expect(429);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of [
      ["OLIVIA_BASE_URL", saved.url],
      ["OLIVIA_API_KEY", saved.key],
      ["OLIVIA_TENANT_READY", saved.ready],
    ])
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
});
test("Concurrent user creation respects seat cap; expired trials retain data read only", async () => {
  await pool.query("UPDATE tenants SET seat_limit=3 WHERE id=$1", [
    a.user.tenant_id,
  ]);
  const bodies = [1, 2].map((i) => ({
    name: "Concurrent " + i,
    email: `concurrent-${randomUUID()}@example.test`,
    password: "Secure-password-2026!",
    role: "agent",
  }));
  const results = await Promise.all(
    bodies.map((body) => send(a, "/users", body)),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  await pool.query(
    "UPDATE tenants SET trial_ends_at=now()-interval '1 minute' WHERE id=$1",
    [a.user.tenant_id],
  );
  await a.agent.get("/api/tickets").expect(200);
  await send(a, `/tickets/${ticketA.id}/actions`, {
    action: "note",
    body: "Blocked write",
  }).expect(402);
  await a.agent.get("/api/billing").expect(200);
  assert.equal(
    (await a.agent.get("/api/workspace")).body.workspace.access,
    "read_only",
  );
});
test("Invitation acceptance uses a hashed single-use token and cannot elevate role or tenant", async () => {
  await send(b, "/invitations", {
    email: `invited-${randomUUID()}@example.test`,
    name: "Invited",
    role: "platform_admin",
  }).expect(400);
  const address = `invited-${randomUUID()}@example.test`;
  await send(b, "/invitations", {
    email: address,
    name: "Invited",
    role: "agent",
  }).expect(201);
  const {
    rows: [message],
  } = await pool.query(
    "SELECT body FROM notification_outbox WHERE tenant_id=$1 AND recipient=$2",
    [b.user.tenant_id, address],
  );
  const token = message.body.split("#").at(-1);
  const fresh = request.agent(app),
    boot = await fresh.get("/api/bootstrap");
  const accepted = await fresh
    .post("/api/invitations/accept")
    .set("X-CSRF-Token", boot.body.csrf)
    .send({
      token,
      password: "Invitation-password-2026!",
      role: "platform_admin",
      tenant_id: a.user.tenant_id,
    })
    .expect(201);
  assert.equal(accepted.body.user.tenant_id, b.user.tenant_id);
  assert.equal(accepted.body.user.role, "agent");
  await fresh
    .post("/api/invitations/accept")
    .set("X-CSRF-Token", accepted.body.csrf)
    .send({ token, password: "Invitation-password-2026!" })
    .expect(400);
  await fresh.get("/api/platform").expect(403);
  await fresh.get("/api/users").expect(403);
});
test("Checkout consents to a one-time USD activation and a recurring user plan", async () => {
  await pool.query("UPDATE users SET email_verified_at=now() WHERE id=$1", [
    b.user.id,
  ]);
  const {
    rows: [old],
  } = await pool.query("SELECT * FROM billing_plans WHERE id='team-5'");
  try {
    await pool.query(
      "UPDATE billing_plans SET monthly_cents=2500,unit_cents=500,discounts='{" +
        '"1":0,"3":5,"6":10,"12":15' +
        "}' WHERE id='team-5'",
    );
    await send(b, "/billing/checkout", {
      plan_id: "team-5",
      months: 3,
      accepted_terms: false,
    }).expect(400);
    await send(b, "/billing/checkout", {plan_id:"team-5",seats:2,months:3,accepted_terms:true}).expect(400);
    await send(b, "/billing/checkout", {
      plan_id: "team-5",
      seats: 7,
      months: 3,
      accepted_terms: true,
    }).expect(200);
    assert.equal(checkoutBody.mode, "subscription");
    assert.equal(checkoutBody.subscription_data.billing_mode.type, "flexible");
    assert.equal(checkoutBody.line_items.length, 2);
    assert.equal(
      checkoutBody.subscription_data.metadata.tenant_id,
      String(b.user.tenant_id),
    );
    assert.equal(checkoutBody.subscription_data.trial_end, undefined);
    assert.ok(
      checkoutBody.custom_text.submit.message.includes(
        "Activación: 149 USD HT una sola vez",
      ),
    );
    const activation = createdPrices.get(checkoutBody.line_items[0].price),
      users = createdPrices.get(checkoutBody.line_items[1].price);
    assert.equal(activation.currency, "usd");
    assert.equal(activation.unit_amount, 14900);
    assert.equal(activation.recurring, undefined);
    assert.equal(users.currency, "usd");
    assert.equal(users.unit_amount, 9975);
    assert.equal(users.metadata.seat_limit, "7");
    assert.equal(users.recurring.interval_count, 3);
    assert.equal(users.tax_behavior, "exclusive");
    assert.equal(activation.tax_behavior, "exclusive");
    assert.equal(checkoutBody.automatic_tax.enabled, true);
    assert.equal(checkoutBody.billing_address_collection, "required");
    assert.equal(checkoutBody.tax_id_collection.enabled, true);
  } finally {
    await pool.query(
      "UPDATE billing_plans SET monthly_cents=$1,discounts=$2,unit_cents=$4 WHERE id=$3",
      [old.monthly_cents, old.discounts, old.id, old.unit_cents],
    );
  }
});
const signed = (event) => {
  const payload = JSON.stringify(event);
  const signature = sdk.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  return request(app)
    .post("/api/billing/webhook")
    .set("Content-Type", "application/json")
    .set("Stripe-Signature", signature)
    .send(payload);
};
test("USD activation requires verified paid checkout, is idempotent and is never charged on resubscription", async () => {
  const m = await register("USD");
  await pool.query("UPDATE users SET email_verified_at=now() WHERE id=$1", [
    m.user.id,
  ]);
  await send(m, "/billing/checkout", {
    plan_id: "team-5",
    seats: 10,
    months: 12,
    accepted_terms: true,
  }).expect(200);
  const invoiceUsers = createdPrices.get(checkoutBody.line_items[1].price),
    activation = createdPrices.get(checkoutBody.line_items[0].price);
  assert.equal(activation.recurring, undefined);
  assert.equal(invoiceUsers.unit_amount, 240000);
  const stored = (
    await pool.query(
      "SELECT checkout_session_id,checkout_total_cents FROM tenants WHERE id=$1",
      [m.user.tenant_id],
    )
  ).rows[0];
  subscription = {
    id: "sub_fixture_usd",
    customer: "cus_fixture_" + m.user.tenant_id,
    metadata: {
      tenant_id: String(m.user.tenant_id),
      billing_model: "activation_usd_v1",
    },
    status: "active",
    livemode: false,
    cancel_at_period_end: false,
    items: {
      data: [
        {
          id: "si_fixture_usd",
          quantity: 1,
          price: invoiceUsers,
          current_period_end: 1900000000,
        },
      ],
    },
  };
  const subscriptionEvent = {
    id: "evt_fixture_" + randomUUID(),
    type: "customer.subscription.updated",
    livemode: false,
    data: { object: { id: subscription.id } },
  };
  await signed(subscriptionEvent).expect(200);
  assert.equal((await m.agent.get("/api/billing")).body.activation_paid, false);
  assert.equal((await m.agent.get("/api/billing")).body.seat_limit, 5);
  const completed = {
    id: "evt_fixture_" + randomUUID(),
    type: "checkout.session.completed",
    livemode: false,
    data: {
      object: {
        id: stored.checkout_session_id,
        mode: "subscription",
        subscription: subscription.id,
        customer: subscription.customer,
        currency: "usd",
        amount_total: stored.checkout_total_cents,
        payment_status: "unpaid",
      },
    },
  };
  await signed(completed).expect(200);
  assert.equal((await m.agent.get("/api/billing")).body.activation_paid, false);
  await signed({
    ...completed,
    id: "evt_fixture_" + randomUUID(),
    data: {
      object: {
        ...completed.data.object,
        payment_status: "paid",
        amount_total: 1,
      },
    },
  }).expect(200);
  assert.equal((await m.agent.get("/api/billing")).body.activation_paid, false);
  const paid = {
    ...completed,
    id: "evt_fixture_" + randomUUID(),
    data: { object: { ...completed.data.object, payment_status: "paid",
      automatic_tax: {enabled:true,status:"complete"},
      amount_subtotal: stored.checkout_total_cents,
      total_details: {amount_tax:16000,amount_discount:0,amount_shipping:0},
      amount_total: stored.checkout_total_cents+16000,
    } },
  };
  await signed({...paid,id:"evt_fixture_"+randomUUID(),data:{object:{...paid.data.object,amount_total:1}}}).expect(200);
  assert.equal((await m.agent.get("/api/billing")).body.activation_paid,false);
  await signed(paid).expect(200);
  await signed(paid).expect(200);
  const bill = (await m.agent.get("/api/billing")).body;
  assert.equal(bill.activation_paid, true);
  assert.equal(bill.status, "active");
  assert.equal(bill.seat_limit, 10);
  const recurring = (
    await pool.query(
      "SELECT monthly_recurring_cents FROM tenants WHERE id=$1",
      [m.user.tenant_id],
    )
  ).rows[0].monthly_recurring_cents;
  assert.equal(recurring, Math.round(240000 / 12));
  await send(m, "/billing/change-plan", {
    plan_id: "team-15",
    months: 12,
    accepted_terms: true,
  }).expect(200);
  assert.equal(subscriptionUpdate.items.length, 1);
  assert.equal(
    createdPrices.get(subscriptionUpdate.items[0].price).metadata.kind,
    "users",
  );
  subscription.status = "canceled";
  await signed({
    ...subscriptionEvent,
    id: "evt_fixture_" + randomUUID(),
  }).expect(200);
  await send(m, "/billing/checkout", {
    plan_id: "team-5",
    months: 1,
    accepted_terms: true,
  }).expect(200);
  assert.equal(checkoutBody.line_items.length, 1);
  assert.equal(
    createdPrices.get(checkoutBody.line_items[0].price).metadata.kind,
    "users",
  );
  assert.ok(
    checkoutBody.custom_text.submit.message.includes("Activación: 0 USD"),
  );
  // Late events from the retired subscription cannot capture the new checkout.
  await signed({
    ...subscriptionEvent,
    id: "evt_fixture_" + randomUUID(),
  }).expect(200);
  assert.equal(
    (
      await pool.query(
        "SELECT stripe_subscription_id FROM tenants WHERE id=$1",
        [m.user.tenant_id],
      )
    ).rows[0].stripe_subscription_id,
    null,
  );
});
test("Signed webhooks sync current Stripe state, reject forged/live events and handle duplicates", async () => {
  await pool.query(
    "UPDATE tenants SET billing_model='legacy_usd_v1',billing_currency='usd' WHERE id=$1",
    [b.user.tenant_id],
  );
  subscription = {
    id: "sub_fixture",
    livemode: false,
    customer: "cus_fixture_" + b.user.tenant_id,
    metadata: { tenant_id: String(b.user.tenant_id) },
    status: "active",
    cancel_at_period_end: false,
    items: {
      data: [
        {
          quantity: 1,
          price: {
            unit_amount: 39900,
            currency: "usd",
            recurring: { interval: "year", interval_count: 1 },
            metadata: { kind: "license" },
          },
          current_period_end: 1900000000,
        },
        {
          quantity: 1,
          price: {
            unit_amount: 7125,
            currency: "usd",
            recurring: { interval: "month", interval_count: 3 },
            metadata: {
              kind: "users",
              plan_id: "team-5",
              seat_limit: "5",
              ai_limit: "100",
            },
          },
          current_period_end: 1800000000,
        },
      ],
    },
  };
  await request(app)
    .post("/api/billing/webhook")
    .set("Content-Type", "application/json")
    .send("{}")
    .expect(400);
  const event = {
    id: "evt_fixture_" + randomUUID(),
    type: "customer.subscription.updated",
    livemode: false,
    data: { object: { id: subscription.id } },
  };
  assert.ok(createdProducts.some(p => p.metadata.kind === "activation" && p.tax_code === "txcd_20120002"));
  assert.ok(createdProducts.some(p => p.metadata.kind === "users" && p.tax_code === "txcd_10103001"));
  await signed({ ...event, livemode: true }).expect(400);
  const previousMode = process.env.STRIPE_MODE;
  try {
    process.env.STRIPE_MODE = "live";
    const probe = { id: "evt_live_probe_" + randomUUID(), type: "servicehub.mode_check", livemode: true, data: { object: {} } };
    await signed(probe).expect(200);
    await signed({ ...probe, livemode: false }).expect(400);
    // A signed live event must still reject a subscription fetched from test mode.
    await signed({ ...event, id: "evt_wrong_subscription_" + randomUUID(), livemode: true }).expect(400);
  } finally {
    if (previousMode === undefined) delete process.env.STRIPE_MODE;
    else process.env.STRIPE_MODE = previousMode;
  }
  await signed(event).expect(200);
  await signed(event).expect(200);
  const {
    rows: [count],
  } = await pool.query("SELECT count(*) FROM billing_events WHERE id=$1", [
    event.id,
  ]);
  assert.equal(Number(count.count), 1);
  const billing = (await b.agent.get("/api/billing")).body;
  assert.equal(billing.status, "active");
  assert.equal(billing.plan_id, "team-5");
  assert.equal(billing.months, 3);
  subscription.status = "past_due";
  await signed({ ...event, id: "evt_fixture_" + randomUUID() }).expect(200);
  assert.equal(
    (await b.agent.get("/api/workspace")).body.workspace.access,
    "full",
  );
  await pool.query(
    "UPDATE tenants SET grace_ends_at=now()-interval '1 minute' WHERE id=$1",
    [b.user.tenant_id],
  );
  assert.equal(
    (await b.agent.get("/api/workspace")).body.workspace.access,
    "read_only",
  );
});
test("A signed removal of the mandatory annual license suspends access instead of preserving paid entitlements", async () => {
  subscription.items.data[0].quantity = 2;
  await signed({
    id: "evt_fixture_" + randomUUID(),
    type: "customer.subscription.updated",
    livemode: false,
    data: { object: { id: subscription.id } },
  }).expect(200);
  assert.equal(
    (await b.agent.get("/api/workspace")).body.workspace.status,
    "suspended",
  );
  await b.agent.get("/api/tickets").expect(403);
  await b.agent.get("/api/billing").expect(200);
});
test("Commercial mode disables illustrative identities and live Stripe requires explicit mode", async () => {
  process.env.COMMERCIAL_MODE = "true";
  try {
    const fresh = request.agent(app),
      boot = await fresh.get("/api/bootstrap").set("X-Client-Portal", "1");
    await fresh
      .post("/api/demo/client-login")
      .set("X-Client-Portal", "1")
      .set("X-CSRF-Token", boot.body.csrf)
      .send({})
      .expect(404);
  } finally {
    delete process.env.COMMERCIAL_MODE;
  }
  const { stripeClient } = await import("../server/billing.js");
  const old = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_live_should_never_be_used";
  try {
    assert.throws(stripeClient, { status: 503 });
    const previousMode = process.env.STRIPE_MODE;
    try {
      process.env.STRIPE_MODE = "live";
      assert.doesNotThrow(stripeClient);
      process.env.STRIPE_SECRET_KEY = "sk_test_wrong_mode";
      assert.throws(stripeClient, { status: 503 });
    } finally {
      if (previousMode === undefined) delete process.env.STRIPE_MODE;
      else process.env.STRIPE_MODE = previousMode;
    }
  } finally {
    if (old) process.env.STRIPE_SECRET_KEY = old;
    else delete process.env.STRIPE_SECRET_KEY;
  }
});

test('USD default preserves existing MXN subscription amounts, currency and activation validation',async()=>{
 const old=await register('Existing MXN');
 await pool.query("UPDATE tenants SET billing_currency='mxn',billing_model='activation_mxn_v1',stripe_customer_id=$2,stripe_subscription_id=$3,checkout_session_id=$4,checkout_activation_cents=299900,checkout_total_cents=499400 WHERE id=$1",[old.user.tenant_id,'cus_old_'+old.user.tenant_id,'sub_old_'+old.user.tenant_id,'cs_old_'+old.user.tenant_id]);
 subscription={id:'sub_old_'+old.user.tenant_id,customer:'cus_old_'+old.user.tenant_id,metadata:{tenant_id:String(old.user.tenant_id),billing_model:'activation_mxn_v1'},status:'active',livemode:false,cancel_at_period_end:false,items:{data:[{quantity:1,current_period_end:1900000000,price:{currency:'mxn',unit_amount:199500,recurring:{interval:'month',interval_count:1},metadata:{kind:'users',plan_id:'team-5',seat_limit:'5',ai_limit:'100'}}}]}};
 await signed({id:'evt_old_'+randomUUID(),type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_old_'+old.user.tenant_id,mode:'subscription',subscription:subscription.id,customer:subscription.customer,currency:'mxn',amount_total:499400,payment_status:'paid'}}}).expect(200);
 const bill=(await old.agent.get('/api/billing')).body;
 assert.equal(bill.currency,'mxn');assert.equal(bill.offer_currency,'usd');assert.equal(bill.activation_paid,true);assert.equal(bill.status,'active');assert.equal(bill.migration_required,true);assert.equal(bill.activation_cents,299900);
 const {rows:[stored]}=await pool.query('SELECT monthly_recurring_cents FROM tenants WHERE id=$1',[old.user.tenant_id]);assert.equal(stored.monthly_recurring_cents,199500);
});
