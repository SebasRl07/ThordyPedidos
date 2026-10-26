// Runs on Node 24 directly: npm ci may replace tsx while this process is alive.
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  acquireDatabaseLock,
  assertServerStopped,
  backupBeforeUpdate,
} from "./maintenance.ts";
function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error(
      `${command} ${args.join(" ")} falló. No inicies el servidor hasta resolverlo.`,
    );
}
function gitRead(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0)
    throw Error(result.stderr || "No se pudo consultar Git");
  return result.stdout.trim();
}
let release;
let snapshot;
let previous;
try {
  if (Number(process.versions.node.split(".")[0]) < 24)
    throw Error("Se requiere Node.js 24 o superior");
  if (gitRead(["status", "--porcelain"]))
    throw Error(
      "Hay cambios locales en código. Guárdalos antes de actualizar; no se sobrescribirán.",
    );
  if (gitRead(["ls-files", "--", "data", ".env"]))
    throw Error(
      "Hay datos o configuración local rastreados por Git. Corrige el seguimiento antes de actualizar.",
    );
  previous = gitRead(["rev-parse", "HEAD"]);
  gitRead(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  const path = resolve(process.env.DB_PATH || "data/thordy.sqlite");
  release = acquireDatabaseLock(path, "update");
  await assertServerStopped(
    Number(process.env.PORT || 3000),
    process.env.HOST || "0.0.0.0",
  );
  snapshot = await backupBeforeUpdate(path);
  console.log(
    snapshot
      ? "Respaldo previo verificado: " + snapshot
      : "No existe base operativa todavía; no hay datos que respaldar.",
  );
  console.log("Versión previa: " + previous);
  run("git", ["pull", "--ff-only"]);
  run("npm", ["ci"]);
  run("npm", ["run", "build"]);
  // Apply migrations only after installation and compilation succeed.
  run("npm", ["run", "init"]);
  console.log(
    "Actualización completada. Puedes iniciar THORDY con scripts\\start.cmd.",
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Actualización fallida",
  );
  if (snapshot)
    console.error(
      "Tus datos no se han borrado. Conserva el respaldo: " + snapshot,
    );
  if (previous) console.error("Versión de código anterior: " + previous);
  process.exitCode = 1;
} finally {
  release?.();
}
