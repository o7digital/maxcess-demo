import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import sharp from "sharp";
const base = process.env.QA_BASE_URL || "http://127.0.0.1:3100";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  }),
  page = await context.newPage(),
  errors = [];
page.setDefaultTimeout(20000);
page.setDefaultNavigationTimeout(30000);
page.on("pageerror", (e) => {
  errors.push(e.message);
  console.error("Browser error:", e.message);
});
await mkdir(".local/screenshots", { recursive: true });
try {
  console.log("Opening landing");
  await page.goto(base);
  await page
    .getByRole("heading", {
      name: "Un gran servicio empieza con un equipo conectado.",
    })
    .waitFor();
  assert.ok(
    !/Maxcess|demostración|ENTORNO DEV/i.test(
      await page.locator("body").innerText(),
    ),
  );
  await page.screenshot({
    path: ".local/screenshots/servicehub-landing.png",
    fullPage: true,
  });
  await page.locator("#language").selectOption("en");
  await page
    .getByRole("heading", {
      name: "Great service starts with a connected team.",
    })
    .waitFor();
  await page.locator("#language").selectOption("es");
  console.log("Landing ES/EN passed; opening signup");
  await page.goto(base + "/signup");
  const credentials = {
    email: `browser-${randomUUID()}@example.test`,
    password: "Browser-password-2026!",
  };
  await page.locator("#name").fill("Browser Owner");
  await page.locator("#company").fill("Empresa Navegador");
  await page.locator("#email").fill(credentials.email);
  await page.locator("#password").fill(credentials.password);
  await page.locator("[name=accepted_terms]").check();
  await page
    .getByRole("button", { name: "Crear espacio · 7 días gratis" })
    .click();
  await page.getByRole("heading", { name: "Hazlo tuyo." }).waitFor();
  console.log("Registered; onboarding");
  const logo = await sharp({
    create: {
      width: 120,
      height: 60,
      channels: 4,
      background: { r: 40, g: 80, b: 20, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  for (let step = 0; step < 5; step++) {
    console.log("Onboarding step", step + 1);
    if (step === 0) {
      await page.locator("#sector").fill("Servicios profesionales");
      await page.locator("#logo-file").setInputFiles({
        name: "company-logo.png",
        mimeType: "image/png",
        buffer: logo,
      });
      await page.getByText("Logo guardado", { exact: true }).waitFor();
      await page.waitForFunction(
        () => document.querySelector("#logo-preview")?.naturalWidth > 0,
      );
    }
    if (step === 1) await page.locator("[name=template][value=it]").check();
    if (step === 2) await page.locator("#team").fill("Equipo central");
    if (step === 3)
      await page.locator("#categories").fill("Servicio\nEquipos\nAccesos");
    await page
      .locator("#wizard button[type=submit],#wizard button.primary")
      .click();
    if (step < 4)
      await page.waitForFunction(
        (s) =>
          document.querySelector(".wizard-steps .current b")?.textContent ===
          String(s + 2),
        step,
      );
  }
  await page.getByRole("heading", { name: "Hola, Browser." }).waitFor();
  console.log("Onboarded; settings");
  const workspace = await page.evaluate(
    async () => (await (await fetch("/api/workspace")).json()).workspace,
  );
  assert.match(workspace.settings.logo, /^\/api\/workspace\/logo\//);
  await page.locator(".workspace-logo").waitFor();
  await writeFile(
    ".local/saas-browser-access.json",
    JSON.stringify({ ...credentials, tenant_id: workspace.id, base }, null, 2),
    { mode: 0o600 },
  );
  await page.locator('nav [data-view="settings"]').click();
  await page.locator("#workspace-settings").waitFor();
  const replacement = await sharp(logo)
    .flatten({ background: "#ffffff" })
    .jpeg()
    .toBuffer();
  await page.locator("#logo-file").setInputFiles({
    name: "updated-logo.jpg",
    mimeType: "image/jpeg",
    buffer: replacement,
  });
  await page.getByText("Logo guardado", { exact: true }).waitFor();
  await page.waitForFunction(
    () => document.querySelector("#logo-preview")?.naturalWidth > 0,
  );
  assert.notEqual(
    await page.locator("#logo-preview").getAttribute("src"),
    workspace.settings.logo,
  );
  await page.locator("#add-field").click();
  await page.locator("[data-property=label]").fill("Número de activo");
  await page.locator("[data-property=key]").fill("asset_number");
  await page.locator("[data-property=required]").check();
  const previousSettingsForm = await page
    .locator("#workspace-settings")
    .elementHandle();
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/workspace") &&
        r.request().method() === "PUT" &&
        r.status() === 200,
    ),
    page.locator(".sticky-save button").click(),
  ]);
  await page.waitForFunction((form) => !form.isConnected, previousSettingsForm);
  await page.locator("#workspace-settings").waitFor();
  await page.locator("[data-property=label]").waitFor();
  assert.equal(
    await page.locator("[data-property=label]").inputValue(),
    "Número de activo",
  );
  await page.locator('nav [data-view="tickets"]').click();
  await page
    .getByRole("button", { name: "+ Nueva solicitud", exact: true })
    .click();
  await page.locator("#title").fill("Primera solicitud SaaS");
  await page
    .locator("#description")
    .fill("Solicitud real del recorrido automatizado en un espacio aislado.");
  await page.locator("#custom-asset_number").fill("EQ-100");
  await page.getByRole("button", { name: "Registrar solicitud" }).click();
  await page
    .locator("#dialog-title")
    .filter({ hasText: "Primera solicitud SaaS" })
    .waitFor();
  assert.ok((await page.locator(".dialog").innerText()).includes("EQ-100"));
  await page.getByRole("button", { name: "Cerrar ×", exact: true }).click();
  await page.reload();
  await page.locator('nav [data-view="tickets"]').click();
  await page
    .getByRole("button", { name: "Primera solicitud SaaS", exact: true })
    .waitFor();
  await page.locator('nav [data-view="subscription"]').click();
  await page
    .getByRole("heading", { name: "Suscripción", exact: true })
    .waitFor();
  await page.screenshot({
    path: ".local/screenshots/servicehub-subscription.png",
    fullPage: true,
  });
  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('nav [data-view="overview"]').click();
    await page.locator(".hero").waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Horizontal overflow at ${width}`,
    );
    await page.screenshot({
      path: `.local/screenshots/servicehub-workspace-${width}.png`,
      fullPage: true,
    });
  }
  await page.goto(base + "/settings");
  await page.locator("#workspace-settings").waitFor();
  for (const width of [390, 820]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Settings overflow at ${width}`,
    );
  }
  await page.locator("#remove-logo").click();
  await page.getByText("Logo eliminado", { exact: true }).waitFor();
  await page.reload();
  await page.locator("#workspace-settings").waitFor();
  assert.equal(await page.locator(".workspace-logo").count(), 0);
  assert.equal(await page.locator("input[type=url][id=logo]").count(), 0);
  await page.goto(base + "/verify-email#invalid-preview-token");
  await page.getByRole("heading", { name: "Confirma tu correo" }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Browser QA passed: ES/EN landing, registration, logo upload/replacement/removal, 5-step onboarding, persistent form configuration, required custom field, ticket, session reload, billing and 390/820/1440 layouts.",
  );
  console.log(
    `QA workspace ${workspace.id} retained for review; private credentials in .local/saas-browser-access.json.`,
  );
} finally {
  await browser.close();
}
