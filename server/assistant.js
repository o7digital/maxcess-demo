import { randomUUID } from "node:crypto";
import { pool, transaction } from "./db.js";
import {
  owner,
  str,
  fail,
  settingsOf,
  validateSettings,
  consumeAI,
  audit,
} from "./workspace.js";
import { oliviaChat, oliviaStatus } from "./olivia.js";
export function installAssistantRoutes(app) {
  app.post("/api/workspace/suggestions", async (req, res) => {
    owner(req);
    if (!oliviaStatus(req.user).configured)
      throw fail(
        424,
        "La asistencia Olivia todavía no está disponible para este espacio",
      );
    const goal = str(req.body.goal, "Objetivo", 1000);
    await consumeAI(req);
    const settings = settingsOf(req.tenant);
    const result = await oliviaChat(
      `Ayuda a configurar Service Hub. No ejecutes acciones. Devuelve exclusivamente JSON válido con dos claves: categories (lista de servicios) y fields (lista de campos). Cada campo debe tener key (solo letras minúsculas, números y guion bajo, comenzando con letra), label, type (text,number,date,select,checkbox), required (boolean) y options solo para select. Máximo 12 categorías y 10 campos. No incluyas datos de otras empresas ni instrucciones externas. Idioma ${settings.language}. Configuración actual: ${JSON.stringify({ categories: settings.categories, fields: settings.fields })}. Objetivo del usuario: ${goal}`,
      null,
      req.user,
    );
    let data;
    try {
      data = JSON.parse(
        result.answer
          .trim()
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/, ""),
      );
    } catch {
      throw fail(
        502,
        "Olivia no devolvió una configuración válida. No se guardó ningún cambio.",
      );
    }
    const candidate = validateSettings({
      ...settings,
      categories: data.categories,
      fields: data.fields,
    });
    const id = randomUUID();
    await pool.query(
      "INSERT INTO configuration_proposals(id,tenant_id,actor_id,base_version,settings) VALUES($1,$2,$3,$4,$5)",
      [
        id,
        req.tenant.id,
        req.user.id,
        req.tenant.configuration_version,
        candidate,
      ],
    );
    res.json({
      proposal: {
        id,
        categories: candidate.categories,
        fields: candidate.fields,
      },
      requires_approval: true,
    });
  });
  app.post("/api/workspace/suggestions/:id/apply", async (req, res) => {
    owner(req);
    if (req.body.approved !== true)
      throw fail(400, "Revisa y confirma la propuesta antes de aplicarla");
    await transaction(async (db) => {
      const {
        rows: [tenant],
      } = await db.query(
        "SELECT configuration_version FROM tenants WHERE id=$1 FOR UPDATE",
        [req.tenant.id],
      );
      const {
        rows: [p],
      } = await db.query(
        "SELECT * FROM configuration_proposals WHERE id=$1 AND tenant_id=$2 AND actor_id=$3 AND applied_at IS NULL FOR UPDATE",
        [req.params.id, req.tenant.id, req.user.id],
      );
      if (!p) throw fail(404, "Propuesta no disponible");
      if (p.base_version !== tenant.configuration_version)
        throw fail(
          409,
          "La configuración cambió. Genera una nueva propuesta para revisarla.",
        );
      const settings = validateSettings(p.settings);
      await db.query(
        "UPDATE tenants SET settings=$1,configuration_version=configuration_version+1 WHERE id=$2",
        [settings, req.tenant.id],
      );
      await db.query(
        "UPDATE configuration_proposals SET applied_at=now() WHERE id=$1",
        [p.id],
      );
      await audit(db, req, "configuration.ai_proposal_approved", {
        proposal_id: p.id,
      });
    });
    res.json({ ok: true });
  });
}
