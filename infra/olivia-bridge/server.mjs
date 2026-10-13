// Dedicated server-to-server gateway. V3.5 API stays private on VPS2.
import http from "node:http";
import { timingSafeEqual, createHmac } from "node:crypto";
const upstream = process.env.V3_URL || "http://olivia-v3:8093",
  tokens = new Map();
const prefix = "service-hub-dev-";
function authorized(value) {
  const a = Buffer.from(value || ""),
    b = Buffer.from(`Bearer ${process.env.BRIDGE_API_KEY}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
const password = (scope) =>
  createHmac("sha256", process.env.BRIDGE_USER_SECRET)
    .update(scope)
    .digest("base64url");
async function call(path, tenant, token, body) {
  return fetch(new URL(path, upstream), {
    method: "POST",
    signal: AbortSignal.timeout(55000),
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": tenant,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
http
  .createServer(async (req, res) => {
    const reply = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
    };
    if (req.url === "/health" && req.method === "GET")
      return reply(200, { status: "ok", version: "3.5" });
    if (req.url !== "/chat" || req.method !== "POST")
      return reply(404, { error: "Not found" });
    if (!authorized(req.headers.authorization))
      return reply(401, { error: "Unauthorized" });
    try {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 16000)
          return reply(413, { error: "Too large" });
      }
      const body = JSON.parse(raw),
        scope = body.scope;
      if (
        typeof scope !== "string" ||
        !/^(global|client-[1-9]\d*|support-[1-9]\d*)$/.test(scope) ||
        typeof body.message !== "string" ||
        !body.message.trim() ||
        body.message.length > 12000
      )
        return reply(400, { error: "Invalid input" });
      const tenant = prefix + scope;
      let token = tokens.get(tenant);
      async function login() {
        const r = await call("/v1/auth/login", tenant, null, {
          email: "maxcess-dev@o7digitalgroup.com",
          password: password(scope),
        });
        if (!r.ok) throw new Error("Login unavailable");
        const data = await r.json();
        tokens.set(tenant, data.access_token);
        return data.access_token;
      }
      if (!token) token = await login();
      let answer = await call("/v1/chat", tenant, token, {
        message: body.message,
        conversation_id: body.conversation_id || null,
        routing: "FAST",
      });
      if (answer.status === 401) {
        token = await login();
        answer = await call("/v1/chat", tenant, token, {
          message: body.message,
          conversation_id: body.conversation_id || null,
          routing: "FAST",
        });
      }
      if (!answer.ok)
        return reply(answer.status === 429 ? 429 : 502, {
          error: "Olivia upstream unavailable",
        });
      const data = await answer.json();
      if (typeof data.answer !== "string") throw new Error("Invalid answer");
      reply(200, {
        answer: data.answer,
        conversation_id: data.conversation_id,
        version: "3.5",
      });
    } catch {
      reply(502, { error: "Olivia unavailable" });
    }
  })
  .listen(3096, "0.0.0.0");
