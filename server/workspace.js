import { localizedEmail } from "./localization.js";
import { countries, languages } from "../public/international.js";
import { LEGAL_VERSION } from "../public/legal.js";
import { ACTIVATION_CENTS, CURRENCY, BILLING_MODEL } from "../public/pricing.js";
import { resolveStaff, seedRoles } from "./roles.js";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { pool, transaction } from "./db.js";
import { hashPassword, exposeUser } from "./identity.js";
import { globalAccess } from "./permissions.js";
import { issueToken } from "./account.js";
export const fail = (status, message) =>
  Object.assign(new Error(message), { status });
export const tenantId = (user) => user.tenant_id;
export const defaults = {
  language: "es",
  timezone: "America/Mexico_City",
  sector: "",
  logo: "",
  categories: ["Conectividad", "Equipos", "Facturación", "Accesos", "Servicio"],
  departments: [],
  sites: [],
  sla: { Baja: 48, Media: 24, Alta: 8, Crítica: 2 },
  fields: [],
  workflow: [
    { name: "Abierto", state: "Abierto" },
    { name: "En curso", state: "En curso" },
    { name: "Resuelto", state: "Resuelto" },
    { name: "Cerrado", state: "Cerrado" },
  ],
  rules: [],
  escalations: [],
  overdue_alerts: true,
  dashboard: ["active", "critical", "overdue", "sla_percent"],
};
export function str(value, label, max = 160) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw fail(400, `${label}: valor no válido`);
  return value.trim();
}
export function email(value) {
  const result = str(value, "Correo", 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))
    throw fail(400, "Correo no válido");
  return result;
}
export function password(value) {
  if (
    typeof value !== "string" ||
    value.length < 12 ||
    Buffer.byteLength(value) > 72
  )
    throw fail(
      400,
      "La contraseña debe tener al menos 12 caracteres y como máximo 72 bytes",
    );
  return value;
}
export const tokenHash = (token) =>
  createHash("sha256").update(String(token)).digest("hex");
export function settingsOf(tenant) {
  return { ...defaults, ...tenant.settings };
}
export function validateSettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw fail(400, "Configuración no válida");
  for (const key of Object.keys(input))
    if (!Object.hasOwn(defaults, key))
      throw fail(400, `Configuración desconocida: ${key}`);
  const s = { ...defaults, ...input };
  if (!Object.hasOwn(languages, s.language))
    throw fail(400, "Idioma no válido");
  try {
    new Intl.DateTimeFormat("en", { timeZone: s.timezone });
  } catch {
    throw fail(400, "Zona horaria no válida");
  }
  if (
    typeof s.timezone !== "string" ||
    typeof s.sector !== "string" ||
    s.sector.length > 160 ||
    typeof s.logo !== "string" ||
    s.logo.length > 2000
  )
    throw fail(400, "Identidad no válida");
  if (
    s.logo &&
    !/^https:\/\//.test(s.logo) &&
    !/^\/api\/workspace\/logo\/[0-9a-f-]{36}$/i.test(s.logo)
  )
    throw fail(400, "El logo debe usar una URL HTTPS");
  if(typeof s.overdue_alerts !== "boolean") throw fail(400,"Alertas no válidas");
  for (const key of ["categories", "departments", "sites"]) {
    if (
      !Array.isArray(s[key]) ||
      s[key].length > 50 ||
      (key === "categories" && !s[key].length)
    )
      throw fail(400, `Lista no válida: ${key}`);
    s[key] = s[key].map((v) => str(v, key, 80));
    if (new Set(s[key]).size !== s[key].length)
      throw fail(400, "No se permiten duplicados");
  }
  for (const p of ["Baja", "Media", "Alta", "Crítica"])
    if (!Number.isFinite(s.sla?.[p]) || s.sla[p] < 0.25 || s.sla[p] > 8760)
      throw fail(400, "SLA no válido");
  if (!Array.isArray(s.fields) || s.fields.length > 20)
    throw fail(400, "Máximo 20 campos");
  const keys = new Set();
  s.fields = s.fields.map((f) => {
    if (!f || typeof f !== "object" || Array.isArray(f))
      throw fail(400, "Campo no válido");
    if (
      !/^[a-z][a-z0-9_]{0,39}$/.test(f.key) ||
      keys.has(f.key) ||
      !["text", "number", "date", "select", "checkbox"].includes(f.type) ||
      typeof f.required !== "boolean"
    )
      throw fail(400, "Campo no válido");
    keys.add(f.key);
    const field = {
      key: f.key,
      label: str(f.label, "Etiqueta", 80),
      type: f.type,
      required: f.required,
    };
    if (f.type === "select") {
      if (
        !Array.isArray(f.options) ||
        !f.options.length ||
        f.options.length > 30
      )
        throw fail(400, "Opciones no válidas");
      field.options = f.options.map((x) => str(x, "Opción", 80));
    }
    return field;
  });
  if (
    !Array.isArray(s.workflow) ||
    s.workflow.length < 4 ||
    s.workflow.length > 20
  )
    throw fail(400, "Workflow no válido");
  s.workflow = s.workflow.map((w) => {
    if (!w || typeof w !== "object") throw fail(400, "Etapa no válida");
    return {
      name: str(w.name, "Etapa", 60),
      state: str(w.state, "Estado", 40),
    };
  });
  if (
    new Set(s.workflow.map((w) => w.name)).size !== s.workflow.length ||
    !["Abierto", "En curso", "Resuelto", "Cerrado"].every((state) =>
      s.workflow.some((w) => w.state === state),
    ) ||
    s.workflow.some(
      (w) => !["Abierto", "En curso", "Resuelto", "Cerrado"].includes(w.state),
    )
  )
    throw fail(
      400,
      "Las etapas deben cubrir apertura, atención, resolución y cierre",
    );
  if (!Array.isArray(s.rules) || s.rules.length > 30)
    throw fail(400, "Reglas no válidas");
  s.rules = s.rules.map((r) => {
    if (!r || typeof r !== "object") throw fail(400, "Regla no válida");
    if (
      !s.categories.includes(r.category) ||
      !Number.isSafeInteger(r.agent_id) ||
      r.agent_id < 1 ||
      typeof r.notify !== "boolean"
    )
      throw fail(400, "Regla no válida");
    return { category: r.category, agent_id: r.agent_id, notify: r.notify };
  });
  if (!Array.isArray(s.escalations) || s.escalations.length > 12)
    throw fail(400, "Escalaciones no válidas");
  s.escalations = s.escalations.map((r) => {
    if (!r || typeof r !== "object") throw fail(400, "Escalación no válida");
    if (
      !["Baja", "Media", "Alta", "Crítica"].includes(r.priority) ||
      !Number.isFinite(r.after_hours) ||
      r.after_hours < 0.25 ||
      r.after_hours > 8760 ||
      !Number.isSafeInteger(r.agent_id) ||
      r.agent_id < 1 ||
      typeof r.notify !== "boolean"
    )
      throw fail(400, "Escalación no válida");
    return {
      priority: r.priority,
      after_hours: r.after_hours,
      agent_id: r.agent_id,
      notify: r.notify,
    };
  });
  if (
    !Array.isArray(s.dashboard) ||
    !s.dashboard.length ||
    s.dashboard.length > 6 ||
    s.dashboard.some(
      (v) =>
        ![
          "active",
          "critical",
          "overdue",
          "sla_percent",
          "total",
          "resolved",
        ].includes(v),
    )
  )
    throw fail(400, "Indicadores no válidos");
  return s;
}
export function customFields(values = {}, settings) {
  if (!values || typeof values !== "object" || Array.isArray(values))
    throw fail(400, "Campos personalizados no válidos");
  for (const key of Object.keys(values))
    if (!settings.fields.some((f) => f.key === key))
      throw fail(400, "Campo desconocido");
  const result = {};
  for (const f of settings.fields) {
    const v = values[f.key];
    if (v === undefined || v === null || v === "") {
      if (f.required) throw fail(400, `${f.label}: campo obligatorio`);
      continue;
    }
    if (f.type === "number" && (typeof v !== "number" || !Number.isFinite(v)))
      throw fail(400, `${f.label}: número no válido`);
    if (f.type === "checkbox" && (typeof v !== "boolean" || (f.required && !v)))
      throw fail(400, `${f.label}: confirma el campo`);
    if (["text", "date", "select"].includes(f.type) && typeof v !== "string")
      throw fail(400, `${f.label}: valor no válido`);
    if (f.type === "text" && v.length > 2000)
      throw fail(400, `${f.label}: demasiado largo`);
    if (f.type === "select" && !f.options.includes(v))
      throw fail(400, `${f.label}: opción no válida`);
    if (
      f.type === "date" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(v) ||
        Number.isNaN(Date.parse(v)) ||
        new Date(v).toISOString().slice(0, 10) !== v)
    )
      throw fail(400, `${f.label}: fecha no válida`);
    result[f.key] = v;
  }
  return result;
}
export async function seatCount(db, tenant) {
  const agentsOnly = ["activation_usd_agents_v2", BILLING_MODEL].includes(tenant.billing_model);
  const {rows:[r]} = await db.query(
    "SELECT (SELECT count(*)::int FROM users WHERE tenant_id=$1 AND active AND (NOT $2::boolean OR role<>'client'))+(SELECT count(*)::int FROM invitations WHERE tenant_id=$1 AND accepted_at IS NULL AND expires_at>now() AND (NOT $2::boolean OR role<>'client')) AS total",
    [tenant.id, agentsOnly]);
  return Number(r.total);
}
export async function seats(db, tenant, extra = 1, role = "agent") {
  const {rows:[current]} = await db.query("SELECT id,seat_limit,billing_model FROM tenants WHERE id=$1 FOR UPDATE",[tenant.id]);
  if (!current) throw fail(403, "Espacio no disponible");
  if (["activation_usd_agents_v2", BILLING_MODEL].includes(current.billing_model) && role === "client") return;
  if (await seatCount(db,current) + extra > current.seat_limit)
    throw fail(409, "Se alcanzó el límite de agentes. Cambia de plan en Suscripción.");
}
export function owner(req) {
  if (!["admin", "platform_admin"].includes(req.user.role))
    throw fail(403, "Acceso reservado a administración");
}
export async function audit(db, req, action, details = {}) {
  await db.query(
    "INSERT INTO workspace_audit(tenant_id,actor_id,action,details) VALUES($1,$2,$3,$4)",
    [req.user.tenant_id, req.user.id, action, details],
  );
}
export const publicOrigin = () => {
  const url = process.env.PUBLIC_APP_URL;
  if (!url || !/^https:\/\//.test(url))
    throw fail(
      503,
      "El servicio está en preparación. Contacta con O7 Digital Group.",
    );
  return url.replace(/\/$/, "");
};
export async function queueEmail(db, tenant, key, recipient, subject, body) {
  ({subject, body} = await localizedEmail(db, tenant, recipient, key, subject, body));
  await db.query(
    "INSERT INTO notification_outbox(tenant_id,dedupe_key,recipient,subject,body) VALUES($1,$2,$3,$4,$5) ON CONFLICT(dedupe_key) DO NOTHING",
    [tenant, key, recipient, subject, body],
  );
}
export function accessState(t) {
  if (t.is_demo) return "full";
  if (t.status === "suspended") return "blocked";
  if (t.status === "active") return "full";
  if (t.status === "trialing" && new Date(t.trial_ends_at) > new Date())
    return "full";
  if (
    t.status === "past_due" &&
    t.grace_ends_at &&
    new Date(t.grace_ends_at) > new Date()
  )
    return "full";
  return "read_only";
}
export async function consumeAI(req, db = pool) {
  if (!req.tenant.is_demo && accessState(req.tenant) !== "full")
    throw fail(402, "Activa tu suscripción para usar Olivia");
  const r = await db.query(
    "INSERT INTO ai_usage(tenant_id,used) SELECT $1,1 WHERE $2>0 ON CONFLICT(tenant_id,period) DO UPDATE SET used=ai_usage.used+1 WHERE ai_usage.used<$2 RETURNING used",
    [req.user.tenant_id, req.tenant.ai_limit],
  );
  if (!r.rowCount)
    throw fail(429, "Se alcanzó la cuota de asistencia IA de este mes");
}
export function installPublicWorkspaceRoutes(app, limit) {
  app.get("/api/plans", async (req, res) =>
    res.json({
      activation_cents: ACTIVATION_CENTS,
      billing_model: BILLING_MODEL,
      seat_basis: "agents",
      currency: CURRENCY,
      trial_days: 14,
      plans: (
        await pool.query(
          "SELECT * FROM billing_plans WHERE active AND currency='usd' ORDER BY seat_limit",
        )
      ).rows,
    }),
  );
  app.get("/api/templates", async (req, res) =>
    res.json({
      templates: (
        await pool.query(
          "SELECT * FROM configuration_templates WHERE active ORDER BY id",
        )
      ).rows,
    }),
  );
  app.post("/api/register", limit, async (req, res) => {
    if (process.env.REGISTRATION_ENABLED !== "true")
      throw fail(
        503,
        "Las inscripciones abrirán próximamente. Contacta con O7 Digital Group.",
      );
    const b = req.body,
      mail = email(b.email),
      first = str(b.first_name, "Nombre", 70),
      last = str(b.last_name, "Apellido", 70),
      name = `${first} ${last}`,
      business = str(b.company, "Empresa");
    const address = str(b.address, "Dirección", 600), country = str(b.country, "País", 2).toUpperCase(), tax = str(b.tax_id, "Tax ID", 100), phone = str(b.phone, "Teléfono", 20);
    if (!countries.includes(country) || !/^\+[1-9]\d{7,14}$/.test(phone)) throw fail(400, "País o teléfono internacional no válido");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.birth_date || "") || !Number.isFinite(Date.parse(b.birth_date)) || new Date(b.birth_date).toISOString().slice(0,10)!==b.birth_date || b.birth_date > new Date().toISOString().slice(0,10) || b.birth_date < "1900-01-01") throw fail(400,"Fecha de nacimiento no válida");
    const hash = await hashPassword(password(b.password));
    if (b.accepted_terms !== true || !Object.hasOwn(languages, b.language))
      throw fail(400, "Acepta las condiciones y selecciona el idioma");
    const result = await transaction(async (db) => {
      if (
        (await db.query("SELECT id FROM users WHERE lower(email)=$1", [mail]))
          .rowCount
      )
        throw fail(
          409,
          "No se pudo registrar esta cuenta. Usa otro correo o inicia sesión.",
        );
      const {
        rows: [tenant],
      } = await db.query(
        "INSERT INTO tenants(name,settings,legal_name,billing_address,billing_country,tax_id) VALUES($1,$2,$1,$3,$4,$5) RETURNING *",
        [business, { ...defaults, language: b.language }, address, country, tax],
      );
      await seedRoles(db, tenant.id);
      const {
        rows: [user],
      } = await db.query(
        "INSERT INTO users(tenant_id,email,name,role,password_hash,first_name,last_name,birth_date,phone,language) VALUES($1,$2,$3,'admin',$4,$5,$6,$7,$8,$9) RETURNING *",
        [tenant.id, mail, name, hash, first, last, b.birth_date, phone, b.language],
      );
      await db.query(
        "INSERT INTO companies(tenant_id,name,sector,site) VALUES($1,$2,$3,$4)",
        [tenant.id, business, "Servicio", "Principal"],
      );
      await db.query(
        "INSERT INTO workspace_audit(tenant_id,actor_id,action,details) VALUES($1,$2,'registered',$3)",
        [
          tenant.id,
          user.id,
          {
            terms_version: LEGAL_VERSION,
            privacy_version: LEGAL_VERSION,
            notice_language: "en",
            interface_language: b.language,
            accepted_at: new Date().toISOString(),
          },
        ],
      );
      await queueEmail(
        db,
        tenant.id,
        `welcome:${tenant.id}`,
        mail,
        "Bienvenido a Service Hub",
        `Tu espacio ${business} está listo. Tu prueba de 14 días naturales termina el ${tenant.trial_ends_at.toISOString()}. No se realizará ningún cargo sin tu suscripción explícita.`,
      );
      await issueToken(db, user, "verify");
      return { tenant, user };
    });
    await new Promise((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    req.session.userId = result.user.id;
    req.session.csrf = randomBytes(24).toString("hex");
    res.status(201).json({
      user: exposeUser(result.user),
      csrf: req.session.csrf,
      trial_ends_at: result.tenant.trial_ends_at,
    });
  });
  app.post("/api/invitations/accept", limit, async (req, res) => {
    const hash = await hashPassword(password(req.body.password));
    const user = await transaction(async (db) => {
      const {
        rows: [i],
      } = await db.query(
        "SELECT * FROM invitations WHERE token_hash=$1 AND accepted_at IS NULL AND expires_at>now() FOR UPDATE",
        [tokenHash(req.body.token)],
      );
      if (!i) throw fail(400, "Invitación no válida o vencida");
      const {
        rows: [tenant],
      } = await db.query("SELECT * FROM tenants WHERE id=$1 FOR UPDATE", [
        i.tenant_id,
      ]);
      if (accessState(tenant) !== "full")
        throw fail(402, "El espacio requiere una suscripción activa");
      await seats(db, tenant, 0, i.role);
      if (
        (
          await db.query("SELECT id FROM users WHERE lower(email)=$1", [
            i.email,
          ])
        ).rowCount
      )
        throw fail(409, "El correo ya tiene una cuenta");
      const {
        rows: [u],
      } = await db.query(
        "INSERT INTO users(tenant_id,email,name,role,company_id,team_id,password_hash,role_id,department_id,specialty) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
        [
          i.tenant_id,
          i.email,
          i.name,
          i.role,
          i.company_id,
          i.team_id,
          hash,
          i.role_id,
          i.department_id,
          i.specialty,
        ],
      );
      await db.query("UPDATE invitations SET accepted_at=now() WHERE id=$1", [
        i.id,
      ]);
      await db.query("UPDATE users SET email_verified_at=now() WHERE id=$1", [
        u.id,
      ]);
      return u;
    });
    await new Promise((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    req.session.userId = user.id;
    req.session.csrf = randomBytes(24).toString("hex");
    res.status(201).json({ user: exposeUser(user), csrf: req.session.csrf });
  });
}
export function installWorkspaceRoutes(app) {
  app.put("/api/users/:id/permissions", async (req, res) => {
    owner(req);
    const target = Number(req.params.id),
      b = req.body;
    if (target === req.user.id)
      throw fail(403, "No puedes cambiar tus propios permisos");
    await transaction(async (db) => {
      const {
        rows: [user],
      } = await db.query(
        "SELECT * FROM users WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
        [req.tenant.id, target],
      );
      if (!user) throw fail(404, "Usuario no disponible");
      if (user.role === "platform_admin" || user.is_platform_owner)
        throw fail(403, "Cuenta protegida");
      const staff = await resolveStaff(db, req.tenant.id, b, user);
      if (staff.role === "platform_admin")
        throw fail(403, "Rol reservado a O7 Digital Group");
      const company = staff.role === "client" ? Number(b.company_id) : null;
      if (
        staff.role === "client" &&
        (!Number.isSafeInteger(company) ||
          !(
            await db.query(
              "SELECT id FROM companies WHERE tenant_id=$1 AND id=$2",
              [req.tenant.id, company],
            )
          ).rowCount)
      )
        throw fail(400, "Empresa no válida");
      const team = b.team_id === undefined ? user.team_id : b.team_id;
      if (
        team !== null &&
        (!Number.isSafeInteger(team) ||
          !(
            await db.query(
              "SELECT id FROM teams WHERE tenant_id=$1 AND id=$2",
              [req.tenant.id, team],
            )
          ).rowCount)
      )
        throw fail(400, "Equipo no válido");
      if (user.active && user.role === "client" && staff.role !== "client") await seats(db, req.tenant, 1, staff.role);
      await db.query(
        "UPDATE users SET role=$1,company_id=$2,team_id=$5,role_id=$6,department_id=$7,specialty=$8 WHERE tenant_id=$3 AND id=$4",
        [
          staff.role,
          company,
          req.tenant.id,
          target,
          team,
          staff.role_id,
          staff.department_id,
          staff.specialty,
        ],
      );
      await audit(db, req, "user.permissions_updated", {
        user_id: target,
        role: staff.role,
        company_id: company,
      });
    });
    res.json({ ok: true });
  });
  app.get("/api/workspace", async (req, res) => {
    const {
      rows: [usage],
    } = await pool.query(
      "SELECT used FROM ai_usage WHERE tenant_id=$1 AND period=date_trunc('month',now())::date",
      [req.tenant.id],
    );
    res.json({
      workspace: {
        id: req.tenant.id,
        name: req.tenant.name,
        is_demo: req.tenant.is_demo,
        status: req.tenant.status,
        trial_ends_at: req.tenant.trial_ends_at,
        seat_limit: req.tenant.seat_limit,
        ai_limit: req.tenant.ai_limit,
        onboarding_completed: req.tenant.onboarding_completed,
        access: accessState(req.tenant),
        settings: settingsOf(req.tenant),
        ai_used: usage?.used || 0,
      },
      teams: (
        await pool.query(
          "SELECT id,name FROM teams WHERE tenant_id=$1 ORDER BY name",
          [req.tenant.id],
        )
      ).rows,
    });
  });
  app.put("/api/workspace", async (req, res) => {
    owner(req);
    const b = req.body,
      name = str(b.name, "Empresa"),
      settings = validateSettings(b.settings);
    await transaction(async (db) => {
      if (settings.logo.startsWith("/api/workspace/logo/")) {
        const asset = await db.query(
          "SELECT id FROM workspace_logos WHERE id=$1 AND tenant_id=$2",
          [settings.logo.split("/").at(-1), req.tenant.id],
        );
        if (!asset.rowCount)
          throw fail(400, "Logo no disponible para este espacio");
      }
      const agents = [...settings.rules, ...settings.escalations].map(
        (r) => r.agent_id,
      );
      if (
        agents.length &&
        (
          await db.query(
            "SELECT id FROM users WHERE tenant_id=$1 AND id=ANY($2::int[]) AND role='agent' AND active",
            [req.tenant.id, agents],
          )
        ).rowCount !== new Set(agents).size
      )
        throw fail(400, "Regla: agente no autorizado");
      for (const department of settings.departments)
        await db.query(
          "INSERT INTO departments(tenant_id,name) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [req.tenant.id, department],
        );
      settings.departments = (
        await db.query(
          "SELECT name FROM departments WHERE tenant_id=$1 ORDER BY name",
          [req.tenant.id],
        )
      ).rows.map((d) => d.name);
      await db.query(
        "UPDATE tenants SET name=$1,settings=$2,onboarding_completed=$3,configuration_version=configuration_version+1 WHERE id=$4",
        [
          name,
          settings,
          b.onboarding_completed === true || req.tenant.onboarding_completed,
          req.tenant.id,
        ],
      );
      await audit(db, req, "configuration.updated");
    });
    res.json({ ok: true });
  });
  app.post("/api/companies", async (req, res) => {
    if (!globalAccess(req.user))
      throw fail(403, "Acceso reservado al responsable");
    const b = req.body;
    const result = await transaction(async (db) => {
      const {
        rows: [company],
      } = await db.query(
        "INSERT INTO companies(tenant_id,name,sector,site) VALUES($1,$2,$3,$4) RETURNING *",
        [
          req.tenant.id,
          str(b.name, "Empresa"),
          str(b.sector || "Servicio", "Sector"),
          str(b.site || "Principal", "Sede"),
        ],
      );
      if (b.contact_email)
        await db.query(
          "INSERT INTO contacts(tenant_id,company_id,name,email,function) VALUES($1,$2,$3,$4,$5)",
          [
            req.tenant.id,
            company.id,
            str(b.contact_name, "Contacto"),
            email(b.contact_email),
            str(b.contact_function || "Contacto", "Función"),
          ],
        );
      await audit(db, req, "company.created", { id: company.id });
      return company;
    });
    res.status(201).json({ company: result });
  });
  app.post("/api/teams", async (req, res) => {
    owner(req);
    const {
      rows: [team],
    } = await pool.query(
      "INSERT INTO teams(tenant_id,name) VALUES($1,$2) RETURNING id,name",
      [req.tenant.id, str(req.body.name, "Equipo", 80)],
    );
    res.status(201).json({ team });
  });
  app.put("/api/users/:id/team", async (req, res) => {
    owner(req);
    const team = req.body.team_id;
    if (
      team !== null &&
      (!Number.isSafeInteger(team) ||
        !(
          await pool.query(
            "SELECT id FROM teams WHERE tenant_id=$1 AND id=$2",
            [req.tenant.id, team],
          )
        ).rowCount)
    )
      throw fail(400, "Equipo no válido");
    const r = await pool.query(
      "UPDATE users SET team_id=$1 WHERE tenant_id=$2 AND id=$3 RETURNING id",
      [team, req.tenant.id, Number(req.params.id)],
    );
    if (!r.rowCount) throw fail(404, "Usuario no disponible");
    res.json({ ok: true });
  });
  app.get("/api/invitations", async (req, res) => {
    owner(req);
    res.json({
      invitations: (
        await pool.query(
          "SELECT id,email,name,role,expires_at,accepted_at FROM invitations WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100",
          [req.tenant.id],
        )
      ).rows,
    });
  });
  app.post("/api/invitations", async (req, res) => {
    owner(req);
    const b = req.body;

    const token = randomBytes(32).toString("hex"),
      origin = publicOrigin();
    await transaction(async (db) => {
      const staff = await resolveStaff(db, req.tenant.id, b);
      await seats(db, req.tenant, 1, staff.role);
      if (staff.role === "platform_admin")
        throw fail(400, "Rol reservado a O7 Digital Group");
      const company = staff.role === "client" ? Number(b.company_id) : null,
        team = b.team_id ? Number(b.team_id) : null;
      if (
        company &&
        !(
          await db.query(
            "SELECT id FROM companies WHERE tenant_id=$1 AND id=$2",
            [req.tenant.id, company],
          )
        ).rowCount
      )
        throw fail(400, "Empresa no válida");
      if (staff.role === "client" && !company)
        throw fail(400, "Selecciona una empresa cliente");
      if (
        team &&
        !(
          await db.query("SELECT id FROM teams WHERE tenant_id=$1 AND id=$2", [
            req.tenant.id,
            team,
          ])
        ).rowCount
      )
        throw fail(400, "Equipo no válido");
      const mail = email(b.email);
      if (
        (await db.query("SELECT id FROM users WHERE lower(email)=$1", [mail]))
          .rowCount
      )
        throw fail(409, "El correo ya tiene una cuenta");
      const invitationId = randomUUID();
      await db.query(
        "INSERT INTO invitations(id,tenant_id,email,name,role,company_id,team_id,token_hash,role_id,department_id,specialty) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [
          invitationId,
          req.tenant.id,
          mail,
          str(b.name, "Nombre", 100),
          staff.role,
          company,
          team,
          tokenHash(token),
          staff.role_id,
          staff.department_id,
          staff.specialty,
        ],
      );
      await queueEmail(
        db,
        req.tenant.id,
        `invite:${invitationId}`,
        mail,
        `Invitación a ${req.tenant.name} · Service Hub`,
        `${req.user.name} te invita a ${req.tenant.name}. Crea tu contraseña en las próximas 72 horas: ${origin}/invitation#${token}`,
      );
      await audit(db, req, "invitation.created", { email: mail, role: b.role });
    });
    res.status(201).json({ ok: true, delivery: "queued" });
  });
  app.delete("/api/invitations/:id", async (req, res) => {
    owner(req);
    await pool.query(
      "DELETE FROM invitations WHERE tenant_id=$1 AND id=$2 AND accepted_at IS NULL",
      [req.tenant.id, req.params.id],
    );
    res.json({ ok: true });
  });
  app.get("/api/workspace/audit", async (req, res) => {
    owner(req);
    res.json({
      events: (
        await pool.query(
          "SELECT action,details,created_at FROM workspace_audit WHERE tenant_id=$1 ORDER BY id DESC LIMIT 100",
          [req.tenant.id],
        )
      ).rows,
    });
  });
  app.post("/api/tickets/:id/transition", async (req, res) => {
    if (!globalAccess(req.user) && req.user.role !== "agent")
      throw fail(403, "Acceso reservado al equipo");
    const stage = settingsOf(req.tenant).workflow.find(
      (w) => w.name === req.body.stage,
    );
    if (!stage) throw fail(400, "Etapa no válida");
    const { scope } = await import("./permissions.js");
    const s = scope(req.user);
    await transaction(async (db) => {
      const {
        rows: [t],
      } = await db.query(
        `SELECT t.* FROM tickets t WHERE ${s.sql} AND t.id=$${s.args.length + 1} FOR UPDATE`,
        [...s.args, Number(req.params.id)],
      );
      if (!t) throw fail(404, "Solicitud no disponible");
      if (["Resuelto", "Cerrado"].includes(stage.state) && !t.resolution)
        throw fail(409, "Documenta la resolución antes de cerrar");
      if (
        ["Resuelto", "Cerrado"].includes(t.status) &&
        ["Abierto", "En curso"].includes(stage.state)
      )
        throw fail(409, "Usa Reabrir y documenta el motivo");
      await db.query(
        "UPDATE tickets SET workflow_stage=$1,status=$2,updated_at=now() WHERE tenant_id=$3 AND id=$4",
        [stage.name, stage.state, req.tenant.id, t.id],
      );
      await db.query(
        "INSERT INTO events(tenant_id,ticket_id,actor_id,kind,body) VALUES($1,$2,$3,'history',$4)",
        [req.tenant.id, t.id, req.user.id, `Etapa: ${stage.name}`],
      );
    });
    res.json({ ok: true });
  });
}
