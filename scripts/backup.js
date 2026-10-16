import { spawn } from "node:child_process";
import { mkdir, chmod } from "node:fs/promises";
import { resolve } from "node:path";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const url = new URL(process.env.DATABASE_URL);
const destination = resolve(
  ".local/backups",
  `servicehub-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`,
);
await mkdir(resolve(".local/backups"), { recursive: true, mode: 0o700 });
const child = spawn(
  process.env.PG_DUMP_PATH || "pg_dump",
  ["-Fc", "-f", destination],
  {
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port || "5432",
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGSSLMODE: url.searchParams.get("sslmode") || "prefer",
    },
  },
);
const code = await new Promise((resolve) => {
  child.on("exit", resolve);
  child.on("error", () => resolve(1));
});
if (code !== 0) throw new Error("Backup failed");
await chmod(destination, 0o600);
console.log(`Backup created: ${destination}`);
