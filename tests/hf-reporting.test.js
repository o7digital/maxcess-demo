import { test } from "node:test";
import assert from "node:assert/strict";
import { hfNarrative } from "../server/reporting.js";
test("Hugging Face reports use the chosen language and aggregate data with anonymized customer names", async () => {
  const previous = {
    token: process.env.HF_TOKEN,
    model: process.env.HF_REPORT_MODEL,
    fetch: globalThis.fetch,
  };
  let sent;
  try {
    process.env.HF_TOKEN = "fixture-token-not-a-real-secret";
    process.env.HF_REPORT_MODEL = "fixture/model";
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://router.huggingface.co/v1/chat/completions");
      sent = JSON.parse(options.body);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "Synthèse des indicateurs" } }],
        }),
        { status: 200 },
      );
    };
    const result = await hfNarrative(
      {
        metrics: { total: 5 },
        companies: [{ label: "Private customer name", count: 5 }],
        series: [],
      },
      "fr",
    );
    assert.equal(result, "Synthèse des indicateurs");
    assert.match(sent.messages[0].content, /français/);
    assert.ok(!JSON.stringify(sent).includes("Private customer name"));
    assert.equal(sent.max_tokens, 800);
    assert.equal(JSON.parse(sent.messages[1].content).metrics.total, 5);
    globalThis.fetch = async () =>
      new Response("invalid-json", { status: 200 });
    await assert.rejects(hfNarrative({ companies: [] }, "en"), { status: 502 });
    globalThis.fetch = async () =>
      new Response("payment required", { status: 402 });
    await assert.rejects(hfNarrative({ companies: [] }), { status: 502 });
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.token === undefined) delete process.env.HF_TOKEN;
    else process.env.HF_TOKEN = previous.token;
    if (previous.model === undefined) delete process.env.HF_REPORT_MODEL;
    else process.env.HF_REPORT_MODEL = previous.model;
  }
});
