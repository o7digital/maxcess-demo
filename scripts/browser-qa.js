import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
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
await mkdir(".local/screenshots", { recursive: true });
const failures = [];
async function profile(role, width = 1440) {
  const context = await browser.newContext({
    viewport: { width, height: width < 500 ? 844 : 1000 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => failures.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("401"))
      failures.push(msg.text());
  });
  const c = credentials.find((c) => c.role === role);
  await page.goto(base);
  await page.locator("#email").fill(c.email);
  await page.locator("#password").fill(c.password);
  await page.getByRole("button", { name: "Entrar a mi espacio" }).click();
  await page.locator("nav").waitFor();
  return { context, page };
}
let createdId;
try {
  const { page: client, context: cc } = await profile("client");
  await client.getByRole("button", { name: "+ Nueva solicitud" }).click();
  await client.locator("#title").fill("QA navegador · conectividad de sede");
  await client
    .locator("#description")
    .fill(
      "Los pagos con tarjeta están detenidos y la terminal está sin conexión.",
    );
  await client.getByRole("button", { name: "Registrar solicitud" }).click();
  await client
    .locator("#dialog-title")
    .filter({ hasText: "QA navegador" })
    .waitFor();
  createdId = Number(
    (await client.locator(".dialog .eyebrow").innerText()).match(/SH-(\d+)/)[1],
  );
  await client.screenshot({
    path: ".local/screenshots/client-ticket.png",
    fullPage: true,
  });
  await client.getByRole("button", { name: "Cerrar ×", exact: true }).click();
  await client.reload();
  await client
    .getByRole("button", {
      name: "QA navegador · conectividad de sede",
      exact: true,
    })
    .waitFor();
  const { page: manager, context: mc } = await profile("manager");
  await manager.screenshot({
    path: ".local/screenshots/desktop-overview.png",
    fullPage: true,
  });
  await manager
    .locator("nav")
    .getByRole("button", { name: "Solicitudes" })
    .click();
  await manager.locator("#search").fill("QA navegador");
  await manager
    .getByRole("button", {
      name: "QA navegador · conectividad de sede",
      exact: true,
    })
    .click();
  await manager.locator("#assigned-agent").selectOption({ label: "Ana López" });
  await manager
    .getByRole("button", { name: "Asignar agente", exact: true })
    .click();
  await manager
    .locator(".event")
    .filter({ hasText: "Asignado a Ana López" })
    .waitFor();
  await manager.getByRole("button", { name: "Cerrar ×", exact: true }).click();
  await manager.getByRole("button", { name: "Kanban", exact: true }).click();
  await manager.locator(".kanban").waitFor();
  await manager.screenshot({
    path: ".local/screenshots/desktop-kanban.png",
    fullPage: true,
  });
  const { page: agent, context: ac } = await profile("agent");
  await agent
    .getByRole("button", {
      name: "QA navegador · conectividad de sede",
      exact: true,
    })
    .click();
  await agent.locator("#note").fill("QA nota confidencial solo equipo");
  await agent.getByRole("button", { name: "Guardar nota interna" }).click();
  await agent
    .locator(".event")
    .filter({ hasText: "QA nota confidencial" })
    .waitFor();
  await agent.getByRole("button", { name: "Preparar con Olivia" }).click();
  await agent
    .getByRole("button", { name: "Copiar al editor para revisar" })
    .click();
  assert.ok(
    (await agent.locator("#reply").inputValue()).includes("QA navegador"),
  );
  await agent.locator("#approval").check();
  await agent
    .getByRole("button", { name: "Validar y publicar respuesta" })
    .click();
  await agent
    .locator(".event")
    .filter({ hasText: "Estimado equipo" })
    .waitFor();
  await agent
    .locator("#resolution")
    .fill("Se restableció la red y la sede verificó los pagos.");
  await agent.getByRole("button", { name: "Documentar y resolver" }).click();
  await agent
    .locator(".event")
    .filter({ hasText: "Se restableció la red" })
    .waitFor();
  await agent
    .getByRole("button", { name: "Cerrar solicitud", exact: true })
    .click();
  await agent.getByRole("button", { name: "Reabrir con motivo" }).waitFor();
  await agent.screenshot({
    path: ".local/screenshots/desktop-agent.png",
    fullPage: true,
  });
  agent.once("dialog", (d) =>
    d.accept("La sede solicita una verificación adicional."),
  );
  await agent.getByRole("button", { name: "Reabrir con motivo" }).click();
  await agent.locator("#reply").waitFor();
  await client
    .getByRole("button", {
      name: "QA navegador · conectividad de sede",
      exact: true,
    })
    .click();
  const clientText = await client.locator(".dialog").innerText();
  assert.ok(clientText.includes("Estimado equipo"));
  assert.ok(!clientText.includes("QA nota confidencial"));
  await client.locator("#reply").fill("Gracias, confirmamos el seguimiento.");
  await client
    .getByRole("button", { name: "Enviar respuesta", exact: true })
    .click();
  await client
    .locator(".event")
    .filter({ hasText: "Gracias, confirmamos" })
    .waitFor();
  const { page: mobile, context: mob } = await profile("manager", 390);
  assert.ok(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await mobile.screenshot({
    path: ".local/screenshots/mobile-overview.png",
    fullPage: true,
  });
  await mobile
    .locator("nav")
    .getByRole("button", { name: "Solicitudes" })
    .click();
  await mobile.locator("#search").fill("QA navegador");
  await mobile
    .getByRole("button", {
      name: "QA navegador · conectividad de sede",
      exact: true,
    })
    .click();
  await mobile.getByRole("button", { name: "Preparar con Olivia" }).click();
  await mobile
    .locator("#suggestions")
    .getByRole("heading", { name: "Resumen", exact: true })
    .waitFor();
  assert.ok(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await mobile.screenshot({
    path: ".local/screenshots/mobile-ticket.png",
    fullPage: true,
  });
  await mobile.keyboard.press("Escape");
  assert.ok(await mobile.locator("#mx-overlay").isHidden());
  for (const ctx of [cc, mc, ac, mob]) await ctx.close();
  assert.deepEqual(failures, []);
  console.log(
    "Browser QA passed: 3 profiles, full workflow, reload, notes isolation, desktop 1440px and mobile 390px; no JS errors or page overflow.",
  );
} finally {
  await browser.close();
  if (createdId && !process.env.QA_BASE_URL) {
    await pool.query("DELETE FROM events WHERE ticket_id=$1", [createdId]);
    await pool.query("DELETE FROM tickets WHERE id=$1", [createdId]);
  }
  await pool.end();
}
