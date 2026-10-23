import { Writable } from "node:stream";
async function hiddenPassword(): Promise<string> {
  if (!process.stdin.isTTY)
    throw Error(
      "La creación del administrador requiere una terminal interactiva local.",
    );
  const readline = await import("node:readline");
  let hidden = false;
  const output = new Writable({
    write(chunk, _enc, done) {
      if (!hidden) process.stdout.write(chunk);
      done();
    },
  });
  const input = readline.createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });
  return new Promise((resolve) => {
    input.question("Contraseña (mínimo 12 caracteres, oculta): ", (answer) => {
      hidden = false;
      process.stdout.write("\n");
      input.close();
      resolve(answer);
    });
    hidden = true;
  });
}
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { openDB, hash } from "./db.ts";
const rl = createInterface({ input: process.stdin, output: process.stdout });
const db = openDB(process.env.DB_PATH || "data/thordy.sqlite");
try {
  if (db.prepare("SELECT id FROM users LIMIT 1").get()) {
    if (!process.argv.includes("--if-empty"))
      throw Error("Ya existen usuarios; usa Administración.");
    console.log("Ya existen usuarios; se conserva la configuración.");
  } else {
    const username = (await rl.question("Usuario administrador: ")).trim();
    rl.close();
    const password = await hiddenPassword();
    if (username.length < 3 || password.length < 12)
      throw Error("Usuario mínimo 3 caracteres; contraseña mínimo 12.");
    db.prepare(
      "INSERT INTO users(username,password,role) VALUES(?,?,'admin')",
    ).run(username, hash(password));
    console.log("Administrador creado.");
  }
} finally {
  rl.close();
  db.close();
}
