import { createApp } from "./app.js";
import { pool } from "./db.js";
const server = createApp().listen(process.env.PORT || 3000, "0.0.0.0", () =>
  console.log(`Service Hub listening on port ${process.env.PORT || 3000}`),
);
async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
