import Database from "better-sqlite3";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
export function hash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function verify(password: string, stored: string) {
  try {
    const [salt, key] = stored.split(":");
    return timingSafeEqual(
      Buffer.from(key, "hex"),
      scryptSync(password, salt, 64),
    );
  } catch {
    return false;
  }
}
export function openDB(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec("CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY)");
  const migrationDir = fileURLToPath(new URL("./migrations/", import.meta.url));
  for (const file of readdirSync(migrationDir)
    .filter((f) => /^\d+.*\.sql$/.test(f))
    .sort()) {
    const version = Number(file.split("_")[0]);
    if (db.prepare("SELECT 1 FROM migrations WHERE version=?").get(version))
      continue;
    db.transaction(() => {
      db.exec(readFileSync(join(migrationDir, file), "utf8"));
      db.prepare("INSERT OR IGNORE INTO migrations VALUES(?)").run(version);
    })();
  }
  return db;
}
export type DB = ReturnType<typeof openDB>;
export const now = () => new Date().toISOString();
export const localDate = (date: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
export function detail(db: DB, id: number) {
  const order = db
    .prepare(
      "SELECT orders.*,users.username AS responsible FROM orders JOIN users ON users.id=orders.user_id WHERE orders.id=?",
    )
    .get(id) as any;
  if (!order) return null;
  order.items = db
    .prepare("SELECT * FROM order_items WHERE order_id=?")
    .all(id);
  order.history = db
    .prepare(
      "SELECT h.*,u.username FROM order_status_history h JOIN users u ON u.id=h.user_id WHERE order_id=? ORDER BY h.id",
    )
    .all(id);
  return order;
}
export function durations(o: any) {
  const diff = (a: string, b: string) =>
    a && b ? (Date.parse(a) - Date.parse(b)) / 60000 : null;
  return {
    preparation: diff(o.ready_at, o.created_at),
    waiting: diff(o.dispatched_at, o.ready_at),
    delivery: diff(o.delivered_at, o.dispatched_at),
    total: diff(o.delivered_at, o.created_at),
  };
}
