import { chromium } from "@playwright/test";
import * as OTPAuth from "otpauth";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { pool } from "../server/db.js";
const base = process.env.QA_BASE_URL || "http://127.0.0.1:3104";
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(base))
  throw Error(
    "This enrollment test is restricted to a local disposable database",
  );
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", async (r) => {
  if (r.url().includes("/api/") && r.status() >= 400)
    console.log(new URL(r.url()).pathname, r.status(), (await r.json()).error);
});
const email = "security-browser-" + randomUUID() + "@example.test",
  password = "Temporary-password-2026!";
try {
  await page.goto(base + "/signup");
  await page.locator("#language").selectOption("en");
  await page.waitForFunction(() => document.documentElement.lang === "en");
  for (const [name, value] of Object.entries({
    first_name: "Browser",
    last_name: "Test",
    birth_date: "1990-01-01",
    phone: "+525512345678",
    company: "Browser Test " + randomUUID(),
    address: "10 Test Street",
    tax_id: "TEST123",
    email,
    password,
  }))
    await page.locator(`[name=${name}]`).fill(value);
  await page.locator("[name=country]").selectOption("MX");
  await page.locator("[name=accepted_terms]").check();
  await page.locator("#auth-form button").click();
  console.log("Submitted signup");
  await page.locator(".security-dialog").waitFor();
  console.log("Security dialog opened");
  await page.locator("[name=method]").selectOption("totp");
  await page.locator(".security-dialog [name=password]").fill(password);
  await page.locator("#security-submit").click();
  await page.locator(".totp-qr").waitFor();
  const secret = await page.locator("#security-step code").innerText();
  const otp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
  await page.locator("[name=code]").fill(otp.generate());
  await page.locator("#security-submit").click();
  await page.locator("#codes-saved").waitFor();
  const recovery = (
    await page.locator(".security-dialog pre").innerText()
  ).split("\n");
  assert.equal(recovery.length, 8);
  await page.locator("#codes-saved").click();
  await page.locator("[data-action=logout]").click();
  await page.goto(base + "/login");
  await page.locator("[name=email]").fill(email);
  await page.locator("[name=password]").fill(password);
  await page.locator("#auth-form button").click();
  await page.locator("#mfa-login").waitFor();
  assert.equal(await page.locator("[data-action=logout]").count(), 0);
  await page.locator("#mfa-login [name=code]").fill(recovery[0]);
  await page.locator("#mfa-login button").click();
  await page.locator("[data-action=security]").waitFor();
  await page.locator("[data-action=connectors]").click();
  await page.locator("[data-connector=zendesk]").waitFor();
  assert.equal(await page.locator("[data-connector]").count(), 2);
  await page.locator("#connectors-close").click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Authenticated mobile layout",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Registration, TOTP enrollment, recovery-code login, connector configuration UI and authenticated mobile layout passed.",
  );
} finally {
  await browser.close();
  const {
    rows: [user],
  } = await pool.query("SELECT tenant_id FROM users WHERE email=$1", [email]);
  if (user) {
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
      await pool.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [
        user.tenant_id,
      ]);
    await pool.query("DELETE FROM tenants WHERE id=$1", [user.tenant_id]);
  }
  await pool.end();
}
