import { pool, transaction } from "./db.js";
const fail = (status, message) => Object.assign(new Error(message), { status });
const label = (value, name, max = 100) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw fail(400, name + ": valor no válido");
  return value.trim();
};
export const departmentManager = (user) =>
  user.role === "manager" &&
  (user.department_id != null || user.role_id != null);
export const accessScope = (user) =>
  departmentManager(user) ? "department-" + user.department_id : "global";
export async function syncDepartments(db, tenant) {
  await db.query(
    "UPDATE tenants SET configuration_version=configuration_version+1,settings=jsonb_set(settings,'{departments}',COALESCE((SELECT jsonb_agg(name ORDER BY name) FROM departments WHERE tenant_id=$1),'[]'::jsonb)) WHERE id=$1",
    [tenant],
  );
}
export async function seedRoles(db, tenant) {
  await db.query(
    "INSERT INTO workspace_roles(tenant_id,name,base_role) VALUES($1,'Admin','admin'),($1,'Gerente','manager'),($1,'Ingeniero','agent') ON CONFLICT DO NOTHING",
    [tenant],
  );
}
export const conversationScope = (user) =>
  user.role === "client"
    ? "client-" + user.company_id
    : departmentManager(user)
      ? accessScope(user)
      : "role-" + user.role;
// Resolve the security profile from the stored definition, never from a display name.
export async function resolveStaff(db, tenant, body, fallback = {}) {
  const roleId =
    body.role_id === undefined
      ? fallback.role_id || null
      : body.role_id === null || body.role_id === ""
        ? null
        : Number(body.role_id);
  let role = body.role || fallback.role;
  if (roleId !== null) {
    if (!Number.isSafeInteger(roleId) || roleId < 1)
      throw fail(400, "Rol no válido");
    const definition = (
      await db.query(
        "SELECT base_role FROM workspace_roles WHERE tenant_id=$1 AND id=$2",
        [tenant, roleId],
      )
    ).rows[0];
    if (!definition) throw fail(400, "Rol no disponible para este espacio");
    if (body.role !== undefined && body.role !== definition.base_role)
      throw fail(400, "El perfil no coincide con el rol");
    role = definition.base_role;
  }
  if (!["admin", "manager", "agent", "client", "platform_admin"].includes(role))
    throw fail(400, "Rol no válido");
  const department =
    body.department_id === undefined
      ? fallback.department_id || null
      : body.department_id === null || body.department_id === ""
        ? null
        : Number(body.department_id);
  if (
    department !== null &&
    (!Number.isSafeInteger(department) ||
      !(
        await db.query(
          "SELECT id FROM departments WHERE tenant_id=$1 AND id=$2",
          [tenant, department],
        )
      ).rowCount)
  )
    throw fail(400, "Departamento no válido");
  if (role === "manager" && roleId !== null && department === null)
    throw fail(400, "Selecciona el departamento del responsable");
  const specialty =
    body.specialty === undefined ? fallback.specialty || "" : body.specialty;
  if (typeof specialty !== "string" || specialty.trim().length > 160)
    throw fail(400, "Especialidad no válida");
  return {
    role,
    role_id: roleId,
    department_id: department,
    specialty: specialty.trim(),
  };
}
export async function ticketDepartment(db, user, value, agentId) {
  let department =
    value === undefined || value === null || value === ""
      ? null
      : Number(value);
  if (departmentManager(user)) {
    if (department !== null && department !== user.department_id)
      throw fail(403, "Departamento no autorizado");
    department = user.department_id;
  }
  if (
    department !== null &&
    (!Number.isSafeInteger(department) ||
      !(
        await db.query(
          "SELECT id FROM departments WHERE tenant_id=$1 AND id=$2",
          [user.tenant_id, department],
        )
      ).rowCount)
  )
    throw fail(400, "Departamento no válido");
  if (agentId) {
    const agent = (
      await db.query(
        "SELECT department_id FROM users WHERE tenant_id=$1 AND id=$2",
        [user.tenant_id, agentId],
      )
    ).rows[0];
    if (departmentManager(user) && agent?.department_id !== department)
      throw fail(403, "Técnico fuera de tu departamento");
    if (department === null) department = agent?.department_id || null;
    if (
      department !== null &&
      agent?.department_id &&
      agent.department_id !== department
    )
      throw fail(400, "El técnico pertenece a otro departamento");
  }
  return department;
}
export function installRoleRoutes(app) {
  const owner = (req) => {
    if (!["admin", "platform_admin"].includes(req.user.role))
      throw fail(403, "Acceso reservado a administración");
  };
  app.get("/api/staff/catalog", async (req, res) => {
    if (req.user.role === "client")
      throw fail(403, "Acceso reservado al equipo");
    const [roles, departments] = await Promise.all([
      pool.query(
        "SELECT id,name,base_role FROM workspace_roles WHERE tenant_id=$1 ORDER BY name",
        [req.user.tenant_id],
      ),
      pool.query(
        "SELECT id,name FROM departments WHERE tenant_id=$1 AND ($2::int IS NULL OR id=$2) ORDER BY name",
        [
          req.user.tenant_id,
          departmentManager(req.user) ? req.user.department_id : null,
        ],
      ),
    ]);
    res.json({ roles: roles.rows, departments: departments.rows });
  });
  for (const [route, table] of [
    ["roles", "workspace_roles"],
    ["departments", "departments"],
  ]) {
    app.post("/api/staff/" + route, async (req, res) => {
      owner(req);
      const name = label(req.body.name, "Nombre");
      if (
        route === "roles" &&
        !["admin", "manager", "agent", "client"].includes(req.body.base_role)
      )
        throw fail(400, "Perfil de permisos no válido");
      const item = await transaction(async (db) => {
        const result = await db.query(
          route === "roles"
            ? "INSERT INTO workspace_roles(tenant_id,name,base_role) VALUES($1,$2,$3) RETURNING id,name,base_role"
            : "INSERT INTO departments(tenant_id,name) VALUES($1,$2) RETURNING id,name",
          route === "roles"
            ? [req.user.tenant_id, name, req.body.base_role]
            : [req.user.tenant_id, name],
        );
        await db.query(
          "INSERT INTO workspace_audit(tenant_id,actor_id,action,details) VALUES($1,$2,$3,$4)",
          [
            req.user.tenant_id,
            req.user.id,
            route + ".created",
            { id: result.rows[0].id },
          ],
        );
        if (route === "departments")
          await syncDepartments(db, req.user.tenant_id);
        return result.rows[0];
      });
      res.status(201).json({ item });
    });
    app.put("/api/staff/" + route + "/:id", async (req, res) => {
      owner(req);
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1)
        throw fail(400, "Identificador no válido");
      if (req.body.base_role !== undefined)
        throw fail(
          400,
          "El perfil de permisos es fijo; crea otro rol para otro perfil",
        );
      const item = await transaction(async (db) => {
        const result = await db.query(
          `UPDATE ${table} SET name=$1 WHERE tenant_id=$2 AND id=$3 RETURNING id,name`,
          [label(req.body.name, "Nombre"), req.user.tenant_id, id],
        );
        if (!result.rowCount) throw fail(404, "Elemento no disponible");
        if (route === "departments")
          await syncDepartments(db, req.user.tenant_id);
        await db.query(
          "INSERT INTO workspace_audit(tenant_id,actor_id,action,details) VALUES($1,$2,$3,$4)",
          [req.user.tenant_id, req.user.id, route + ".renamed", { id }],
        );
        return result.rows[0];
      });
      res.json({ item });
    });
  }
}
