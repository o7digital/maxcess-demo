import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const credentials = JSON.parse(
  await readFile(".local/saas-browser-access.json", "utf8"),
);
const base = process.env.QA_BASE_URL || "http://127.0.0.1:3100";
if (credentials.base !== base)
  throw new Error("Run test:saas on the target URL first");
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.setDefaultTimeout(20000);
try {
  await page.goto(base + "/login");
  await page.locator("#email").fill(credentials.email);
  await page.locator("#password").fill(credentials.password);
  await page.locator("#auth-form button.primary").click();
  await page.locator('button[data-view="clients"]').waitFor();
  await page.locator("#language").selectOption("fr");
  await page.waitForFunction(
    () =>
      document.documentElement.lang === "fr" &&
      document
        .querySelector('button[data-view="clients"]')
        ?.textContent.includes("Clients"),
  );
  await page.locator('button[data-view="clients"]').click();
  await page.getByRole("heading", { name: "Clients", exact: true }).waitFor();
  await page.locator("#new-company").click();
  const customer = "International " + randomUUID().slice(0, 8);
  await page.locator("#customer-name").fill(customer);
  await page.locator("#customer-sector").fill("Services");
  await page.locator("#customer-site").fill("Headquarters");
  await page
    .locator(
      '#company-form button[type="submit"], #company-form button.primary',
    )
    .click();
  const card = page
    .locator(".client-grid > .panel")
    .filter({ has: page.locator(".big-client", { hasText: customer }) });
  await card.waitFor();
  for (const [name, country, city, language, timezone] of [
    ["Paris", "FR", "Paris", "fr", "Europe/Paris"],
    ["Monterrey", "MX", "Monterrey", "es", "America/Monterrey"],
  ]) {
    await card.locator("[data-new-branch]").click();
    await page.locator("#branch-name").fill(name);
    await page.locator("#branch-country").selectOption(country);
    await page.locator("#branch-city").fill(city);
    await page.locator("#branch-language").selectOption(language);
    await page.locator("#branch-timezone").selectOption(timezone);
    await page.locator("#branch-form button.primary").click();
    await page.locator("#branch-panel").waitFor({ state: "detached" });
    await card
      .locator(".branch-summary strong")
      .filter({ hasText: new RegExp(name + " ·") })
      .waitFor();
  }
  await card.locator("[data-edit-branch]").first().click();
  await page.locator("#branch-address").fill("Adresse enregistrée");
  await page.locator("#branch-form button.primary").click();
  await page.locator("#branch-panel").waitFor({ state: "detached" });
  await page.locator('button[data-view="tickets"]').click();
  await page.locator('button[data-action="new"]').click();
  const companyValue = await page
    .locator("#company option")
    .filter({ hasText: customer })
    .getAttribute("value");
  await page.locator("#company").selectOption(companyValue);
  const branchValue = await page
    .locator("#branch option")
    .filter({ hasText: "Paris" })
    .getAttribute("value");
  await page.locator("#branch").selectOption(branchValue);
  assert.equal(await page.locator("#site").inputValue(), "Paris");
  assert.equal(await page.locator("#site").getAttribute("readonly"), "");
  await page.locator("#title").fill("International branch browser check");
  await page.locator("#description").fill("Demande internationale");
  for (const field of await page.locator("[data-custom][required]").all())
    await field.fill("FR-001");
  await page.locator('#new-ticket button[type="submit"]').click();
  await page.locator(".branch-context").waitFor();
  assert.match(
    await page.locator(".branch-context").innerText(),
    /France.*Europe\/Paris/,
  );
  await page.locator('[data-action="close"]').click();
  await page.locator("#country-filter").selectOption("FR");
  await page.waitForFunction(() =>
    document
      .querySelector("#ticket-results")
      ?.textContent.includes("International branch browser check"),
  );
  await page.reload();
  await page.waitForFunction(
    () =>
      document.documentElement.lang === "fr" &&
      !!document.querySelector("#language"),
  );
  assert.equal(await page.locator("#language").inputValue(), "fr");
  await page.locator('button[data-view="clients"]').click();
  await card.waitFor();
  assert.match(await card.innerText(), /France/);
  assert.match(await card.innerText(), /Mexique/);
  await mkdir(".local/screenshots", { recursive: true });
  await page.screenshot({
    path: ".local/screenshots/servicehub-international-clients.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.locator("#language").isVisible());
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.locator("#language").selectOption("es");
  await page.waitForFunction(() => document.documentElement.lang === "es");
  assert.deepEqual(errors, []);
  console.log(
    "International browser QA passed: FR interface, customer, FR/MX branches, edit, branch ticket, country filter, persisted user language and mobile layout.",
  );
} finally {
  await browser.close();
}
