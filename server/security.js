import {
  randomBytes,
  randomInt,
  randomUUID,
  createHash,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "node:crypto";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { pool, transaction } from "./db.js";
import { queueEmail, fail } from "./workspace.js";
import { verifyPassword, exposeUser } from "./identity.js";
import { emailRecoveryAvailable } from "./account.js";
const digest = (value) => createHash("sha256").update(value).digest("hex");
export function seal(value) {
  const key = createHash("sha256")
      .update(process.env.DATA_ENCRYPTION_KEY || process.env.SESSION_SECRET)
      .digest(),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  return Buffer.concat([
    iv,
    cipher.update(value, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64");
}
export function unseal(value) {
  const b = Buffer.from(value, "base64"),
    dec = createDecipheriv(
      "aes-256-gcm",
      createHash("sha256")
        .update(process.env.DATA_ENCRYPTION_KEY || process.env.SESSION_SECRET)
        .digest(),
      b.subarray(0, 12),
    );
  dec.setAuthTag(b.subarray(-16));
  return Buffer.concat([dec.update(b.subarray(12, -16)), dec.final()]).toString(
    "utf8",
  );
}
function totp(secret, label) {
  return new OTPAuth.TOTP({
    issuer: "Maxcess Service Hub",
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}
export async function beginChallenge(user, purpose, method) {
  if (!["email", "totp"].includes(method))
    throw fail(400, "Invalid verification method");
  if (method === "email" && !emailRecoveryAvailable())
    throw fail(503, "Email verification is not configured");
  const id = randomUUID(),
    code = String(randomInt(100000, 1000000));
  await transaction(async (db) => {
    await db.query(
      "UPDATE mfa_challenges SET consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL",
      [user.id],
    );
    await db.query(
      "INSERT INTO mfa_challenges(id,user_id,purpose,method,code_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '10 minutes')",
      [
        id,
        user.id,
        purpose,
        method,
        method === "email" ? digest(id + ":" + code) : null,
      ],
    );
    await db.query(
      "DELETE FROM notification_outbox o WHERE o.tenant_id=$1 AND o.recipient=$2 AND o.sent_at IS NULL AND o.dedupe_key LIKE 'mfa:%'",
      [user.tenant_id, user.email],
    );
    if (method === "email")
      await queueEmail(
        db,
        user.tenant_id,
        "mfa:" + id,
        user.email,
        "Maxcess · Verification code",
        `Your verification code is ${code}. It expires in 10 minutes. Never share this code.`,
      );
  });
  return id;
}
export async function completeChallenge(id, userId, purpose, code) {
  if (typeof code !== "string" || code.length > 100) return false;
  return transaction(async (db) => {
    const {
      rows: [c],
    } = await db.query(
      "SELECT * FROM mfa_challenges WHERE id=$1 AND user_id=$2 AND purpose=$3 FOR UPDATE",
      [id, userId, purpose],
    );
    if (
      !c ||
      c.consumed_at ||
      c.attempts >= 5 ||
      new Date(c.expires_at) < new Date()
    )
      return false;
    await db.query(
      "UPDATE mfa_challenges SET attempts=attempts+1 WHERE id=$1",
      [id],
    );
    const {
      rows: [m],
    } = await db.query("SELECT * FROM user_mfa WHERE user_id=$1 FOR UPDATE", [
      userId,
    ]);
    let valid = false;
    const backup = digest(code),
      isBackup = purpose !== "setup" && m?.enabled && m?.recovery_hashes?.includes(backup);
    if (isBackup) {
      valid = true;
      await db.query(
        "UPDATE user_mfa SET recovery_hashes=array_remove(recovery_hashes,$1) WHERE user_id=$2",
        [backup, userId],
      );
    } else if (c.method === "email")
      valid = timingSafeEqual(
        Buffer.from(c.code_hash, "hex"),
        Buffer.from(digest(id + ":" + code), "hex"),
      );
    else if (c.method === "totp" && m?.secret) {
      const token = totp(unseal(m.secret), "");
      const delta = token.validate({ token: code, window: 1 });
      const step = Math.floor(Date.now() / 30000) + (delta ?? 0);
      if (delta !== null && step > Number(m.last_step)) {
        valid = true;
        await db.query("UPDATE user_mfa SET last_step=$1 WHERE user_id=$2", [
          step,
          userId,
        ]);
      }
    }
    if (valid)
      await db.query(
        "UPDATE mfa_challenges SET consumed_at=now() WHERE id=$1",
        [id],
      );
    return valid;
  });
}
export function installSecurityPublic(app, limit) {
  app.post("/api/security/login", limit, async (req, res) => {
    const pending = req.session.mfaPending;
    if (!pending || Date.now() - pending.at > 600000)
      throw fail(401, "Verification expired. Sign in again.");
    if (
      !(await completeChallenge(
        pending.id,
        pending.userId,
        "login",
        req.body.code,
      ))
    )
      throw fail(401, "Invalid or expired verification code");
    const {
      rows: [user],
    } = await pool.query("SELECT * FROM users WHERE id=$1 AND active", [
      pending.userId,
    ]);
    if (!user) throw fail(401, "Account unavailable");
    await new Promise((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    req.session.userId = user.id;
    req.session.csrf = randomBytes(24).toString("hex");
    res.json({ user: exposeUser(user), csrf: req.session.csrf });
  });
}
export function installSecurityPrivate(app, limit) {
  app.get("/api/security", async (req, res) => {
    const {
      rows: [m],
    } = await pool.query(
      "SELECT method,enabled FROM user_mfa WHERE user_id=$1",
      [req.user.id],
    );
    res.json({
      method: m?.enabled ? m.method : null,
      email: emailRecoveryAvailable(),
    });
  });
  app.post("/api/security/setup", limit, async (req, res) => {
    if (req.tenant.is_demo)
      throw fail(
        403,
        "Shared demo accounts cannot change authentication settings",
      );
    const {
      rows: [user],
    } = await pool.query("SELECT * FROM users WHERE id=$1", [req.user.id]);
    if (!(await verifyPassword(req.body.password || "", user.password_hash)))
      throw fail(400, "Incorrect password");
    const {
      rows: [existing],
    } = await pool.query("SELECT enabled FROM user_mfa WHERE user_id=$1", [
      user.id,
    ]);
    if (existing?.enabled)
      throw fail(409, "Disable the current method before changing it");
    const method = req.body.method;
    if (!["email", "totp"].includes(method))
      throw fail(400, "Invalid verification method");
    let secret = null,
      uri = null;
    if (method === "totp") {
      secret = new OTPAuth.Secret({ size: 20 }).base32;
      uri = totp(secret, user.email).toString();
    }
    await pool.query(
      "INSERT INTO user_mfa(user_id,method,secret) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET method=$2,secret=$3,last_step=-1 WHERE NOT user_mfa.enabled",
      [user.id, method, secret ? seal(secret) : null],
    );
    const id = await beginChallenge(user, "setup", method);
    req.session.mfaSetup = id;
    res.json({ method, secret, qr: uri ? await QRCode.toDataURL(uri) : null });
  });
  app.post("/api/security/confirm", limit, async (req, res) => {
    if (
      !req.session.mfaSetup ||
      !(await completeChallenge(
        req.session.mfaSetup,
        req.user.id,
        "setup",
        req.body.code,
      ))
    )
      throw fail(400, "Invalid or expired verification code");
    const codes = Array.from({ length: 8 }, () =>
      randomBytes(8).toString("hex"),
    );
    await pool.query(
      "UPDATE user_mfa SET enabled=true,recovery_hashes=$1 WHERE user_id=$2",
      [codes.map(digest), req.user.id],
    );
    await pool.query(
      "UPDATE users SET email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1 AND EXISTS(SELECT 1 FROM user_mfa WHERE user_id=$1 AND method='email')",
      [req.user.id],
    );
    delete req.session.mfaSetup;
    await pool.query(
      "DELETE FROM session WHERE sess->>'userId'=$1 AND sid<>$2",
      [String(req.user.id), req.sessionID],
    );
    res.json({ ok: true, recovery_codes: codes });
  });
  app.post("/api/security/disable/start", limit, async (req, res) => {
    const {
      rows: [user],
    } = await pool.query(
      "SELECT u.*,m.method FROM users u JOIN user_mfa m ON m.user_id=u.id AND m.enabled WHERE u.id=$1",
      [req.user.id],
    );
    if (
      !user ||
      !(await verifyPassword(req.body.password || "", user.password_hash))
    )
      throw fail(400, "Incorrect password");
    req.session.mfaDisable = await beginChallenge(user, "disable", user.method);
    res.json({ ok: true });
  });
  app.post("/api/security/disable", limit, async (req, res) => {
    if (
      !req.session.mfaDisable ||
      !(await completeChallenge(
        req.session.mfaDisable,
        req.user.id,
        "disable",
        req.body.code,
      ))
    )
      throw fail(400, "Invalid or expired verification code");
    await pool.query("DELETE FROM user_mfa WHERE user_id=$1", [req.user.id]);
    delete req.session.mfaDisable;
    res.json({ ok: true });
  });
}
