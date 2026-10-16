import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const base = process.env.QA_BASE_URL || "http://127.0.0.1:3100";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.setDefaultTimeout(20000);
try {
  await page.goto(base + "/login");
  await page.locator("#auth-form").waitFor();
  assert.equal(
    await page.locator("#password").getAttribute("autocomplete"),
    "current-password",
  );
  assert.equal(await page.locator("#password").getAttribute("minlength"), null);
  await page.goto(base + "/forgot-password");
  await page.getByRole("heading").waitFor();
  const config = await (await page.request.get(base + "/api/bootstrap")).json();
  if (config.recoveryAvailable === false) {
    for (const [language, message] of [
      ["es", "no está disponible"],
      ["en", "temporarily unavailable"],
      ["fr", "temporairement indisponible"],
    ]) {
      if (language !== "es")
        await page.locator("#language").selectOption(language);
      await page.waitForFunction(
        (lang) => document.documentElement.lang === lang,
        language,
      );
      assert.equal(await page.locator("#account-form").count(), 0);
      assert.ok((await page.getByRole("status").innerText()).includes(message));
    }
  } else await page.locator('#account-form input[type="email"]').waitFor();
  await page.goto(base + "/reset-password#qa-invalid-not-a-secret");
  await page.locator('#account-form input[type="password"]').waitFor();
  assert.equal(await page.locator("#password").getAttribute("minlength"), "12");
  assert.equal(
    await page.locator("#password").getAttribute("autocomplete"),
    "new-password",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Recovery browser QA passed: existing-password login, truthful email availability ES/EN/FR and accessible reset form.",
  );
} finally {
  await browser.close();
}
