import { pool } from "../server/db.js";
try {
  const counts = (
    await pool.query(
      "SELECT (SELECT count(*) FROM schema_migrations)::int migrations,(SELECT count(*) FROM companies WHERE tenant_id=1)::int illustrative_companies,(SELECT count(*) FROM users WHERE tenant_id=1)::int illustrative_users,(SELECT count(*) FROM tickets WHERE tenant_id=1)::int illustrative_tickets,(SELECT count(*) FROM tenants WHERE NOT is_demo)::int subscriber_workspaces",
    )
  ).rows[0];
  console.log(
    JSON.stringify(
      {
        counts,
        readiness: {
          registration: process.env.REGISTRATION_ENABLED === "true",
          stripe_test: Boolean(
            process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
            process.env.STRIPE_WEBHOOK_SECRET,
          ),
          email: Boolean(process.env.SMTP_URL && process.env.MAIL_FROM),
          olivia_tenants: process.env.OLIVIA_TENANT_READY === "true",
          commercial: process.env.COMMERCIAL_MODE === "true",
        },
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
