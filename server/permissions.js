import { departmentManager } from "./roles.js";
export const globalAccess = (user) =>
  ["platform_admin", "admin", "manager"].includes(user.role);
export const internal = (user) => user.role !== "client";
export function scope(user, alias = "t") {
  if (!Number.isSafeInteger(user.tenant_id)) return { sql: "false", args: [] };
  const sql = `${alias}.tenant_id=$1`,
    args = [user.tenant_id];
  if (user.role === "client")
    return {
      sql: sql + ` AND ${alias}.company_id=$2`,
      args: [...args, user.company_id],
    };
  if (user.role === "agent")
    return { sql: sql + ` AND ${alias}.agent_id=$2`, args: [...args, user.id] };
  if (departmentManager(user)) {
    if (!Number.isSafeInteger(user.department_id))
      return { sql: "false", args: [] };
    return {
      sql:
        sql +
        ` AND (${alias}.department_id=$2 OR (${alias}.department_id IS NULL AND EXISTS(SELECT 1 FROM users department_agent WHERE department_agent.id=${alias}.agent_id AND department_agent.tenant_id=${alias}.tenant_id AND department_agent.department_id=$2)))`,
      args: [...args, user.department_id],
    };
  }
  if (globalAccess(user)) return { sql, args };
  return { sql: "false", args: [] };
}
