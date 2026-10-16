import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const base = process.env.QA_BASE_URL || "http://127.0.0.1:3100";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.setDefaultTimeout(20000);
const priceText = (c, language) =>
  new Intl.NumberFormat(language, {
    style: "currency",
    currency: "MXN",
    currencyDisplay: "narrowSymbol",
  }).format(c / 100) + " MXN";
try {
  await page.goto(base + "/pricing");
  for (const language of ["es", "en", "fr"]) {
    if (language !== "es") {
      await page.locator("#language").selectOption(language);
      await page.waitForFunction(
        (lang) => document.documentElement.lang === lang,
        language,
      );
    }
    await page.locator('[data-public-plan="business-50"]').waitFor();
    assert.equal(await page.locator("[data-public-plan]").count(), 5);
    const body = await page.locator("body").innerText();
    assert.ok(!/399|USD|licencia anual|annual license/.test(body));
    for (const [months, cents] of [
      [1, 149900],
      [3, 427215],
      [6, 809460],
      [12, 1499000],
    ]) {
      await page.locator('[data-public-months="' + months + '"]').click();
      assert.equal(
        await page
          .locator('[data-public-plan="team-5"] .plan-price')
          .innerText(),
        priceText(cents, language),
      );
    }
    const expected = [
      ["team-5", 1499000],
      ["team-10", 2848100],
      ["team-15", 4047300],
      ["business-30", 7644900],
      ["business-50", 11992000],
    ];
    for (const [id, cents] of expected)
      assert.equal(
        await page
          .locator('[data-public-plan="' + id + '"] .plan-price')
          .innerText(),
        priceText(cents, language),
      );
  }
  await mkdir(".local/screenshots", { recursive: true });
  await page.screenshot({
    path: ".local/screenshots/servicehub-mxn-pricing.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "MXN pricing browser QA passed: five tiers, monthly/quarterly/semiannual/annual totals, exact two free months, ES/EN/FR and mobile layout.",
  );
} finally {
  await browser.close();
}
