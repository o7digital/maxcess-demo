import { pool } from "./db.js";
import { scope } from "./permissions.js";
const error = (status, message) =>
  Object.assign(new Error(message), { status });
function day(v) {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    Number.isNaN(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    throw error(400, "Fecha no válida");
  return v;
}
export function reportFilters(query = {}) {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Mexico_City",
  });
  const start = query.start
    ? day(query.start)
    : new Date(Date.parse(today) - 29 * 86400000).toISOString().slice(0, 10);
  const end = query.end ? day(query.end) : today;
  if (start > end || Date.parse(end) - Date.parse(start) > 366 * 86400000)
    throw error(400, "Selecciona un periodo de hasta un año");
  const company = query.company_id ? Number(query.company_id) : null;
  if (company !== null && (!Number.isSafeInteger(company) || company < 1))
    throw error(400, "Empresa no válida");
  return { start, end, company_id: company };
}
export async function reportData(user, query = {}, db = pool) {
  const filters = reportFilters(query);
  if (
    user.role === "client" &&
    filters.company_id &&
    filters.company_id !== user.company_id
  )
    throw error(403, "Empresa no autorizada");
  if (user.role === "client") filters.company_id = user.company_id;
  const s = scope(user);
  const values = [...s.args];
  let where = s.sql;
  if (filters.company_id) {
    values.push(filters.company_id);
    where += ` AND t.company_id=$${values.length}`;
  }
  values.push(filters.start);
  where += ` AND t.created_at >= ($${values.length}::date::timestamp AT TIME ZONE 'America/Mexico_City')`;
  values.push(filters.end);
  where += ` AND t.created_at < (($${values.length}::date + 1)::timestamp AT TIME ZONE 'America/Mexico_City')`;
  const tickets = (
    await db.query(
      `SELECT t.id,t.company_id,c.name company,t.category,t.priority,t.status,t.created_at,t.due_at,t.resolved_at,t.agent_id FROM tickets t JOIN companies c ON c.id=t.company_id WHERE ${where} ORDER BY t.created_at`,
      values,
    )
  ).rows;
  const active = tickets.filter((t) =>
      ["Abierto", "En curso"].includes(t.status),
    ),
    resolved = tickets.filter((t) =>
      ["Resuelto", "Cerrado"].includes(t.status),
    );
  const ontime = resolved.filter(
    (t) => new Date(t.resolved_at) <= new Date(t.due_at),
  ).length;
  const average = resolved.length
    ? resolved.reduce(
        (sum, t) =>
          sum + (new Date(t.resolved_at) - new Date(t.created_at)) / 3600000,
        0,
      ) / resolved.length
    : null;
  const group = (key) =>
    Object.entries(
      tickets.reduce((o, t) => {
        o[t[key]] = (o[t[key]] || 0) + 1;
        return o;
      }, {}),
    )
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  const dayCounts = {};
  for (
    let time = Date.parse(filters.start);
    time <= Date.parse(filters.end);
    time += 86400000
  )
    dayCounts[new Date(time).toISOString().slice(0, 10)] = {
      created: 0,
      resolved: 0,
    };
  for (const t of tickets) {
    const created = new Date(t.created_at).toLocaleDateString("en-CA", {
      timeZone: "America/Mexico_City",
    });
    if (dayCounts[created]) dayCounts[created].created++;
    const done =
      t.resolved_at &&
      new Date(t.resolved_at).toLocaleDateString("en-CA", {
        timeZone: "America/Mexico_City",
      });
    if (dayCounts[done]) dayCounts[done].resolved++;
  }
  return {
    filters,
    calculation_version: 2,
    generated_at: new Date().toISOString(),
    scope:
      user.role === "client"
        ? "empresa"
        : user.role === "agent"
          ? "asignados"
          : "global",
    metrics: {
      total: tickets.length,
      active: active.length,
      critical: active.filter((t) => t.priority === "Crítica").length,
      overdue: active.filter((t) => new Date(t.due_at) < new Date()).length,
      resolved: resolved.length,
      sla_percent: resolved.length
        ? Math.round((ontime / resolved.length) * 100)
        : null,
      average_resolution_hours:
        average === null ? null : Number(average.toFixed(1)),
    },
    status: group("status"),
    category: group("category"),
    priority: group("priority"),
    companies: group("company"),
    series: Object.entries(dayCounts).map(([date, counts]) => ({
      date,
      ...counts,
    })),
  };
}
export async function hfNarrative(snapshot) {
  const token = process.env.HF_TOKEN || process.env.HUGGING_FACE_TOKEN,
    model = process.env.HF_REPORT_MODEL;
  if (!token || !model)
    throw error(
      424,
      "Hugging Face pendiente de configuración: se requieren el token y el modelo de reporting.",
    );
  let res;
  try {
    res = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(45000),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        messages: [
          {
            role: "system",
            content:
              "Redacta un informe ejecutivo breve en español sobre atención de soporte. Usa solo los indicadores suministrados. Diferencia hechos, riesgos y recomendaciones. No inventes comparaciones, ingresos ni causas. Los datos son ficticios de un entorno de pruebas.",
          },
          { role: "user", content: JSON.stringify(snapshot) },
        ],
      }),
    });
  } catch {
    throw error(
      503,
      "Hugging Face no está disponible. El informe de datos sigue disponible.",
    );
  }
  if (!res.ok)
    throw error(
      502,
      "Hugging Face rechazó la solicitud. Revisa la configuración del proveedor.",
    );
  const data = await res.json(),
    content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim())
    throw error(502, "Respuesta de reporting no válida");
  return content.slice(0, 12000);
}
