import Database from "better-sqlite3";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import "dotenv/config";
const source = process.argv[2],
  target = resolve(process.env.DB_PATH || "data/thordy.sqlite");
if (!source || process.argv[3] !== "--server-stopped")
  throw Error(
    "Detén el servidor y ejecuta: npm run restore -- ruta-respaldo.sqlite --server-stopped",
  );
if (existsSync(target + "-wal") || existsSync(target + "-shm"))
  throw Error(
    "Hay archivos WAL/SHM: verifica cierre limpio del servidor antes de restaurar.",
  );
const db = new Database(resolve(source), {
  readonly: true,
  fileMustExist: true,
});
try {
  if (db.pragma("integrity_check", { simple: true }) !== "ok")
    throw Error("Respaldo corrupto");
  for (const table of ["users", "orders", "migrations"])
    db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).all();
} finally {
  db.close();
}
mkdirSync(dirname(target), { recursive: true });
if (existsSync(target))
  copyFileSync(target, target + ".before-restore-" + Date.now());
copyFileSync(resolve(source), target);
console.log("Restauración completada. Se conservó copia de la base anterior.");
