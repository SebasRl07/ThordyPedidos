import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Same exclusive directory is held by the server and the updater, including subprocesses. */
export function acquireDatabaseLock(dbPath, purpose) {
  const folder = resolve(dbPath) + ".server-lock";
  mkdirSync(dirname(folder), { recursive: true });
  try {
    mkdirSync(folder);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
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
      );
      if (owner.token === token)
        rmSync(folder, { recursive: true, force: true });
    } catch {
      /* Never delete a lock owned by another process. */
    }
  };
}
export async function assertServerStopped(port, host = "0.0.0.0") {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("Puerto inválido en configuración");
  const hosts = new Set([
    "127.0.0.1",
    ...(host === "0.0.0.0" || host === "::" ? [] : [host]),
  ]);
  for (const address of hosts) {
    await new Promise((resolve, reject) => {
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
      socket.once("error", (error) => {
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

/** The coordinator never imports SQLite. spawnSync waits for the backup process to exit. */
export async function backupBeforeUpdate(dbPath) {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("./backup-before-update.mjs", import.meta.url)),
      resolve(dbPath),
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Error(
      "No se obtuvo un respaldo verificado. No se actualizará. " +
        (result.stderr?.trim() ||
          "El proceso de respaldo terminó inesperadamente."),
    );
  let response;
  try {
    response = JSON.parse(result.stdout);
  } catch {
    throw Error(
      "El respaldo no devolvió un resultado válido. No se actualizará.",
    );
  }
  if (
    response.status !== "verified" ||
    !(response.file === null || typeof response.file === "string")
  )
    throw Error("El resultado del respaldo es inválido. No se actualizará.");
  return response.file;
}
