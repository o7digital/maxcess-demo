import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { pool } from "../server/db.js";
const base = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const credentials = JSON.parse(
  await readFile(
    process.env.QA_ACCESS_PATH || ".local/demo-access.json",
    "utf8",
  ),
);
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const errors = [];
const reportIds = [],
  conversationIds = [];
let qaUserEmail, lastPage;
await mkdir(".local/screenshots", { recursive: true });
try {
  for (const role of [
    "platform_admin",
    "admin",
    "manager",
    "agent",
    "client",
  ]) {
    const credential =
      role === "platform_admin"
        ? credentials.find(
            (c) => c.email === "olivier.steineur@o7digitalgroup.com",
          )
        : credentials.find(
            (c) =>
              c.email ===
              {
                admin: "admin@example.test",
                manager: "gerente@example.test",
                agent: "agente@example.test",
                client: "cliente@example.test",
              }[role],
          );
    assert.ok(credential, role + " credentials required");
    const context = await browser.newContext({
        viewport: { width: role === "client" ? 390 : 1440, height: 1000 },
      }),
      page = await context.newPage();
    lastPage = page;
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !m.text().includes("401"))
        errors.push(m.text());
    });
    await page.goto(base);
    await page.locator("#email").fill(credential.email);
    await page.locator("#password").fill(credential.password);
    await page.getByRole("button", { name: "Entrar a mi espacio" }).click();
    await page
      .locator(role === "client" ? ".client-service-hero" : ".activity-chart")
      .waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    if (role === "client") {
      assert.equal(await page.locator('nav [data-view="team"]').count(), 0);
      assert.equal(await page.locator("#report-company").count(), 0);
    } else if (["platform_admin", "admin", "manager"].includes(role)) {
      assert.equal(await page.locator("#report-company option").count(), 21);
    }
    await page.locator('nav [data-view="reports"]').click();
    await page
      .getByRole("button", { name: "Guardar informe", exact: true })
      .waitFor();
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/reports") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Guardar informe", exact: true })
      .click();
    const payload = await (await response).json();
    assert.ok(payload.report.id);
    reportIds.push(payload.report.id);
    await page.locator(".saved-report").waitFor();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar indicadores" }).click();
    assert.ok((await download).suggestedFilename().endsWith(".csv"));
    if (role === "platform_admin") {
      await page.screenshot({
        path: ".local/screenshots/premium-report-desktop.png",
        fullPage: true,
      });
      await page.locator('nav [data-view="team"]').click();
      await page.getByRole("button", { name: "+ Nuevo usuario" }).click();
      qaUserEmail = `qa-browser-${randomUUID()}@example.test`;
      await page.locator("#user-name").fill("QA dashboard");
      await page.locator("#user-email").fill(qaUserEmail);
      await page.locator("#user-role").selectOption("client");
      await page.locator("#user-password").fill("QA-browser-password-123");
      await page
        .getByRole("button", { name: "Crear cuenta", exact: true })
        .click();
      await page.locator("tr").filter({ hasText: qaUserEmail }).waitFor();
      const row = page.locator("tr").filter({ hasText: qaUserEmail });
      await row
        .getByRole("button", { name: "Desactivar", exact: true })
        .click();
      await page
        .locator("tr")
        .filter({ hasText: qaUserEmail })
        .getByRole("button", { name: "Activar", exact: true })
        .waitFor();
    }
    if (role === "client") {
      await page.screenshot({
        path: ".local/screenshots/premium-client-mobile.png",
        fullPage: true,
      });
      assert.equal(await page.locator("#olivia-widget").count(),0);
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Premium dashboard QA passed: 5 roles, company scope, saved reports, CSV, user creation/suspension, no floating chat, desktop/mobile and no JS errors.",
  );
} catch (error) {
  console.error("Dashboard QA failure:", error.message);
  await lastPage
    ?.screenshot({ path: ".local/screenshots/qa-failure.png", fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
  if (!process.env.QA_BASE_URL) {
    await pool.query("DELETE FROM reports WHERE id=ANY($1::uuid[])", [
      reportIds,
    ]);
    await pool.query(
      "DELETE FROM ai_messages WHERE conversation_id=ANY($1::uuid[])",
      [conversationIds],
    );
    await pool.query("DELETE FROM ai_conversations WHERE id=ANY($1::uuid[])", [
      conversationIds,
    ]);
    if (qaUserEmail) {
      await pool.query(
        "DELETE FROM user_audit WHERE subject_id IN (SELECT id FROM users WHERE email=$1)",
        [qaUserEmail],
      );
      await pool.query("DELETE FROM users WHERE email=$1", [qaUserEmail]);
    }
  }
  await pool.end();
}
