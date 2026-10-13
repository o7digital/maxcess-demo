import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { pool } from "../server/db.js";
const base = process.env.QA_BASE_URL || "http://127.0.0.1:3000",
  credentials = JSON.parse(
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
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("401")) errors.push(m.text());
});
let ticketId;
await mkdir(".local/screenshots", { recursive: true });
try {
  await page.goto(base);
  const c = credentials.find(
    (c) => c.email === "olivier.steineur@o7digitalgroup.com",
  );
  await page.locator("#email").fill(c.email);
  await page.locator("#password").fill(c.password);
  await page.getByRole("button", { name: "Entrar a mi espacio" }).click();
  await page.locator(".activity-chart").waitFor();
  await page.goto(base + "/demo");
  const portal = page.frameLocator("#client-preview");
  await portal.locator(".client-service-hero").waitFor();
  await page.locator(".device-stage").scrollIntoViewIfNeeded();
  assert.equal(
    await page
      .locator("#client-preview")
      .evaluate((f) => f.contentWindow.innerWidth),
    390,
  );
  assert.equal(await portal.locator("nav button").count(), 3);
  assert.equal(await portal.locator('nav [data-view="team"]').count(), 0);
  await portal
    .getByRole("button", { name: "+ Nueva solicitud", exact: true })
    .click();
  await portal.locator("#title").fill("QA preview · solicitud desde móvil");
  await portal
    .locator("#description")
    .fill(
      "Consulta creada desde el portal cliente para verificar los tres formatos de pantalla.",
    );
  await portal.getByRole("button", { name: "Registrar solicitud" }).click();
  await portal
    .locator("#dialog-title")
    .filter({ hasText: "QA preview" })
    .waitFor();
  ticketId = Number(
    (await portal.locator(".dialog .eyebrow").innerText()).match(/SH-(\d+)/)[1],
  );
  await portal.getByRole("button", { name: "Cerrar ×", exact: true }).click();
  for (const [device, width] of [
    ["mobile", 390],
    ["tablet", 820],
    ["desktop", 1280],
  ]) {
    await page.locator('[data-device="' + device + '"]').click();
    await page.waitForFunction(
      (w) =>
        document.querySelector("#client-preview").contentWindow.innerWidth ===
        w,
      width,
    );
    await portal
      .getByRole("button", {
        name: "QA preview · solicitud desde móvil",
        exact: true,
      })
      .waitFor();
    assert.ok(
      await portal
        .locator("body")
        .evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: ".local/screenshots/client-preview-" + device + ".png",
      fullPage: true,
    });
  }
  await page.locator('[data-device="tablet"]').click();
  await page.locator("#rotate").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#client-preview").contentWindow.innerWidth ===
      1180,
  );
  // The same browser keeps its original admin session while the iframe uses the client session.
  const identity = await page.evaluate(async () => {
    const r = await fetch("/api/me");
    return r.json();
  });
  assert.equal(identity.user.role, "platform_admin");
  await page.goto(base + "/cliente");
  await page
    .getByRole("button", {
      name: "QA preview · solicitud desde móvil",
      exact: true,
    })
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", {
      name: "QA preview · solicitud desde móvil",
      exact: true,
    })
    .waitFor();
  for (const [label, width, height] of [
    ["phone", 390, 844],
    ["ipad", 820, 1180],
    ["desktop", 1440, 1000],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator('nav [data-view="overview"]').click();
    await page.locator(".client-service-hero").waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: ".local/screenshots/client-portal-" + label + ".png",
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('nav [data-view="reports"]').click();
  await page.locator(".activity-chart").waitFor();
  await page.screenshot({
    path: ".local/screenshots/client-portal-phone-reports.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Client portal QA passed: mobile, iPad/tablet, desktop, rotation, real ticket creation, resize/reload persistence, same-browser admin isolation and no overflow or JS errors.",
  );
} finally {
  await browser.close();
  if (ticketId && !process.env.QA_BASE_URL) {
    await pool.query("DELETE FROM events WHERE ticket_id=$1", [ticketId]);
    await pool.query("DELETE FROM tickets WHERE id=$1", [ticketId]);
  }
  await pool.end();
}
