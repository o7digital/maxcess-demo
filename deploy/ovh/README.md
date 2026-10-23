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

## Stripe payment modes

`STRIPE_MODE` defaults to `test`. Live payments require `STRIPE_MODE=live` and
a matching `sk_live_` or restricted `rk_live_` key in the private `app.env`.
The webhook signing secret must belong to the endpoint in the same account and
mode. Signed events and fetched subscriptions from the other mode are rejected.
Live price references use a separate catalog namespace so test prices are never
reused for real Checkout sessions. Existing customers and subscriptions must be
audited before changing modes; their identifiers are also mode-specific.
An optional `STRIPE_PORTAL_CONFIGURATION_ID` selects an app-specific customer portal.

Before enabling live payments: verify account identity, API permissions, Stripe
Tax readiness and live webhook registration; back up the database and private
configuration. Validate Checkout and webhook processing in test mode first.
Never charge a customer as an infrastructure test. CLI credentials expire and
must be replaced with a durable, appropriately scoped server credential.

## Agent pricing (billing model v3, price version 2)

The `agents` offer is USD 18 per internal agent per month, excluding tax.
Admins and managers are staff seats; customer requester accounts and their
invitations do not consume paid seats. Pending staff invitations reserve seats.
One-time setup is USD 149 monthly, USD 99 with quarterly prepayment, USD 49
with six-month prepayment, and free with annual prepayment. Discounts remain
7.5%/12.5%/two free months respectively.
Waiver is recorded only after a verified paid Checkout with the correct amount
and metadata. Once settled, activation is not billed again.

Migration 022 archives the agent price and increments its version; untouched
unpaid trials move to billing model v3. Migration 020 retains the older catalogue. Existing Stripe
contracts and financially linked workspaces retain their original model,
currency and activation terms. Only untouched unpaid trials migrate. Stripe
prices are immutable and the new offer creates distinct price references.
Vercel accepts the backend catalogue only if its billing model matches, otherwise
it displays the approved offer with checkout unavailable. After accepting any new
payment, use a forward fix rather than restoring an image that cannot process
this billing model; never rewrite existing invoices or Stripe contracts.

## Automatic Service Hub ZIP backups

VPS1 runs `maxcess-backup` hourly (up to two minutes jitter), using an exported
read-only PostgreSQL snapshot shared by the dump, row counts and binary hashes.
The private ZIP includes the database (all accounts and attachments), source,
lockfile, service configuration and Service Hub TLS material. It does not back up
Mailcow, WordPress, Pulse or the whole VPS. Root-only copies are retained on VPS1
and transferred by the existing pinned, forced-command SSH key to VPS2. ZIP CRC
and SHA256 are checked before success is recorded. Retention on both hosts:
latest 48 copies plus one copy per day for the latest 30 available days. Existing
TGZ copies remain untouched. The receiver accepts up to 2 GiB per archive.

`maxcess-backup-restore-test.timer` runs daily on VPS2 at 06:15 UTC plus up to
five minutes jitter. It restores into a disposable PostgreSQL 18 with no network,
no published ports, 384 MiB RAM, 0.5 CPU and a 512 MiB temporary database. It checks
every table count and attachment/logo hash against the dump snapshot, tests
writes, then deletes the temporary container. Increase these explicit limits as
data grows. Neither workers nor mail, payments or connectors run in this test.
Status: `/srv/maxcess-backups/restore-test-status.json`; failures are visible in
`systemctl status maxcess-backup-restore-test.service` and its journal.

The Mac script uses existing SSH authentication to pull the latest ZIP directly
from VPS2 every hour while the user session is running and the Mac is awake.
Destination: `~/ServiceHub Backups` (0700, archives 0600), same retention.
It verifies SHA256/ZIP CRC and rejects remote copies older than three hours.
LaunchAgent: `com.o7digital.servicehub-backup`. State: `sync-status.json` in the
backup folder; logs under `~/Library/Application Support/O7 Service Hub/`.
No external alert delivery is configured; inspect status files and systemd/launchd
failures. A successful hourly backup limits the restore point to approximately
one hour plus scheduling/runtime; missed backups increase that gap. A backup is
not an automatic service failover and does not guarantee zero data loss.

Workspace administrators with verified email can download their own portable ZIP
in Settings via `/api/workspace/backup.zip`, including UTF-8 JSON Lines and exact
attachment bytes. The export uses a read-only repeatable snapshot and includes a
SHA256 manifest. It excludes credentials, passwords, sessions, MFA and all other
workspaces. It remains available when an expired trial is read only. Exports are
rate/concurrency limited, streamed, and not cached. This portable archive supports
assisted recovery; automatic complete ZIP import is not implemented. Never give
the global operator ZIP (all tenants and secrets) to a customer.
