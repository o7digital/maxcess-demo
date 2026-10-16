import { randomBytes } from "node:crypto";
import { pool, transaction } from "./db.js";
import { hashPassword } from "./identity.js";
import {
  email,
  password,
  tokenHash,
  queueEmail,
  publicOrigin,
  fail,
} from "./workspace.js";
export function emailRecoveryAvailable() {
  return Boolean(
    process.env.SMTP_URL &&
    process.env.MAIL_FROM &&
    /^https:\/\//.test(process.env.PUBLIC_APP_URL || ""),
  );
}
export async function issueToken(db, user, purpose) {
  const token = randomBytes(32).toString("hex");
  const previous = await db.query(
    "UPDATE account_tokens SET consumed_at=now() WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL RETURNING token_hash",
    [user.id, purpose],
  );
  if (previous.rowCount)
    await db.query(
      "DELETE FROM notification_outbox WHERE tenant_id=$1 AND recipient=$2 AND sent_at IS NULL AND dedupe_key=ANY($3::text[])",
      [
        user.tenant_id,
        user.email,
        previous.rows.map((row) => "account:" + purpose + ":" + row.token_hash),
      ],
    );
  await db.query(
    "INSERT INTO account_tokens(user_id,token_hash,purpose,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
    [user.id, tokenHash(token), purpose],
  );
  const origin = publicOrigin();
  const url =
    origin +
    (purpose === "reset" ? "/reset-password" : "/verify-email") +
    "#" +
    token;
  await queueEmail(
    db,
    user.tenant_id,
    `account:${purpose}:${tokenHash(token)}`,
    user.email,
    purpose === "reset"
      ? "Service Hub · Restablecer contraseña"
      : "Service Hub · Confirma tu correo",
    `Abre este enlace en la próxima hora: ${url}\nSi no solicitaste esta acción, puedes ignorar este mensaje.`,
  );
}
export function installAccountPublic(app, limit) {
  app.post("/api/account/recover", limit, async (req, res) => {
    const address = email(req.body.email);
    if (!emailRecoveryAvailable())
      throw fail(
        503,
        "La recuperación por correo no está disponible temporalmente. Contacta con O7 Digital Group.",
      );
    await transaction(async (db) => {
      const {
        rows: [u],
      } = await db.query(
        "SELECT id,email,tenant_id FROM users WHERE lower(email)=$1 AND active",
        [address],
      );
      if (u) await issueToken(db, u, "reset");
    });
    res.json({
      ok: true,
      message:
        "Si la cuenta existe, recibirás un enlace para restablecer tu contraseña.",
    });
  });
  app.post("/api/account/reset", limit, async (req, res) => {
    const hash = await hashPassword(password(req.body.password));
    await transaction(async (db) => {
      const {
        rows: [token],
      } = await db.query(
        "SELECT * FROM account_tokens WHERE token_hash=$1 AND purpose='reset' AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",
        [tokenHash(req.body.token)],
      );
      if (!token) throw fail(400, "Enlace no válido o vencido");
      await db.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
        hash,
        token.user_id,
      ]);
      await db.query(
        "UPDATE account_tokens SET consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL",
        [token.user_id],
      );
      await db.query("DELETE FROM session WHERE sess->>'userId'=$1", [
        String(token.user_id),
      ]);
    });
    res.json({ ok: true });
  });
  app.post("/api/account/verify", limit, async (req, res) => {
    await transaction(async (db) => {
      const {
        rows: [token],
      } = await db.query(
        "SELECT * FROM account_tokens WHERE token_hash=$1 AND purpose='verify' AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",
        [tokenHash(req.body.token)],
      );
      if (!token) throw fail(400, "Enlace no válido o vencido");
      await db.query(
        "UPDATE users SET email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1",
        [token.user_id],
      );
      await db.query(
        "UPDATE account_tokens SET consumed_at=now() WHERE id=$1",
        [token.id],
      );
    });
    res.json({ ok: true });
  });
}
export function installAccountPrivate(app) {
  app.post("/api/account/resend-verification", async (req, res) => {
    const {
      rows: [user],
    } = await pool.query("SELECT * FROM users WHERE id=$1 AND tenant_id=$2", [
      req.user.id,
      req.tenant.id,
    ]);
    if (!user.email_verified_at) {
      const {
        rows: [recent],
      } = await pool.query(
        "SELECT 1 FROM account_tokens WHERE user_id=$1 AND purpose='verify' AND created_at>now()-interval '5 minutes'",
        [user.id],
      );
      if (recent)
        throw fail(429, "Espera cinco minutos antes de solicitar otro correo");
      await transaction((db) => issueToken(db, user, "verify"));
    }
    res.json({ ok: true });
  });
}
