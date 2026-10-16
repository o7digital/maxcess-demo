import { transaction, pool } from "../server/db.js";
import { hashPassword } from "../server/identity.js";
import { email, password, defaults } from "../server/workspace.js";
// Explicit operator command. Never run at startup or reuse illustrative passwords.
try {
  const address = email(process.env.O7_ADMIN_EMAIL),
    hash = await hashPassword(password(process.env.O7_ADMIN_PASSWORD));
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(7347510)");
    if (
      (await db.query("SELECT id FROM users WHERE is_platform_owner")).rowCount
    )
      throw new Error(
        "A platform owner already exists; no account was changed",
      );
    const {
      rows: [tenant],
    } = await db.query(
      "INSERT INTO tenants(name,status,onboarding_completed,settings,seat_limit,ai_limit) VALUES('O7 Digital Group','active',true,$1,100,1000) RETURNING id",
      [defaults],
    );
    await db.query(
      "INSERT INTO users(tenant_id,email,name,role,password_hash,is_platform_owner,email_verified_at) VALUES($1,$2,'O7 Digital Group','platform_admin',$3,true,now())",
      [tenant.id, address, hash],
    );
  });
  console.log("O7 platform owner created. No illustrative data was seeded.");
} finally {
  await pool.end();
}
