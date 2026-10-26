// This is a short-lived child. No npm package, tsx or better-sqlite3 is needed.
import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { randomUUID } from "node:crypto";

async function verifiedSnapshot(input) {
  if (!input) throw Error("Falta la ruta de la base de datos.");
  const path = resolve(input);
  if (!existsSync(path)) return null;
  const dir = join(dirname(path), "update-backups");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `before-update-${Date.now()}-${randomUUID()}.sqlite`);
  const source = new DatabaseSync(path, { readOnly: true });
  try {
    await backup(source, file);
  } finally {
    source.close();
  }
  const copy = new DatabaseSync(file);
  try {
    copy.exec("PRAGMA journal_mode=DELETE");
    if (
      copy.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok" ||
      copy.prepare("PRAGMA foreign_key_check").all().length
    )
      throw Error("Integridad o referencias inválidas en el respaldo: " + file);
  } finally {
    copy.close();
  }
  return file;
}
try {
  const file = await verifiedSnapshot(process.argv[2]);
  process.stdout.write(JSON.stringify({ status: "verified", file }));
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "No se pudo verificar el respaldo.",
  );
  process.exitCode = 1;
}
