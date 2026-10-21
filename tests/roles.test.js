import { test, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app.js";
import { pool } from "../server/db.js";
const previous = process.env.REGISTRATION_ENABLED;
process.env.REGISTRATION_ENABLED = "true";
process.env.PUBLIC_APP_URL ||= "https://servicehub.example.org";
const app = createApp(),
  tenants = [];
const password = "Roles-password-2026!";
const send = (u, path, body, method = "post") =>
  u.agent[method]("/api" + path)
    .set("X-CSRF-Token", u.csrf)
    .send(body);
async function register() {
  const agent = request.agent(app),
    boot = await agent.get("/api/bootstrap");
  const result = await agent
    .post("/api/register")
    .set("X-CSRF-Token", boot.body.csrf)
    .send({
      name: "Roles owner",
    first_name: "Test", last_name: "Owner", birth_date: "1990-01-01", phone: "+525512345678", address: "10 Test Street", country: "MX", tax_id: "TEST123",
      company: "Roles " + randomUUID(),
      email: randomUUID() + "@example.test",
      password,
      language: "es",
      accepted_terms: true,
    })
    .expect(201);
  tenants.push(result.body.user.tenant_id);
  await pool.query("UPDATE tenants SET seat_limit=15 WHERE id=$1", [
    result.body.user.tenant_id,
  ]);
  return { agent, ...result.body };
}
async function login(email) {
  const agent = request.agent(app),
    boot = await agent.get("/api/bootstrap");
  const result = await agent
    .post("/api/login")
    .set("X-CSRF-Token", boot.body.csrf)
    .send({ email, password })
    .expect(200);
  return { agent, ...result.body };
}
after(async () => {
  for (const tenant of tenants) {
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
      "contacts",
      "customer_branches",
    ])
      await pool.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [tenant]);
    for (const table of [
      "users",
      "teams",
      "companies",
      "workspace_roles",
      "departments",
    ])
      await pool.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [tenant]);
    await pool.query("DELETE FROM tenants WHERE id=$1", [tenant]);
  }
  if (previous === undefined) delete process.env.REGISTRATION_ENABLED;
  else process.env.REGISTRATION_ENABLED = previous;
  await pool.end();
});
test("Custom role profiles, free specialties and department permissions persist and remain tenant-isolated", async () => {
  const a = await register(),
    b = await register();
  const initial = (await a.agent.get("/api/staff/catalog").expect(200)).body;
  assert.deepEqual(
    new Set(initial.roles.map((r) => r.base_role)),
    new Set(["admin", "manager", "agent"]),
  );
  const depA = (
    await send(a, "/staff/departments", { name: "Infraestructura" }).expect(201)
  ).body.item;
  const depB = (
    await send(a, "/staff/departments", { name: "Seguridad" }).expect(201)
  ).body.item;
  const foreignDept = (
    await send(b, "/staff/departments", { name: "Other workspace" }).expect(201)
  ).body.item;
  const engineer = (
    await send(a, "/staff/roles", {
      name: "Ingeniero cloud",
      base_role: "agent",
    }).expect(201)
  ).body.item;
  const manager = (
    await send(a, "/staff/roles", {
      name: "Gerente de infraestructura",
      base_role: "manager",
    }).expect(201)
  ).body.item;
  await send(a, "/staff/roles", {
    name: "O7 override",
    base_role: "platform_admin",
  }).expect(400);
  await send(
    b,
    "/staff/roles/" + engineer.id,
    { name: "Intrusion" },
    "put",
  ).expect(404);
  await send(
    a,
    "/staff/roles/" + engineer.id,
    { name: "Escalation", base_role: "admin" },
    "put",
  ).expect(400);
  const create = (owner, name, role, department, specialty) =>
    send(owner, "/users", {
      name,
      email: randomUUID() + "@example.test",
      password,
      role_id: role.id,
      department_id: department,
      specialty,
    });
  await create(a, "Missing department", manager, null, "").expect(400);
  await create(a, "Foreign department", engineer, foreignDept.id, "").expect(
    400,
  );
  await create(b, "Foreign role", engineer, null, "").expect(400);
  await send(a, "/users", {
    name: "Spoofed",
    email: randomUUID() + "@example.test",
    password,
    role_id: engineer.id,
    role: "admin",
  }).expect(400);
  const boss = (
    await create(
      a,
      "Department manager",
      manager,
      depA.id,
      "Platform operations",
    ).expect(201)
  ).body.user;
  const engA = (
    await create(
      a,
      "Network engineer",
      engineer,
      depA.id,
      "Réseau / DevOps sur mesure",
    ).expect(201)
  ).body.user;
  const engB = (
    await create(a, "Cyber engineer", engineer, depB.id, "Cyber").expect(201)
  ).body.user;
  const supervisor = await login(boss.email),
    technician = await login(engA.email);
  assert.equal(technician.user.specialty, "Réseau / DevOps sur mesure");
  assert.equal(technician.user.role_name, "Ingeniero cloud");
  await send(supervisor, "/staff/roles", {
    name: "Admin",
    base_role: "admin",
  }).expect(403);
  await send(technician, "/staff/departments", { name: "Unauthorized" }).expect(
    403,
  );
  assert.ok(
    !(await supervisor.agent.get("/api/users").expect(200)).body.users.some(
      (u) => u.id === engB.id,
    ),
  );
  await send(supervisor, "/users/" + engB.id + "/access", {
    active: false,
  }).expect(403);
  await create(supervisor, "Wrong department", engineer, depB.id, "").expect(
    403,
  );
  const company = (await a.agent.get("/api/companies")).body.companies[0];
  const body = {
    company_id: company.id,
    title: "Scoped request",
    site: "Main",
    category: "Servicio",
    description: "Department visibility",
    priority: "Media",
  };
  const caseA = (
    await send(a, "/tickets", { ...body, department_id: depA.id }).expect(201)
  ).body.ticket;
  const caseB = (
    await send(a, "/tickets", { ...body, department_id: depB.id }).expect(201)
  ).body.ticket;
  await supervisor.agent.get("/api/tickets/" + caseA.id).expect(200);
  await supervisor.agent.get("/api/tickets/" + caseB.id).expect(404);
  await send(supervisor, "/tickets/" + caseB.id + "/actions", {
    action: "note",
    body: "Intrusion",
  }).expect(404);
  await send(supervisor, "/tickets/" + caseA.id + "/actions", {
    action: "assign",
    agent_id: engB.id,
  }).expect(403);
  await send(supervisor, "/tickets/" + caseA.id + "/actions", {
    action: "assign",
    agent_id: engA.id,
  }).expect(200);
  await technician.agent.get("/api/tickets/" + caseA.id).expect(200);
  await technician.agent.get("/api/tickets/" + caseB.id).expect(404);
  const own = (await send(supervisor, "/tickets", body).expect(201)).body
    .ticket;
  assert.equal(own.department_id, depA.id);
  await send(supervisor, "/tickets", {
    ...body,
    department_id: depB.id,
  }).expect(403);
  assert.equal(
    (await supervisor.agent.get("/api/analytics")).body.metrics.total,
    2,
  );
  assert.equal(
    (await supervisor.agent.get("/api/analytics")).body.scope,
    "department-" + depA.id,
  );
  assert.equal((await supervisor.agent.get("/api/tickets")).body.total, 2);
  const foreignRole = (await b.agent.get("/api/staff/catalog")).body.roles[0];
  await send(
    a,
    "/users/" + engA.id + "/permissions",
    { role_id: foreignRole.id, department_id: depA.id },
    "put",
  ).expect(400);
  await assert.rejects(
    pool.query("UPDATE users SET role_id=$1 WHERE id=$2", [
      foreignRole.id,
      engA.id,
    ]),
    { code: "23503" },
  );
  await send(
    a,
    "/staff/roles/" + engineer.id,
    { name: "Architecte plateforme" },
    "put",
  ).expect(200);
  assert.equal(
    (await technician.agent.get("/api/me")).body.user.role_name,
    "Architecte plateforme",
  );
  await send(
    a,
    "/users/" + engA.id + "/permissions",
    {
      role_id: engineer.id,
      department_id: depA.id,
      specialty: "Cyber, réseau et autre fonction",
    },
    "put",
  ).expect(200);
  assert.equal(
    (await technician.agent.get("/api/me")).body.user.specialty,
    "Cyber, réseau et autre fonction",
  );
  // Changing permission scope hides conversations and saved reports from the previous profile.
  const oldConversation = (
    await send(technician, "/chat/conversations", {}).expect(201)
  ).body.conversation;
  await send(
    a,
    "/users/" + engA.id + "/permissions",
    { role_id: manager.id, department_id: depA.id },
    "put",
  ).expect(200);
  await technician.agent
    .get("/api/chat/conversations/" + oldConversation.id)
    .expect(404);
  assert.equal(
    (await technician.agent.get("/api/chat/conversations")).body.conversations
      .length,
    0,
  );
  // Invitations retain the chosen profile, department and specialty, ignoring hostile acceptance fields.
  const address = randomUUID() + "@example.test";
  await send(a, "/invitations", {
    name: "Invited engineer",
    email: address,
    role_id: engineer.id,
    department_id: depA.id,
    specialty: "Cloud libre",
  }).expect(201);
  const queued = (
    await pool.query(
      "SELECT body FROM notification_outbox WHERE tenant_id=$1 AND recipient=$2",
      [a.user.tenant_id, address],
    )
  ).rows[0].body;
  const token = queued.split("/invitation#")[1].trim();
  const fresh = request.agent(app),
    boot = await fresh.get("/api/bootstrap");
  const accepted = (
    await fresh
      .post("/api/invitations/accept")
      .set("X-CSRF-Token", boot.body.csrf)
      .send({ token, password, role: "admin", department_id: depB.id })
      .expect(201)
  ).body.user;
  assert.equal(accepted.role, "agent");
  assert.equal(accepted.role_id, engineer.id);
  assert.equal(accepted.department_id, depA.id);
  assert.equal(accepted.specialty, "Cloud libre");
});
