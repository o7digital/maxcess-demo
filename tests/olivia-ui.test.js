import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { createApp } from "../server/app.js";
import { pool } from "../server/db.js";

test("Olivia handles an empty workspace and opens only the selected request", async () => {
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH ||
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
    });
    const context = await browser.newContext();
    const credentials = JSON.parse(await readFile(".local/demo-access.json", "utf8"))
      .find(user => user.role === "admin");
    const boot = await (await context.request.get(base + "/api/bootstrap")).json();
    const login = await context.request.post(base + "/api/login", {
      headers: { "X-CSRF-Token": boot.csrf }, data: credentials,
    });
    assert.equal(login.status(), 200);
    const page = await context.newPage();
    const errors = [], ticketRequests = [], proposals = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => {
      const path = new URL(request.url()).pathname;
      if (/^\/api\/tickets\/\d+$/.test(path)) ticketRequests.push(path);
    });
    // Reproduce the empty, read-only workspace from the reported screenshot.
    await page.route("**/api/me", async route => {
      const response = await route.fetch(), data = await response.json();
      data.user.language = "es";
      await route.fulfill({ response, json: data });
    });
    await page.route("**/api/workspace", async route => {
      const response = await route.fetch(), data = await response.json();
      data.workspace.access = "read_only";
      await route.fulfill({ response, json: data });
    });
    await page.route("**/api/tickets", route => route.fulfill({
      json: { tickets: [], total: 0, next_cursor: null },
    }));
    await page.goto(base);
    await page.locator("nav [data-view=olivia]").click();
    assert.equal(await page.locator("[data-action=open-olivia]").isDisabled(), true);
    assert.equal(await page.locator("#olivia-ticket").isDisabled(), true);
    const dictionary = JSON.parse(await readFile("public/locales/es.json", "utf8"));
    assert.equal(await page.locator(".olivia-stage [role=status]").innerText(),
      dictionary["No requests exist in this scope yet."]);
    // The handler also rejects stale selections even if the DOM is altered.
    await page.locator("[data-action=open-olivia]").evaluate(button => {
      button.disabled = false;
      button.click();
    });
    await page.locator("#mx-toast:not([hidden])").waitFor();
    assert.deepEqual(ticketRequests, []);
    assert.equal(await page.locator(".dialog").count(), 0);

    // Exercise the shared HTML serializer in a real browser, including values.
    const attributes = await page.evaluate(async () => {
      const { localizedHtml } = await import("/localization.js");
      const template = document.createElement("template");
      template.innerHTML = localizedHtml`<button ${"disabled"}>Test</button><input type="checkbox" ${"checked"}><select><option value="a">A</option><option value="b" ${"selected"}>B</option></select><input value="${'a &amp; b'}" ${"readonly"}><button ${""}>Enabled</button>`;
      const root = template.content;
      return {
        disabled: root.querySelector("button").disabled,
        checked: root.querySelector("input").checked,
        selected: root.querySelector("select").value,
        readOnly: root.querySelector("input[readonly]")?.readOnly,
        value: root.querySelector("input[readonly]")?.value,
        enabled: !root.querySelector("button:last-child").disabled,
        slots: /__mx_slot_/i.test(template.innerHTML),
      };
    });
    assert.deepEqual(attributes, {
      disabled: true, checked: true, selected: "b", readOnly: true,
      value: "a & b", enabled: true, slots: false,
    });

    await page.unroute("**/api/tickets");
    await page.unroute("**/api/workspace");
    await page.route("**/api/tickets/*/olivia", async route => {
      proposals.push(new URL(route.request().url()).pathname);
      await route.fulfill({ json: {
        mode: "demo", summary: "QA summary", priority: "Media", category: "Servicio",
        draft: "QA draft for human review", nextAction: "QA next action",
        resolution: "QA resolution pending verification",
      } });
    });
    await page.reload();
    await page.locator("nav [data-view=olivia]").click();
    const options = await page.locator("#olivia-ticket option").evaluateAll(
      options => options.map(option => option.value),
    );
    assert.ok(options.length > 1, "The local demo needs multiple authorized requests");
    const selected = options[1];
    await page.locator("#olivia-ticket").selectOption(selected);
    assert.equal(await page.locator("[data-action=open-olivia]").isEnabled(), true);
    await page.locator("[data-action=open-olivia]").click();
    await page.locator("#suggestions").getByText("QA summary", { exact: true }).waitFor();
    assert.deepEqual(ticketRequests, [`/api/tickets/${selected}`]);
    assert.deepEqual(proposals, [`/api/tickets/${selected}/olivia`]);
    await page.locator('[data-action="close"]').click();
    await page.locator("nav [data-view=tickets]").click();
    await page.locator("#ticket-results table").waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
});
