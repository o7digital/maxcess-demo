export const globalAccess = (user) =>
  ["platform_admin", "admin", "manager"].includes(user.role);
export const internal = (user) => user.role !== "client";
export function scope(user, alias = "t") {
  if (user.role === "client")
    return { sql: `${alias}.company_id=$1`, args: [user.company_id] };
  if (user.role === "agent")
    return { sql: `${alias}.agent_id=$1`, args: [user.id] };
  if (globalAccess(user)) return { sql: "true", args: [] };
  return { sql: "false", args: [] };
}
