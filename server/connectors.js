import { pool, transaction } from "./db.js";
import { seal, unseal } from "./security.js";
import { fail } from "./workspace.js";
const providers = ["zendesk", "servicenow"];
export function connectorHost(provider, hostname) {
  if (!providers.includes(provider) || typeof hostname !== "string")
    throw fail(400, "Invalid integration");
  const value = hostname.trim().toLowerCase();
  if (
    !(
      provider === "zendesk"
        ? /^[a-z0-9][a-z0-9-]*\.zendesk\.com$/
        : /^[a-z0-9][a-z0-9-]*\.service-now\.com$/
    ).test(value)
  )
    throw fail(400, "Enter the instance hostname without a path");
  return value;
}
export function connectorPayload(provider, ticket, update = false) {
  if (provider === "zendesk")
    return {
      ticket: {
        subject: ticket.title,
        ...(!update
          ? { comment: { body: ticket.description, public: false } }
          : {}),
        external_id: "maxcess-" + ticket.tenant_id + "-" + ticket.id,
        priority: {
          Baja: "low",
          Media: "normal",
          Alta: "high",
          Crítica: "urgent",
        }[ticket.priority],
        status: {
          Abierto: "open",
          "En curso": "pending",
          Resuelto: "solved",
          Cerrado: "solved",
        }[ticket.status],
      },
    };
  return {
    short_description: ticket.title,
    description: ticket.description,
    correlation_id: "maxcess-" + ticket.tenant_id + "-" + ticket.id,
    urgency: { Baja: "3", Media: "2", Alta: "1", Crítica: "1" }[
      ticket.priority
    ],
  };
}
export async function remoteRequest(
  connection,
  path,
  method = "GET",
  body,
  transport = fetch,
) {
  const token = unseal(connection.credential);
  const r = await transport(
    `https://${connectorHost(connection.provider, connection.hostname)}${path}`,
    {
      method,
      redirect: "error",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!r.ok)
    throw fail(
      502,
      `Integration request failed (${r.status}). Check the account permissions.`,
    );
  return r.json();
}
export function installConnectorRoutes(app, limit) {
  const admin = (req, res, next) =>
    ["admin", "platform_admin"].includes(req.user.role)
      ? next()
      : next(fail(403, "Administrator access required"));
  app.get("/api/connectors", admin, async (req, res) =>
    res.json({
      connectors: (
        await pool.query(
          "SELECT provider,hostname,updated_at FROM ticket_connectors WHERE tenant_id=$1",
          [req.tenant.id],
        )
      ).rows,
    }),
  );
  app.put("/api/connectors/:provider", admin, limit, async (req, res) => {
    const provider = req.params.provider,
      hostname = connectorHost(provider, req.body.hostname),
      token = req.body.token;
    if (
      typeof token !== "string" ||
      token.length < 10 ||
      token.length > 4000 ||
      /[\r\n]/.test(token)
    )
      throw fail(400, "A valid OAuth access token is required");
    await pool.query(
      "INSERT INTO ticket_connectors(tenant_id,provider,hostname,credential) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,provider) DO UPDATE SET hostname=$3,credential=$4,updated_at=now()",
      [req.tenant.id, provider, hostname, seal(token)],
    );
    res.json({ ok: true });
  });
  app.delete("/api/connectors/:provider", admin, async (req, res) => {
    await pool.query(
      "DELETE FROM ticket_connectors WHERE tenant_id=$1 AND provider=$2",
      [req.tenant.id, req.params.provider],
    );
    res.json({ ok: true });
  });
  app.post("/api/connectors/:provider/test", admin, limit, async (req, res) => {
    const {
      rows: [c],
    } = await pool.query(
      "SELECT * FROM ticket_connectors WHERE tenant_id=$1 AND provider=$2",
      [req.tenant.id, req.params.provider],
    );
    if (!c) throw fail(404, "Integration not configured");
    await remoteRequest(
      c,
      c.provider === "zendesk"
        ? "/api/v2/users/me.json"
        : "/api/now/table/incident?sysparm_limit=1&sysparm_fields=sys_id",
    );
    res.json({ ok: true });
  });
  app.post(
    "/api/connectors/:provider/tickets/:id",
    admin,
    limit,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1)
        throw fail(400, "Invalid ticket");
      const result = await transaction(async (db) => {
        const {
          rows: [ticket],
        } = await db.query(
          "SELECT * FROM tickets WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
          [req.tenant.id, id],
        );
        if (!ticket) throw fail(404, "Ticket unavailable");
        const {
          rows: [c],
        } = await db.query(
          "SELECT * FROM ticket_connectors WHERE tenant_id=$1 AND provider=$2 FOR SHARE",
          [req.tenant.id, req.params.provider],
        );
        if (!c) throw fail(404, "Integration not configured");
        const {
          rows: [mapping],
        } = await db.query(
          "SELECT external_id FROM external_tickets WHERE tenant_id=$1 AND provider=$2 AND ticket_id=$3",
          [req.tenant.id, c.provider, id],
        );
        const isZendesk = c.provider === "zendesk",
          base = isZendesk ? "/api/v2/tickets" : "/api/now/table/incident";
        if (
          mapping &&
          !(
            /^[0-9]+$/.test(mapping.external_id) ||
            /^[a-f0-9]{32}$/.test(mapping.external_id)
          )
        )
          throw fail(400, "Invalid external record");
        const path =
          base +
          (mapping ? "/" + mapping.external_id : "") +
          (isZendesk ? ".json" : "");
        const data = await remoteRequest(
          c,
          path,
          mapping ? (isZendesk ? "PUT" : "PATCH") : "POST",
          connectorPayload(c.provider, ticket, Boolean(mapping)),
        );
        const external = String(
          (isZendesk ? data.ticket?.id : data.result?.sys_id) || "",
        );
        if (!external || external.length > 100)
          throw fail(502, "Integration returned an invalid record");
        await db.query(
          "INSERT INTO external_tickets(tenant_id,provider,ticket_id,external_id) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,provider,ticket_id) DO UPDATE SET synced_at=now(),external_id=$4",
          [req.tenant.id, c.provider, id, external],
        );
        await db.query(
          "INSERT INTO workspace_audit(tenant_id,actor_id,action,details) VALUES($1,$2,'connector.exported',$3)",
          [
            req.tenant.id,
            req.user.id,
            { provider: c.provider, ticket_id: id, external_id: external },
          ],
        );
        return { external_id: external };
      });
      res.json(result);
    },
  );
}
