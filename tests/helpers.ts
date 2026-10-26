import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { openDB, hash } from "../server/db.ts";
export function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "thordy-test-"));
  const path = join(dir, "db.sqlite"),
    db = openDB(path);
  db.prepare(
    "INSERT INTO users(id,username,password,role) VALUES(1,'admin',?,'admin'),(2,'operator',?,'operator')",
  ).run(hash("test-password-123"), hash("test-password-123"));
  db.prepare(
    "INSERT INTO products(id,name,price) VALUES(1,'Producto prueba A',12000),(2,'Producto prueba B',8000)",
  ).run();
  return {
    dir,
    path,
    db,
    close() {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
export const input = () => ({
  request_key: randomUUID(),
  customer: "Cliente prueba",
  channel: "WhatsApp",
  payment: "Efectivo",
  discount: 1000,
  delivery: 3000,
  items: [
    { product_id: 1, quantity: 2 },
    { product_id: 2, quantity: 1 },
  ],
});
