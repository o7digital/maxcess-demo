import { transaction } from "./db.js";
import {
  accessState,
  settingsOf,
  queueEmail,
  publicOrigin,
} from "./workspace.js";
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
        if (settings.overdue_alerts && !tenant.is_demo) {
          const { rows: late } = await db.query(
            `SELECT t.id,t.title,t.due_at,u.email FROM tickets t JOIN users u ON u.tenant_id=t.tenant_id AND u.active AND u.email_verified_at IS NOT NULL AND ((t.agent_id IS NOT NULL AND u.id=t.agent_id) OR (t.agent_id IS NULL AND u.role='admin')) WHERE t.tenant_id=$1 AND t.status IN ('Abierto','En curso') AND t.due_at<now() AND NOT EXISTS(SELECT 1 FROM notification_outbox o WHERE o.tenant_id=t.tenant_id AND o.recipient=u.email AND o.dedupe_key LIKE 'overdue:'||t.id::text||':%' AND (o.created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date) ORDER BY t.due_at LIMIT 100`,
            [tenant.id],
          );
          for (const item of late)
            await queueEmail(
              db,
              tenant.id,
              `overdue:${item.id}:${new Date(item.due_at).getTime()}:${item.email}:${new Date().toISOString().slice(0, 10)}`,
              item.email,
              `Service Hub · SLA vencido SH-${item.id}`,
              `La solicitud SH-${item.id}: ${item.title} ha superado su fecha límite. Revisa el seguimiento: ${publicOrigin()}/`,
            );
        }
        for (const rule of settings.escalations) {
          const {
            rows: [agent],
          } = await db.query(
            "SELECT id,name,email,department_id FROM users WHERE tenant_id=$1 AND id=$2 AND role='agent' AND active",
            [tenant.id, rule.agent_id],
          );
          if (!agent) continue;
          const { rows: tickets } = await db.query(
            "SELECT id,title FROM tickets WHERE tenant_id=$1 AND priority=$2 AND status IN ('Abierto','En curso') AND escalated_at IS NULL AND (department_id IS NULL OR $4::int IS NULL OR department_id=$4) AND due_at+($3*interval '1 hour')<=now() ORDER BY due_at LIMIT 50 FOR UPDATE SKIP LOCKED",
            [tenant.id, rule.priority, rule.after_hours, agent.department_id],
          );
          for (const ticket of tickets) {
            await db.query(
              "UPDATE tickets SET agent_id=$1,department_id=COALESCE(department_id,$4),escalated_at=now(),updated_at=now() WHERE tenant_id=$2 AND id=$3",
              [agent.id, tenant.id, ticket.id, agent.department_id],
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
