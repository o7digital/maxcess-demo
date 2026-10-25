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
        performance:[{label:"Private agent name",total:5}],
        raw_tickets:[{title:"Private raw case"}],
        series: [],
      },
      "fr",
    );
    assert.equal(result, "Synthèse des indicateurs");
    assert.match(sent.messages[0].content, /français/);
    assert.ok(!JSON.stringify(sent).includes("Private customer name"));
    assert.ok(!JSON.stringify(sent).includes("Private agent name"));
    assert.ok(!JSON.stringify(sent).includes("Private raw case"));
    assert.equal(sent.max_tokens, 1600);
    assert.equal(JSON.parse(sent.messages[1].content).metrics.total, 5);
    for (const [language,name] of Object.entries({en:"English",es:"español",fr:"français",de:"Deutsch",it:"italiano",pt:"português",ja:"日本語",ru:"русский",da:"dansk"})) {
      await hfNarrative({metrics:{total:0},companies:[]},language);
      assert.ok(sent.messages[0].content.includes(name));
    }
    const {REPORT_TYPES}=await import('../public/report-types.js');
    for(const type of REPORT_TYPES){await hfNarrative({filters:{report_type:type.id},metrics:{total:2},business:{type:type.id,metrics:[],limitations:[],tables:[{key:'private',columns:[],rows:[{label:'Private site name',company:'Private company name',total:2}]}]}},'fr');assert.ok(sent.messages[0].content.includes(type.focus));assert.equal(JSON.parse(sent.messages[1].content).report_type,type.id);assert.ok(!JSON.stringify(sent).includes('Private site name'));assert.ok(!JSON.stringify(sent).includes('Private company name'));}
    await hfNarrative({filters:{report_type:'engineering'},business:{type:'engineering',metrics:[],limitations:[],tables:[{key:'many',columns:[],rows:Array.from({length:35},(_,i)=>({site:'Private '+i,total:i}))}]}},'fr');
    const evidence=JSON.parse(sent.messages[1].content).business.tables[0];assert.equal(evidence.rows_total,35);assert.equal(evidence.rows_truncated,true);assert.equal(evidence.rows.length,25);
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
