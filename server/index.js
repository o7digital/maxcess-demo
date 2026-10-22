import { createApp } from "./app.js";
import { runAutomations } from "./automations.js";
import { runNotifications } from "./notifications.js";
import { pool } from "./db.js";
import { migrate } from "../scripts/migrate.js";
// Keep startup safe even when a hosting platform ignores pre-deploy settings.
await migrate();
const server = createApp().listen(process.env.PORT || 3000, "0.0.0.0", () =>
  console.log(`Service Hub listening on port ${process.env.PORT || 3000}`),
);
const notifications = process.env.BACKGROUND_JOBS_ENABLED === "false" ? null : setInterval(
  () =>
    Promise.all([runNotifications(), runAutomations()]).catch(() =>
      console.error("Background worker failed"),
    ),
  60000,
);
notifications?.unref();
async function shutdown() {
  clearInterval(notifications);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
