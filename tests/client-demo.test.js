import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import request from "supertest";
import { createApp } from "../server/app.js";
import { pool } from "../server/db.js";
const app = createApp();
after(() => pool.end());
async function start(agent, portal = false) {
  const boot = await agent
    .get("/api/bootstrap")
    .set(portal ? { "X-Client-Portal": "1" } : {});
  return boot.body.csrf;
}
test("Client demo is authenticated, scoped and independent from an admin session", async () => {
  const environment = process.env.APP_ENV;
  process.env.APP_ENV = "dev";
  const browser = request.agent(app);
  let adminCsrf = await start(browser);
  const credentials = JSON.parse(
    await readFile(".local/demo-access.json", "utf8"),
  ).find((c) => c.email === "olivier.steineur@o7digitalgroup.com");
  const admin = await browser
    .post("/api/login")
    .set("X-CSRF-Token", adminCsrf)
    .send(credentials)
    .expect(200);
  adminCsrf = admin.body.csrf;
  const csrf = await start(browser, true);
  await browser
    .post("/api/demo/client-login")
    .set({ "X-CSRF-Token": csrf, "X-Client-Portal": "1" })
    .send({ role: "platform_admin" })
    .expect(400);
  const demo = await browser
    .post("/api/demo/client-login")
    .set({ "X-CSRF-Token": csrf, "X-Client-Portal": "1" })
    .send({})
    .expect(200);
  assert.equal(demo.body.user.role, "client");
  assert.equal(demo.body.user.email, "demo.usuario@example.test");
  assert.equal(
    (await browser.get("/api/me").expect(200)).body.user.role,
    "platform_admin",
  );
  assert.equal(
    (await browser.get("/api/me").set("X-Client-Portal", "1").expect(200)).body
      .user.role,
    "client",
  );
  assert.ok(
    (
      await browser.get("/api/tickets").set("X-Client-Portal", "1")
    ).body.tickets.every((t) => t.company_id === demo.body.user.company_id),
  );
  await browser.get("/api/users").set("X-Client-Portal", "1").expect(403);
  const tickets = (await browser.get("/api/tickets")).body.tickets,
    foreign = tickets.find((t) => t.company_id !== demo.body.user.company_id);
  await browser
    .get("/api/tickets/" + foreign.id)
    .set("X-Client-Portal", "1")
    .expect(404);
  const created = await browser
    .post("/api/tickets")
    .set({ "X-CSRF-Token": demo.body.csrf, "X-Client-Portal": "1" })
    .send({
      title: "QA client demo",
      site: "Sede demo",
      category: "Servicio",
      description: "Prueba de aislamiento de la demo",
      priority: "Media",
    })
    .expect(201);
  try {
    assert.equal(created.body.ticket.company_id, demo.body.user.company_id);
    await browser
      .post("/api/logout")
      .set({ "X-CSRF-Token": demo.body.csrf, "X-Client-Portal": "1" })
      .send({})
      .expect(200);
    await browser.get("/api/me").set("X-Client-Portal", "1").expect(401);
    assert.equal(
      (await browser.get("/api/me")).body.user.role,
      "platform_admin",
    );
  } finally {
    await pool.query("DELETE FROM events WHERE ticket_id=$1", [
      created.body.ticket.id,
    ]);
    await pool.query("DELETE FROM tickets WHERE id=$1", [
      created.body.ticket.id,
    ]);
    process.env.APP_ENV = environment;
  }
});
test("Preview uses same-origin frames and quick demo login is disabled outside dev", async () => {
  const environment = process.env.APP_ENV;
  process.env.APP_ENV = "dev";
  const browser = request.agent(app),
    csrf = await start(browser, true);
  const page = await browser.get("/demo").expect(200);
  assert.equal(page.headers["x-frame-options"], "SAMEORIGIN");
  assert.ok(
    page.headers["content-security-policy"].includes("frame-ancestors 'self'"),
  );
  assert.ok(page.text.includes("/cliente?preview=1"));
  process.env.APP_ENV = "production";
  await browser
    .post("/api/demo/client-login")
    .set({ "X-CSRF-Token": csrf, "X-Client-Portal": "1" })
    .send({})
    .expect(404);
  await browser.get("/demo").expect(404);
  process.env.APP_ENV = "dev";
  await browser
    .post("/api/login")
    .set({ "X-CSRF-Token": csrf, "X-Client-Portal": "1" })
    .send(
      JSON.parse(await readFile(".local/demo-access.json", "utf8")).find(
        (c) => c.email === "olivier.steineur@o7digitalgroup.com",
      ),
    )
    .expect(403);
  process.env.APP_ENV = environment;
});
