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
  if (globalAccess(user)) return { sql, args };
  return { sql: "false", args: [] };
}
