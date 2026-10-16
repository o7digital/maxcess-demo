import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const credentials = JSON.parse(
  await readFile(".local/saas-browser-access.json", "utf8"),
);
const base = process.env.QA_BASE_URL || "http://127.0.0.1:3100";
if (credentials.base !== base)
  throw new Error("Run test:saas on this URL first");
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
try {
  await page.goto(base + "/login");
  await page.locator("#email").fill(credentials.email);
  await page.locator("#password").fill(credentials.password);
  await page.locator("#auth-form button.primary").click();
  await page.locator('[data-view="team"]').waitFor();
  await page.locator("#language").selectOption("fr");
  await page.waitForFunction(
    () =>
      document.documentElement.lang === "fr" &&
      !!document.querySelector('[data-view="team"]'),
  );
  await page.locator('[data-view="team"]').click();
  await page.locator("#create-user").waitFor();
  const department = "Infrastructure " + randomUUID().slice(0, 6),
    role = "Architecte cloud " + randomUUID().slice(0, 6);
  await page.locator("#add-department").click();
  await page
    .locator('#staff-department-form input[name="name"]')
    .fill(department);
  await page.locator("#staff-department-form button").click();
  await page.locator("#staff-department-form").waitFor({ state: "detached" });
  await page.locator("#add-custom-role").waitFor();
  await page.locator("#add-custom-role").click();
  await page.locator('#staff-role-form input[name="name"]').fill(role);
  await page.locator("#staff-role-form select").selectOption("agent");
  await page.locator("#staff-role-form button").click();
  await page.locator("#staff-role-form").waitFor({ state: "detached" });
  await page.locator("#create-user").waitFor();
  const name = "Engineer " + randomUUID().slice(0, 6);
  await page.locator("#create-user").click();
  await page.locator('#staff-user-form input[name="name"]').fill(name);
  await page
    .locator('#staff-user-form input[name="email"]')
    .fill(randomUUID() + "@example.test");
  await page
    .locator('#staff-user-form input[name="password"]')
    .fill("Browser-staff-password-2026!");
  const roleValue = await page
    .locator("#staff-role option")
    .filter({ hasText: role })
    .getAttribute("value");
  const departmentValue = await page
    .locator("#staff-department option")
    .filter({ hasText: department })
    .getAttribute("value");
  await page.locator("#staff-role").selectOption(roleValue);
  await page.locator("#staff-department").selectOption(departmentValue);
  await page
    .locator("#staff-specialty")
    .fill("DevOps, réseau et fonction libre");
  await page.locator("#staff-user-form button.primary").click();
  await page.locator("#staff-user-form").waitFor({ state: "detached" });
  const row = page
    .locator("[data-staff-user]")
    .filter({ has: page.getByText(name, { exact: true }) });
  await row.waitFor();
  assert.match(await row.innerText(), /DevOps, réseau et fonction libre/);
  assert.ok((await row.innerText()).includes(role));
  await row.locator("[data-edit-staff]").click();
  assert.equal(
    await page.locator("#staff-specialty").inputValue(),
    "DevOps, réseau et fonction libre",
  );
  await page.locator("#staff-specialty").fill("Cyber et autre spécialité");
  await page.locator("#staff-user-form button.primary").click();
  await page.locator("#staff-user-form").waitFor({ state: "detached" });
  await row.waitFor();
  assert.match(await row.innerText(), /Cyber et autre spécialité/);
  await page.locator("#create-user").click();
  await page
    .locator('#staff-user-form input[name="name"]')
    .fill("Manager " + randomUUID().slice(0, 6));
  await page
    .locator('#staff-user-form input[name="email"]')
    .fill(randomUUID() + "@example.test");
  await page
    .locator('#staff-user-form input[name="password"]')
    .fill("Browser-staff-password-2026!");
  const managerValue = await page
    .locator('#staff-role option[data-profile="manager"]')
    .first()
    .getAttribute("value");
  await page.locator("#staff-role").selectOption(managerValue);
  assert.equal(
    await page.locator("#staff-department").getAttribute("required"),
    "",
  );
  await page.locator("#staff-department").selectOption(departmentValue);
  await page.locator("#staff-specialty").fill("Responsable infrastructure");
  await page.locator("#staff-user-form button.primary").click();
  await page.locator("#staff-user-form").waitFor({ state: "detached" });
  await page.locator('[data-view="tickets"]').click();
  await page.locator('[data-action="new"]').click();
  await page.locator("#title").fill("Department routing browser check");
  await page
    .locator("#description")
    .fill("Demande pour le département infrastructure");
  await page.locator("#ticket-department").selectOption(departmentValue);
  for (const field of await page.locator("[data-custom][required]").all())
    await field.fill("DEP-001");
  await page.locator('#new-ticket button[type="submit"]').click();
  await page.locator(".department-context").waitFor();
  assert.ok(
    (await page.locator(".department-context").innerText()).includes(
      department,
    ),
  );
  await page.locator('[data-action="close"]').click();
  await page.reload();
  await page.locator('[data-view="team"]').click();
  await row.waitFor();
  assert.match(await row.innerText(), /Cyber et autre spécialité/);
  await mkdir(".local/screenshots", { recursive: true });
  await page.screenshot({
    path: ".local/screenshots/servicehub-custom-roles.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.locator("#add-custom-role").isVisible());
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.locator("#language").selectOption("es");
  await page.waitForFunction(() => document.documentElement.lang === "es");
  assert.deepEqual(errors, []);
  console.log(
    "Staff browser QA passed: FR role/department creation, custom engineer role, free specialty, edit, department manager, persistence and mobile layout.",
  );
} finally {
  await browser.close();
}
