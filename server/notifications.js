import nodemailer from "nodemailer";
import { pool, transaction } from "./db.js";
import {
  queueEmail,
  publicOrigin,
  accessState,
  settingsOf,
} from "./workspace.js";
let busy = false;
export async function runNotifications() {
  if (
    busy ||
    !process.env.SMTP_URL ||
    !process.env.MAIL_FROM ||
    !process.env.PUBLIC_APP_URL
  )
    return;
  busy = true;
  try {
    const trials = (
      await pool.query(
        "SELECT t.id,t.name,t.trial_ends_at,u.email FROM tenants t JOIN users u ON u.tenant_id=t.id AND u.role='admin' AND u.active WHERE NOT t.is_demo AND t.status='trialing' AND t.trial_ends_at < now()+interval '2 days'",
      )
    ).rows;
    for (const t of trials) {
      const expired = new Date(t.trial_ends_at) < new Date();
      await queueEmail(
        pool,
        t.id,
        `trial:${t.id}:${t.email}:${expired ? "expired" : "reminder"}`,
        t.email,
        expired
          ? "Service Hub · Tu prueba ha finalizado"
          : "Service Hub · Tu prueba termina pronto",
        `${t.name}: tu prueba ${expired ? "ha finalizado" : "termina el " + t.trial_ends_at.toISOString()}. Tus datos se conservan. Elige tu suscripción: ${publicOrigin()}/subscription`,
      );
    }
    await pool.query(
      "DELETE FROM notification_outbox o WHERE o.sent_at IS NULL AND o.dedupe_key LIKE 'mfa:%' AND NOT EXISTS(SELECT 1 FROM mfa_challenges c WHERE 'mfa:'||c.id::text=o.dedupe_key AND c.consumed_at IS NULL AND c.expires_at>now())",
    );
    await pool.query(
      "DELETE FROM mfa_challenges WHERE expires_at<now()-interval '1 day'",
    );
    const transporter = nodemailer.createTransport(process.env.SMTP_URL);
    // Row locks prevent two application instances sending the same queued item concurrently.
    await transaction(async (db) => {
      const messages = (
        await db.query(
          "SELECT * FROM notification_outbox WHERE sent_at IS NULL AND attempts<8 AND available_at<=now() ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED",
        )
      ).rows;
      for (const m of messages) {
        try {
          if (m.dedupe_key.startsWith("overdue:")) {
            const ticketId = Number(m.dedupe_key.split(":")[1]);
            const {
              rows: [tenant],
            } = await db.query(
              "SELECT w.* FROM tickets t JOIN tenants w ON w.id=t.tenant_id JOIN users u ON u.tenant_id=t.tenant_id AND u.active AND u.email_verified_at IS NOT NULL AND ((t.agent_id IS NOT NULL AND u.id=t.agent_id) OR (t.agent_id IS NULL AND u.role='admin')) WHERE t.id=$1 AND t.tenant_id=$2 AND u.email=$3 AND t.status IN ('Abierto','En curso') AND t.due_at<now()",
              [ticketId, m.tenant_id, m.recipient],
            );
            if (
              !tenant ||
              tenant.is_demo ||
              accessState(tenant) !== "full" ||
              !settingsOf(tenant).overdue_alerts
            ) {
              await db.query("DELETE FROM notification_outbox WHERE id=$1", [
                m.id,
              ]);
              continue;
            }
          }
          await transporter.sendMail({
            from: process.env.MAIL_FROM,
            to: m.recipient,
            subject: m.subject,
            text: m.body,
            messageId: `<servicehub-${m.id}@o7digitalgroup.com>`,
          });
          await db.query(
            "UPDATE notification_outbox SET sent_at=now(),attempts=attempts+1,body=CASE WHEN dedupe_key LIKE 'mfa:%' THEN '[redacted]' ELSE body END WHERE id=$1",
            [m.id],
          );
        } catch {
          await db.query(
            "UPDATE notification_outbox SET attempts=attempts+1,available_at=now()+interval '15 minutes' WHERE id=$1",
            [m.id],
          );
        }
      }
    });
  } finally {
    busy = false;
  }
}
