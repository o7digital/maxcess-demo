import { ticketDepartment } from "./roles.js";
import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import unzipper from "unzipper";
import { transaction } from "./db.js";
import { globalAccess } from "./permissions.js";
import { fail, str, settingsOf, customFields, audit } from "./workspace.js";
async function readUpload(body) {
  if (
    !["csv", "xlsx"].includes(body.format) ||
    typeof body.file !== "string" ||
    body.file.length > 1400000
  )
    throw fail(400, "Carga un CSV o Excel de hasta 1 MB");
  const buffer = Buffer.from(body.file, "base64");
  if (buffer.length > 1000000) throw fail(400, "Archivo demasiado grande");
  let columns, rows;
  if (body.format === "csv") {
    let matrix;
    try {
      matrix = parse(buffer, {
        bom: true,
        skip_empty_lines: true,
        max_record_size: 32000,
        to_line: 503,
      });
    } catch {
      throw fail(400, "CSV no válido. Usa encabezados y separadores de coma.");
    }
    if (!matrix.length) throw fail(400, "Archivo vacío");
    [columns, ...rows] = matrix;
  } else {
    try {
      const zip = await unzipper.Open.buffer(buffer);
      if (
        zip.files.length > 200 ||
        zip.files.reduce((n, f) => n + f.uncompressedSize, 0) > 10000000
      )
        throw new Error("Archive limit");
      let expanded = 0;
      for (const file of zip.files) {
        if (file.type === "Directory") continue;
        const stream = file.stream();
        try {
          for await (const chunk of stream) {
            expanded += chunk.length;
            if (expanded > 10000000) throw new Error("Expanded archive limit");
          }
        } finally {
          stream.destroy();
        }
      }
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.worksheets[0];
      if (!sheet || sheet.rowCount > 501 || sheet.columnCount > 40)
        throw new Error("Sheet limit");
      const matrix = [];
      sheet.eachRow((row) =>
        matrix.push(
          row.values
            .slice(1)
            .map((v) =>
              v === null || v === undefined
                ? ""
                : typeof v === "object"
                  ? v.text || ""
                  : String(v),
            ),
        ),
      );
      [columns, ...rows] = matrix;
    } catch {
      throw fail(
        400,
        "Excel no válido o demasiado grande. Usa una hoja de hasta 500 filas y 40 columnas.",
      );
    }
  }
  if (!columns?.length || columns.length > 40 || rows.length > 500)
    throw fail(400, "Máximo 500 filas y 40 columnas");
  columns = columns.map((c) => str(c, "Encabezado", 100));
  if (new Set(columns).size !== columns.length)
    throw fail(400, "Los encabezados deben ser únicos");
  return {
    columns,
    rows: rows.map((row) =>
      Object.fromEntries(
        columns.map((c, i) => [c, String(row[i] ?? "").trim()]),
      ),
    ),
  };
}
export function installImportRoutes(app) {
  app.post("/api/import/preview", async (req, res) => {
    if (!globalAccess(req.user))
      throw fail(403, "Acceso reservado al responsable");
    const data = await readUpload(req.body);
    const settings = settingsOf(req.tenant);
    const standard =
      req.body.kind === "tickets"
        ? ["title", "company", "site", "category", "description", "priority"]
        : ["name", "sector", "site"];
    res.json({
      columns: data.columns,
      rows: data.rows.slice(0, 5),
      total: data.rows.length,
      mapping_fields: [
        ...standard.map((key) => ({ key, label: key, required: true })),
        ...(req.body.kind === "tickets"
          ? settings.fields.map((f) => ({
              key: "custom_" + f.key,
              label: f.label,
              required: f.required,
            }))
          : []),
      ],
    });
  });
  app.post("/api/import/commit", async (req, res) => {
    if (!globalAccess(req.user))
      throw fail(403, "Acceso reservado al responsable");
    const b = req.body;
    if (
      !["companies", "tickets"].includes(b.kind) ||
      b.confirm !== true ||
      !b.mapping ||
      typeof b.mapping !== "object"
    )
      throw fail(400, "Confirma el tipo y la correspondencia de columnas");
    const data = await readUpload(b),
      settings = settingsOf(req.tenant);
    const fields =
      b.kind === "companies"
        ? ["name", "sector", "site"]
        : ["title", "company", "site", "category", "description", "priority"];
    for (const f of fields)
      if (!data.columns.includes(b.mapping[f]))
        throw fail(400, `Selecciona la columna para ${f}`);
    const count = await transaction(async (db) => {
      let count = 0;
      for (const row of data.rows) {
        const v = Object.fromEntries(fields.map((f) => [f, row[b.mapping[f]]]));
        try {
          if (b.kind === "companies") {
            await db.query(
              "INSERT INTO companies(tenant_id,name,sector,site) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,name) DO NOTHING",
              [
                req.tenant.id,
                str(v.name, "Empresa"),
                str(v.sector, "Sector"),
                str(v.site, "Sede"),
              ],
            );
          } else {
            const {
              rows: [company],
            } = await db.query(
              "SELECT id FROM companies WHERE tenant_id=$1 AND name=$2",
              [req.tenant.id, v.company],
            );
            if (!company) throw fail(400, "Importa primero la empresa cliente");
            if (
              !settings.categories.includes(v.category) ||
              !Object.hasOwn(settings.sla, v.priority)
            )
              throw fail(400, "Categoría o prioridad no válida");
            const values = {};
            for (const f of settings.fields) {
              const column = b.mapping["custom_" + f.key];
              if (!column) continue;
              if (!data.columns.includes(column))
                throw fail(400, "Columna personalizada no válida");
              const raw = row[column];
              values[f.key] =
                f.type === "number" && raw !== ""
                  ? Number(raw)
                  : f.type === "checkbox"
                    ? ["true", "1", "yes", "si", "sí"].includes(
                        raw.toLowerCase(),
                      )
                    : raw;
            }
            const custom = customFields(values, settings),
              rule = settings.rules.find((r) => r.category === v.category);
            const {
              rows: [ticket],
            } = await db.query(
              "INSERT INTO tickets(tenant_id,title,company_id,site,category,description,priority,requested_priority,created_by,due_at,custom_fields,workflow_stage,agent_id,department_id) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8,now()+($9*interval '1 hour'),$10,$11,$12,$13) RETURNING id",
              [
                req.tenant.id,
                str(v.title, "Asunto"),
                company.id,
                str(v.site, "Sede"),
                v.category,
                str(v.description, "Descripción", 4000),
                v.priority,
                req.user.id,
                settings.sla[v.priority],
                custom,
                settings.workflow.find((w) => w.state === "Abierto").name,
                rule?.agent_id || null,
                await ticketDepartment(db, req.user, null, rule?.agent_id),
              ],
            );
            await db.query(
              "INSERT INTO events(tenant_id,ticket_id,actor_id,kind,body) VALUES($1,$2,$3,'history','Solicitud importada')",
              [req.tenant.id, ticket.id, req.user.id],
            );
          }
          count++;
        } catch (e) {
          if (e.status) throw fail(400, `Fila ${count + 2}: ${e.message}`);
          throw e;
        }
      }
      await audit(db, req, "import.completed", { kind: b.kind, rows: count });
      return count;
    });
    res.status(201).json({ processed: count });
  });
}
