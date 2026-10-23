import "dotenv/config";
import { openDB } from "./db.ts";
const db = openDB(process.env.DB_PATH || "data/thordy.sqlite");
console.log(
  "SQLite inicializado; migraciones aplicadas. Usuarios: " +
    (db.prepare("SELECT count(*) AS count FROM users").get() as any).count,
);
db.close();
