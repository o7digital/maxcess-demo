import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
for (const directory of ["server", "scripts", "public", "tests"])
  for (const file of readdirSync(directory).filter((f) => f.endsWith(".js")))
    execFileSync(process.execPath, ["--check", `${directory}/${file}`]);
const html = readFileSync("public/index.html", "utf8");
if (!html.includes('lang="es"') || !html.includes("/app.js"))
  throw new Error("Invalid application shell");
console.log("Application build verified (native JS + static assets).");
