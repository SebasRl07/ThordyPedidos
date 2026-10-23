import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { resolve, join } from "node:path";
import Database from "better-sqlite3";
import { type DB, now } from "./db.ts";
export async function backup(db: DB, folder: string, retention: number) {
  mkdirSync(folder, { recursive: true });
  const file = resolve(
    folder,
    `thordy-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`,
  );
  try {
    await db.backup(file);
    const check = new Database(file, { readonly: true });
    try {
      if (check.pragma("integrity_check", { simple: true }) !== "ok")
        throw Error("Integridad fallida");
    } finally {
      check.close();
    }
    db.prepare("INSERT INTO backup_history(at,path,status) VALUES(?,?,?)").run(
      now(),
      file,
      "ok",
    );
    for (const f of readdirSync(folder)) {
      if (
        /^thordy-[\dTZ.-]+\.sqlite$/.test(f) &&
        Date.now() - statSync(join(folder, f)).mtimeMs > retention * 86400000
      )
        unlinkSync(join(folder, f));
    }
    return { file, status: "ok" };
  } catch (e) {
    db.prepare("INSERT INTO backup_history(at,path,status) VALUES(?,?,?)").run(
      now(),
      file,
      "error",
    );
    throw e;
  }
}
