import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, mkdirSync, cpSync, rmSync } from "node:fs";
for (const directory of ["api", "server", "scripts", "public", "tests"])
  for (const file of readdirSync(directory).filter((f) => f.endsWith(".js")))
    execFileSync(process.execPath, ["--check", `${directory}/${file}`]);
const html = readFileSync("public/index.html", "utf8");
if (!html.includes('lang="es"') || !html.includes("/app.js"))
  throw new Error("Invalid application shell");
console.log("Application build verified (native JS + static assets).");

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
for (const file of readdirSync("public")) {
  if (!file.startsWith("demo."))
    cpSync(`public/${file}`, `dist/${file}`, { recursive: true });
}
console.log(
  "Commercial frontend prepared in dist/ (illustrative preview excluded).",
);
