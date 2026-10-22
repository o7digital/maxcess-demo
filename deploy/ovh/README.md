# Service Hub on OVH VPS1

The Vercel frontend keeps `https://servicehub-o7.vercel.app`. Its API rewrites and
the billing gateway use `https://olivia.o7digitalgroup.com/servicehub-backend`.
This existing HTTPS host forwards a dedicated path through o7-proxy; no DNS,
Mailcow configuration, SMTP account or mail port is changed.

## Runtime

- Compose: `/opt/o7/apps/maxcess/compose.yml` on `ssh o7-vps` (51.178.36.17).
- Separate PostgreSQL 18 and API containers; each capped at 512 MiB and 0.75 CPU.
- Data: `/mnt/maildata/maxcess/postgres`; backups: `/mnt/maildata/maxcess/backups`.
- PostgreSQL is on an internal network with no published port.
- API diagnostic listener: `127.0.0.1:8105`; public entry through o7-proxy only.
- Secrets: private `postgres.env` and `app.env` alongside Compose, never in Git.
- Keep SESSION_SECRET and DATA_ENCRYPTION_KEY consistent with the source.
- `BACKGROUND_JOBS_ENABLED=false` disables the API's periodic notification and
  automation loop while validating a copied database. Enable it only after the
  old application is stopped and its database fenced against writes.
- Restart policy is `unless-stopped`; do not alter the Mailcow/Pulse writer guards.

## Backups

`maxcess-backup.timer` runs daily at 04:40 UTC with up to five minutes of jitter
(22:40 Mexico City on the previous calendar day). The root-only script creates a
transactional logical dump plus the private configuration, sends it over pinned
SSH to `/srv/maxcess-backups` on VPS2, and verifies the remote SHA256. Both servers
retain seven successful archives. A dedicated source-IP-restricted key can only
invoke `backup-receive.py`; it provides no interactive shell. Backup archives
contain secrets and must remain private. Check `maxcess-backup.service`,
`backup-status.json` and the timer after failures. These are backups, not an
automatic Maxcess failover configuration.

## Migration sequence

1. Take a logical PostgreSQL dump including sessions, accounts, tickets, attachments
   stored as bytea, logos and integration settings. Preserve the configuration privately.
2. Restore into the separate OVH cluster, run migrations and check health, login,
   permissions, PDF/Excel uploads and pricing. Keep jobs disabled in this copy.
3. Stage a Vercel production deployment with `--skip-domain`; do not promote yet.
4. Stop the Railway service-hub deployment in the dev environment used by the
   Vercel site; set the source database default_transaction_read_only=on and
   terminate existing client sessions. Verify a fresh connection is read-only.
5. Take and retain a final dump, replace the disposable OVH validation database,
   restore, migrate and compare row counts and attachment hashes before user traffic.
6. Enable jobs on OVH, promote the prepared Vercel deployment and update the
   servicehub-o7.vercel.app alias. Verify browser/API paths and persistence.
7. Retain a backup off VPS1 and remove any temporary Railway TCP proxy.

The Railway project's separate production environment is not implicitly deleted.
No database or volume should be deleted merely because one frontend now uses OVH.

## Rollback

Before OVH accepts writes, restore the previous Vercel deployment and source
database write mode only after stopping OVH jobs and the API. After OVH accepts
writes, its database is authoritative: export and reconcile all new writes before
any reverse migration. Never point users back at the old Railway snapshot.

Do not invoke a seed/bootstrap command on the migrated database. Build and test
commands use a separate local test database, never the migrated business database.
