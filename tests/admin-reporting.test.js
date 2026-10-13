import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../server/app.js";
import { pool } from "../server/db.js";
const app = createApp();
after(() => pool.end());
async function login(email) {
  const credentials = JSON.parse(
    await readFile(".local/demo-access.json", "utf8"),
  );
  const a = request.agent(app),
    boot = await a.get("/api/bootstrap");
  const data = await a
    .post("/api/login")
    .set("X-CSRF-Token", boot.body.csrf)
    .send(credentials.find((c) => c.email === email))
    .expect(200);
  return { a, csrf: data.body.csrf, user: data.body.user };
}
const post = (u, path, body) =>
  u.a
    .post("/api" + path)
    .set("X-CSRF-Token", u.csrf)
    .send(body);
test("Global administration, manager restrictions and immediate account suspension", async () => {
  const superadmin = await login("olivier.steineur@o7digitalgroup.com"),
    admin = await login("admin@example.test"),
    manager = await login("gerente@example.test"),
    client = await login("cliente@example.test");
  assert.equal(superadmin.user.role, "platform_admin");
  for (const u of [superadmin, admin, manager])
    assert.equal((await u.a.get("/api/companies")).body.companies.length, 20);
  const email = `qa-${randomUUID()}@example.test`,
    password = "LongQA-password-123";
  let created;
  try {
    await post(client, "/users", {
      email,
      password,
      name: "QA",
      role: "agent",
    }).expect(403);
    await post(manager, "/users", {
      email,
      password,
      name: "QA",
      role: "admin",
    }).expect(403);
    await post(admin, "/users", {
      email,
      password,
      name: "QA",
      role: "platform_admin",
    }).expect(403);
    created = (
      await post(manager, "/users", {
        email,
        password,
        name: "QA client",
        role: "client",
        company_id: client.user.company_id,
      }).expect(201)
    ).body.user;
    const a = request.agent(app),
      boot = await a.get("/api/bootstrap");
    await a
      .post("/api/login")
      .set("X-CSRF-Token", boot.body.csrf)
      .send({ email, password })
      .expect(200);
    await post(manager, "/users/" + manager.user.id + "/access", {
      active: false,
    }).expect(403);
    await post(admin, "/users/" + superadmin.user.id + "/access", {
      active: false,
    }).expect(403);
    await post(manager, "/users/" + created.id + "/access", {
      active: false,
    }).expect(200);
    await a.get("/api/me").expect(401);
    await post(manager, "/users/" + created.id + "/access", {
      active: true,
    }).expect(200);
  } finally {
    if (created) {
      await pool.query("DELETE FROM user_audit WHERE subject_id=$1", [
        created.id,
      ]);
      await pool.query("DELETE FROM users WHERE id=$1", [created.id]);
    }
  }
});
test("Scoped charts, durable reporting and Hugging Face readiness", async () => {
  const client = await login("cliente@example.test"),
    other = await login("cliente2@example.test"),
    admin = await login("admin@example.test"),
    agent = await login("agente@example.test");
  const own = (await client.a.get("/api/analytics").expect(200)).body;
  assert.equal(own.scope, "empresa");
  assert.equal(own.filters.company_id, client.user.company_id);
  assert.equal(own.companies.length, 1);
  await client.a
    .get("/api/analytics?company_id=" + other.user.company_id)
    .expect(403);
  await client.a.get("/api/analytics?start=2026-02-30").expect(400);
  await client.a
    .get("/api/analytics?start=2024-01-01&end=2026-01-01")
    .expect(400);
  assert.ok(
    (await admin.a.get("/api/analytics")).body.metrics.total >
      own.metrics.total,
  );
  assert.equal(
    (await agent.a.get("/api/analytics")).body.metrics.total,
    (await agent.a.get("/api/tickets")).body.tickets.length,
  );
  const report = (
    await post(client, "/reports", { filters: own.filters }).expect(201)
  ).body.report;
  try {
    assert.deepEqual(report.snapshot.metrics, own.metrics);
    assert.ok(
      (await client.a.get("/api/reports")).body.reports.some(
        (r) => r.id === report.id,
      ),
    );
    assert.ok(
      !(await other.a.get("/api/reports")).body.reports.some(
        (r) => r.id === report.id,
      ),
    );
    await post(client, "/reports", { filters: own.filters, ai: true }).expect(
      424,
    );
  } finally {
    await pool.query("DELETE FROM reports WHERE id=$1", [report.id]);
  }
});
test("Floating chat conversation ownership, persistent demo and scoped live adapter", async () => {
  const client = await login("cliente@example.test"),
    other = await login("cliente2@example.test");
  const conversation = (
    await post(client, "/chat/conversations", {}).expect(201)
  ).body.conversation;
  try {
    await other.a.get("/api/chat/conversations/" + conversation.id).expect(404);
    await post(other, "/chat/conversations/" + conversation.id + "/messages", {
      message: "Intrusión",
    }).expect(404);
    const response = await post(
      client,
      "/chat/conversations/" + conversation.id + "/messages",
      { message: "Resume mi servicio" },
    ).expect(200);
    assert.equal(response.body.mode, "demo");
    assert.equal(
      (await client.a.get("/api/chat/conversations/" + conversation.id)).body
        .messages.length,
      2,
    );
    const tickets = (await other.a.get("/api/tickets")).body.tickets;
    await post(client, "/chat/conversations/" + conversation.id + "/messages", {
      message: "Otro caso",
      ticket_id: tickets[0].id,
    }).expect(404);
    const originalFetch = globalThis.fetch;
    process.env.OLIVIA_BASE_URL = "https://olivia.example.test/maxcess-dev/";
    process.env.OLIVIA_API_KEY = "test-only-key";
    globalThis.fetch = async (url, options) => {
      assert.equal(String(url), "https://olivia.example.test/maxcess-dev/chat");
      const payload = JSON.parse(options.body);
      assert.equal(payload.scope, "client-" + client.user.company_id);
      assert.ok(!payload.message.includes("nota confidencial"));
      return new Response(
        JSON.stringify({
          answer: "Respuesta verificada",
          conversation_id: randomUUID(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    try {
      const r = await post(
        client,
        "/chat/conversations/" + conversation.id + "/messages",
        { message: "Mi caso", scope: "global" },
      ).expect(200);
      assert.equal(r.body.mode, "live");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.OLIVIA_BASE_URL;
      delete process.env.OLIVIA_API_KEY;
    }
  } finally {
    await pool.query("DELETE FROM ai_messages WHERE conversation_id=$1", [
      conversation.id,
    ]);
    await pool.query("DELETE FROM ai_conversations WHERE id=$1", [
      conversation.id,
    ]);
  }
});
