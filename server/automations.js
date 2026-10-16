import { transaction } from "./db.js";
import { accessState, settingsOf, queueEmail } from "./workspace.js";
let busy = false;
export async function runAutomations() {
  if (busy) return;
  busy = true;
  try {
    await transaction(async (db) => {
      const { rows: tenants } = await db.query(
        "SELECT * FROM tenants WHERE settings ? 'escalations' AND status IN ('active','trialing','past_due')",
      );
      for (const tenant of tenants) {
        if (accessState(tenant) !== "full") continue;
        const settings = settingsOf(tenant);
        const {
          rows: [actor],
        } = await db.query(
          "SELECT id FROM users WHERE tenant_id=$1 AND role IN ('admin','platform_admin') AND active ORDER BY id LIMIT 1",
          [tenant.id],
        );
        if (!actor) continue;
        for (const rule of settings.escalations) {
          const {
            rows: [agent],
          } = await db.query(
            "SELECT id,name,email FROM users WHERE tenant_id=$1 AND id=$2 AND role='agent' AND active",
            [tenant.id, rule.agent_id],
          );
          if (!agent) continue;
          const { rows: tickets } = await db.query(
            "SELECT id,title FROM tickets WHERE tenant_id=$1 AND priority=$2 AND status IN ('Abierto','En curso') AND escalated_at IS NULL AND due_at+($3*interval '1 hour')<=now() ORDER BY due_at LIMIT 50 FOR UPDATE SKIP LOCKED",
            [tenant.id, rule.priority, rule.after_hours],
          );
          for (const ticket of tickets) {
            await db.query(
              "UPDATE tickets SET agent_id=$1,escalated_at=now(),updated_at=now() WHERE tenant_id=$2 AND id=$3",
              [agent.id, tenant.id, ticket.id],
            );
            await db.query(
              "INSERT INTO events(tenant_id,ticket_id,actor_id,kind,body,internal) VALUES($1,$2,$3,'history',$4,true)",
              [
                tenant.id,
                ticket.id,
                actor.id,
                `Escalación automática según la configuración del espacio. Responsable: ${agent.name}.`,
              ],
            );
            await db.query(
              "INSERT INTO workspace_audit(tenant_id,action,details) VALUES($1,'ticket.escalated',$2)",
              [tenant.id, { ticket_id: ticket.id, agent_id: agent.id }],
            );
            if (rule.notify)
              await queueEmail(
                db,
                tenant.id,
                `escalation:${ticket.id}`,
                agent.email,
                `Service Hub · Escalación SH-${ticket.id}`,
                `La solicitud ${ticket.title} superó su SLA y fue escalada a tu equipo.`,
              );
          }
        }
      }
    });
  } finally {
    busy = false;
  }
}
