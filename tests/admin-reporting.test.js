import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../server/app.js";
import { pool } from "../server/db.js";
import { reportData } from "../server/reporting.js";
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

test("Mexico reporting includes the full final day on a UTC database", async()=>{
 const client=await login('cliente@example.test');const db=await pool.connect();
 try{
  await db.query('BEGIN');await db.query("SET LOCAL TIME ZONE 'UTC'");
  for(const created of ['2026-01-15T05:59:59Z','2026-01-15T06:00:00Z','2026-01-16T05:59:59Z','2026-01-16T06:00:00Z'])await db.query("INSERT INTO tickets(title,company_id,site,category,description,priority,requested_priority,created_by,created_at,due_at) VALUES('QA timezone',$1,'Sede QA','Servicio','QA','Media','Media',$2,$3,$3::timestamptz + interval '24 hours')",[client.user.company_id,client.user.id,created]);
  const report=await reportData(client.user,{start:'2026-01-15',end:'2026-01-15'},db);assert.equal(report.metrics.total,2);assert.equal(report.series[0].created,2);
 }finally{await db.query('ROLLBACK');db.release();}
});

test('Reports include older scoped backlog, exact previous period and public staff response times without inventing missing durations',async()=>{
 const client=await login('cliente@example.test'),agent=await login('agente@example.test'),db=await pool.connect();
 try{await db.query('BEGIN');const{rows:[company]}=await db.query("INSERT INTO companies(name,sector,site,tenant_id) VALUES($1,'QA','QA',$2) RETURNING id",['Reporting '+randomUUID(),client.user.tenant_id]);const user={...client.user,company_id:company.id};
 const ids=[];for(const[at,status,resolved]of[['2026-01-14T12:00:00Z','Abierto',null],['2026-01-15T12:00:00Z','Abierto',null],['2026-01-15T13:00:00Z','Cerrado',null],['2026-01-15T14:00:00Z','Resuelto','2026-01-15T15:00:00Z']]){const{rows:[t]}=await db.query("INSERT INTO tickets(title,company_id,site,category,description,priority,requested_priority,created_by,agent_id,created_at,due_at,status,resolved_at,tenant_id) VALUES('Reporting QA',$1,'QA','Servicio','QA','Media','Media',$2,$3,$4,'2026-01-16T12:00:00Z',$5,$6,$7) RETURNING id",[company.id,client.user.id,agent.user.id,at,status,resolved,client.user.tenant_id]);ids.push(t.id);}
 for(const[actor,internal,time]of[[client.user.id,false,'2026-01-15T14:05:00Z'],[agent.user.id,true,'2026-01-15T14:10:00Z'],[agent.user.id,false,'2026-01-15T15:00:00Z']])await db.query("INSERT INTO events(ticket_id,actor_id,kind,body,internal,created_at,tenant_id) VALUES($1,$2,'reply','QA',$3,$4,$5)",[ids[3],actor,internal,time,client.user.tenant_id]);
 const r=await reportData(user,{start:'2026-01-15',end:'2026-01-15'},db);assert.equal(r.metrics.total,3);assert.equal(r.metrics.resolved,2);assert.equal(r.metrics.sla_samples,1);assert.equal(r.metrics.sla_percent,100);assert.equal(r.metrics.average_resolution_hours,1);assert.equal(r.comparison.total,1);assert.equal(r.comparison.start,'2026-01-14');assert.equal(r.comparison.volume_change_percent,200);assert.equal(r.workload.total,2);assert.equal(r.workload.aging.reduce((s,b)=>s+b.count,0),2);assert.equal(r.first_response.answered,1);assert.equal(r.first_response.average_hours,1);assert.equal(r.performance.length,1);assert.equal(r.performance[0].total,3);
 }finally{await db.query('ROLLBACK');db.release();}
});
