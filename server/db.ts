import type {
  Order,
  OrderItem,
  StatusHistory,
  OrderRow,
} from "../shared/domain.ts";
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
/** Three batched reads, independent of order count; JSON avoids SQLite parameter limits. */
export function loadDetails(db: DB, ids: number[]): Order[] {
  if (!ids.length) return [];
  const keys = JSON.stringify(ids);
  const rows = db
    .prepare(
      `SELECT o.*,u.username AS responsible FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id IN (SELECT value FROM json_each(?))`,
    )
    .all(keys) as (OrderRow & { responsible: string })[];
  const items = db
    .prepare(
      "SELECT * FROM order_items WHERE order_id IN (SELECT value FROM json_each(?)) ORDER BY id",
    )
    .all(keys) as OrderItem[];
  const history = db
    .prepare(
      "SELECT h.*,u.username FROM order_status_history h JOIN users u ON u.id=h.user_id WHERE order_id IN (SELECT value FROM json_each(?)) ORDER BY h.id",
    )
    .all(keys) as StatusHistory[];
  const result = new Map<number, Order>(
    rows.map((o) => [o.id, { ...o, items: [], history: [], revision: 0 }]),
  );
  for (const item of items) result.get(item.order_id)?.items.push(item);
  for (const entry of history) {
    const o = result.get(entry.order_id);
    if (o) {
      o.history.push(entry);
      o.revision = entry.id;
    }
  }
  return ids.flatMap((id) => (result.has(id) ? [result.get(id)!] : []));
}
export function detail(db: DB, id: number): Order | null {
  return loadDetails(db, [id])[0] || null;
}
export function durations(
  o: Pick<
    OrderRow,
    "created_at" | "ready_at" | "dispatched_at" | "delivered_at"
  >,
) {
  const diff = (a: string | null, b: string | null) =>
    a && b ? (Date.parse(a) - Date.parse(b)) / 60000 : null;
  return {
    preparation: diff(o.ready_at, o.created_at),
    waiting: diff(o.dispatched_at, o.ready_at),
    delivery: diff(o.delivered_at, o.dispatched_at),
    total: diff(o.delivered_at, o.created_at),
  };
}
