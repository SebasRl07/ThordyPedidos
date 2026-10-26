import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { dirname, resolve, join } from "node:path";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

/** Same exclusive directory is held by the server and the updater, including subprocesses. */
export function acquireDatabaseLock(
  dbPath: string,
  purpose: "server" | "update",
) {
  const folder = resolve(dbPath) + ".server-lock";
  mkdirSync(dirname(folder), { recursive: true });
  try {
    mkdirSync(folder);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    throw Error(
      "El servidor o una actualización tiene el bloqueo de la base. Detén el servidor antes de continuar. Si quedó un bloqueo tras un corte, verifica que no exista ningún proceso THORDY antes de retirarlo.",
    );
  }
  const token = randomUUID();
  try {
    writeFileSync(
      join(folder, "owner.json"),
      JSON.stringify({
        pid: process.pid,
        purpose,
        at: new Date().toISOString(),
        token,
      }),
      { flag: "wx" },
    );
  } catch (error) {
    rmSync(folder, { recursive: true, force: true });
    throw error;
  }
  return () => {
    try {
      const owner = JSON.parse(
        readFileSync(join(folder, "owner.json"), "utf8"),
      ) as { token: string };
      if (owner.token === token)
        rmSync(folder, { recursive: true, force: true });
    } catch {
      /* Never delete a lock owned by another process. */
    }
  };
}
export async function assertServerStopped(port: number, host = "0.0.0.0") {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("Puerto inválido en configuración");
  const hosts = new Set([
    "127.0.0.1",
    ...(host === "0.0.0.0" || host === "::" ? [] : [host]),
  ]);
  for (const address of hosts) {
    await new Promise<void>((resolve, reject) => {
      const socket = connect({ port, host: address });
      socket.setTimeout(1500);
      socket.once("connect", () => {
        socket.destroy();
        reject(
          Error(
            `El puerto ${port} está ocupado. Detén el servidor antes de actualizar.`,
          ),
        );
      });
      socket.once("error", (error: NodeJS.ErrnoException) => {
        socket.destroy();
        if (error.code === "ECONNREFUSED") resolve();
        else
          reject(
            Error(
              "No se pudo comprobar que el servidor esté detenido: " +
                error.code,
            ),
          );
      });
      socket.once("timeout", () => {
        socket.destroy();
        reject(
          Error(
            "No se pudo verificar el servidor detenido: tiempo de espera agotado.",
          ),
        );
      });
    });
  }
}
export async function backupBeforeUpdate(dbPath: string) {
  const path = resolve(dbPath);
  if (!existsSync(path)) return null;
  const dir = join(dirname(path), "update-backups");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `before-update-${Date.now()}-${randomUUID()}.sqlite`);
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    await db.backup(file);
  } finally {
    db.close();
  }
  const check = new Database(file, { fileMustExist: true });
  try {
    check.pragma("journal_mode = DELETE");
    if (
      check.pragma("integrity_check", { simple: true }) !== "ok" ||
      (check.pragma("foreign_key_check") as unknown[]).length
    )
      throw Error(
        "El respaldo no pasó la comprobación de integridad. No se actualizará.",
      );
  } finally {
    check.close();
  }
  return file;
}
