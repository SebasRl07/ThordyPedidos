import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { openDB, hash, durations, localDate } from "../server/db.ts";
import { createOrder, transition } from "../server/orders.ts";
import { report, workbook } from "../server/reports.ts";
import { backup } from "../server/backup.ts";
import { buildApp } from "../server/app.ts";
import { io as client } from "socket.io-client";
process.env.TEST = "1";
function fixture() {
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
const input = () => ({
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
test("pedido multiproducto: enteros, consecutivo, UTC, historial e idempotencia", () => {
  const f = fixture();
  try {
    const x = input(),
      o = createOrder(f.db, x, 1);
    assert.equal(o.subtotal, 32000);
    assert.equal(o.total, 34000);
    assert.equal(o.items.length, 2);
    assert.match(o.created_at, /Z$/);
    assert.equal(o.history[0].user_id, 1);
    assert.equal(createOrder(f.db, x, 1).id, o.id);
    assert.equal(createOrder(f.db, input(), 1).id, o.id + 1);
    assert.throws(() => createOrder(f.db, { ...input(), discount: 999999 }, 1));
    assert.throws(() =>
      createOrder(
        f.db,
        { ...input(), items: [{ product_id: 1, quantity: 1.2 }] },
        1,
      ),
    );
  } finally {
    f.close();
  }
});
test("transiciones atómicas, duplicados, concurrencia obsoleta y cancelación", () => {
  const f = fixture();
  try {
    const o = createOrder(f.db, input(), 1);
    assert.throws(() =>
      transition(f.db, o.id, { expected: "received", status: "delivered" }, 1),
    );
    const ready = transition(
      f.db,
      o.id,
      { expected: "received", status: "ready" },
      1,
    );
    assert.ok(ready.ready_at);
    assert.throws(() =>
      transition(f.db, o.id, { expected: "received", status: "ready" }, 2),
    );
    transition(f.db, o.id, { expected: "ready", status: "dispatched" }, 2);
    const done = transition(
      f.db,
      o.id,
      { expected: "dispatched", status: "delivered" },
      2,
    );
    assert.ok(done.delivered_at);
    assert.equal(done.history.length, 4);
    const c = createOrder(f.db, input(), 1);
    assert.throws(() =>
      transition(f.db, c.id, { expected: "received", status: "cancelled" }, 1),
    );
    const cancelled = transition(
      f.db,
      c.id,
      { expected: "received", status: "cancelled", reason: "Prueba" },
      1,
    );
    assert.ok(cancelled.cancelled_at);
    assert.equal(cancelled.cancel_reason, "Prueba");
  } finally {
    f.close();
  }
});
test("tiempos cruzando medianoche Colombia", () => {
  const d = durations({
    created_at: "2026-10-24T04:50:00Z",
    ready_at: "2026-10-24T05:10:00Z",
    dispatched_at: "2026-10-24T05:15:00Z",
    delivered_at: "2026-10-24T05:30:00Z",
  });
  assert.deepEqual(d, { preparation: 20, waiting: 5, delivery: 15, total: 40 });
  assert.equal(localDate("2026-10-24T04:50:00Z"), "2026-10-23");
});
test("informes día, semana, mes: fecha creación vs entrega, ranking y Excel", async () => {
  const f = fixture();
  try {
    const o = createOrder(f.db, input(), 1);
    f.db
      .prepare(
        "UPDATE orders SET status='delivered',created_at='2026-10-24T04:50:00Z',ready_at='2026-10-24T05:10:00Z',dispatched_at='2026-10-24T05:15:00Z',delivered_at='2026-10-24T05:30:00Z' WHERE id=?",
      )
      .run(o.id);
    const c = createOrder(f.db, input(), 1);
    f.db
      .prepare(
        "UPDATE orders SET status='cancelled',created_at='2026-10-24T05:00:00Z' WHERE id=?",
      )
      .run(c.id);
    assert.equal(
      report(f.db, { from: "2026-10-23", to: "2026-10-23" }).sales,
      0,
    );
    for (const q of [
      { from: "2026-10-24", to: "2026-10-24" },
      { from: "2026-10-19", to: "2026-10-25" },
      { from: "2026-10-01", to: "2026-10-31" },
    ]) {
      const r = report(f.db, q);
      assert.equal(r.sales, 34000);
      assert.equal(r.products[0].quantity, 2);
      assert.equal(r.averages.total, 40);
      assert.equal(r.cancelled, 1);
    }
    const book = await workbook(f.db, { from: "2026-10-01", to: "2026-10-31" });
    const buf = await book.xlsx.writeBuffer();
    assert.ok(buf.byteLength > 5000);
    assert.equal(book.worksheets.length, 3);
    assert.equal(book.getWorksheet("Productos vendidos")!.rowCount, 5);
  } finally {
    f.close();
  }
});
test("respaldo íntegro, restauración y persistencia tras reinicio", async () => {
  const f = fixture();
  try {
    createOrder(f.db, input(), 1);
    const b = await backup(f.db, join(f.dir, "backups"), 30);
    const restored = openDB(b.file);
    assert.equal(
      (restored.prepare("SELECT count(*) n FROM orders").get() as any).n,
      1,
    );
    assert.equal(restored.pragma("integrity_check", { simple: true }), "ok");
    restored.close();
    const restoreTarget = join(f.dir, "restored-by-cli.sqlite");
    const cli = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/restore.ts", b.file, "--server-stopped"],
      { env: { ...process.env, DB_PATH: restoreTarget }, encoding: "utf8" },
    );
    assert.equal(cli.status, 0, cli.stderr);
    const fromCLI = openDB(restoreTarget);
    assert.equal(
      (fromCLI.prepare("SELECT count(*) n FROM orders").get() as any).n,
      1,
    );
    fromCLI.close();
    const reopened = openDB(f.path);
    assert.equal(
      (reopened.prepare("SELECT total FROM orders").get() as any).total,
      34000,
    );
    reopened.close();
  } finally {
    f.close();
  }
});
test("API autenticación, permisos, origen y sincronización de dos dispositivos", async () => {
  const f = fixture();
  f.db.close();
  const { app, db } = await buildApp(f.path);
  await app.listen({ host: "127.0.0.1", port: 0 });
  const base = app.listeningOrigin;
  const headers = { "x-thordy-request": "1" };
  const login = async (username: string) => {
    const r = await app.inject({
      method: "POST",
      url: "/api/login",
      headers,
      payload: { username, password: "test-password-123" },
    });
    assert.equal(r.statusCode, 200);
    return r.cookies[0].value;
  };
  let a: any, b: any;
  try {
    assert.equal((await app.inject("/api/orders")).statusCode, 401);
    const admin = await login("admin"),
      operator = await login("operator");
    assert.equal(
      (
        await app.inject({
          url: "/api/reports",
          headers: { cookie: "session=" + operator },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/products",
          headers: { ...headers, cookie: "session=" + operator },
          payload: { name: "No", price: 1 },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/orders",
          headers: {
            ...headers,
            cookie: "session=" + admin,
            origin: "http://evil.example",
          },
          payload: input(),
        })
      ).statusCode,
      403,
    );
    const connect = (token: string) =>
      new Promise<any>((resolve, reject) => {
        const s = client(base, {
          extraHeaders: { cookie: "session=" + token },
          transports: ["websocket"],
        });
        s.on("connect", () => resolve(s));
        s.on("connect_error", reject);
      });
    a = await connect(admin);
    b = await connect(operator);
    const changed = new Promise<void>((resolve) =>
      b.once("changed", () => resolve()),
    );
    const r = await app.inject({
      method: "POST",
      url: "/api/orders",
      headers: { ...headers, cookie: "session=" + admin },
      payload: input(),
    });
    assert.equal(r.statusCode, 200);
    await changed;
    const o = r.json();
    const changes = await Promise.all(
      [1, 2].map(() =>
        app.inject({
          method: "POST",
          url: `/api/orders/${o.id}/status`,
          headers: { ...headers, cookie: "session=" + operator },
          payload: { expected: "received", status: "ready" },
        }),
      ),
    );
    assert.deepEqual(changes.map((r) => r.statusCode).sort(), [200, 400]);
    const print = await app.inject({
      method: "POST",
      url: `/api/orders/${o.id}/print`,
      headers: { ...headers, cookie: "session=" + operator },
      payload: { kind: "kitchen", request_key: randomUUID() },
    });
    assert.equal(print.json().simulated, true);
    assert.equal(
      (
        await app.inject({
          url: "/api/orders?active=1",
          headers: { cookie: "session=" + operator },
        })
      ).json().rows[0].status,
      "ready",
    );
  } finally {
    a?.disconnect();
    b?.disconnect();
    await app.close();
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test("cola de impresión: idempotencia, plantillas y reintentos limitados", async () => {
  const { PrintService, SimulatedAdapter, printText } =
    await import("../server/printing.ts");
  const f = fixture();
  try {
    const o = createOrder(f.db, input(), 1),
      adapter = new SimulatedAdapter(),
      printer = new PrintService(f.db, adapter);
    const key = randomUUID();
    printer.enqueue(o.id, "kitchen", key);
    printer.enqueue(o.id, "kitchen", key);
    await printer.process();
    assert.equal(adapter.jobs.length, 1);
    assert.match(adapter.jobs[0], /COMANDA DE COCINA/);
    assert.doesNotMatch(adapter.jobs[0], /TOTAL/);
    assert.match(printText(o, "receipt"), /TOTAL: \$34000/);
    let attempts = 0;
    const broken = new PrintService(f.db, {
      name: "test-failing",
      async send() {
        attempts++;
        throw Error("Hardware ausente");
      },
    });
    broken.enqueue(o.id, "receipt", randomUUID());
    for (let n = 0; n < 5; n++) await broken.process();
    assert.equal(attempts, 3);
    assert.equal(
      (
        f.db
          .prepare("SELECT status FROM print_jobs WHERE kind='receipt'")
          .get() as any
      ).status,
      "failed",
    );
  } finally {
    f.close();
  }
});
test("restricción a red local: IPv4, IPv6 y direcciones públicas", async () => {
  const { isPrivateAddress } = await import("../server/network.ts");
  for (const ip of [
    "127.0.0.1",
    "::1",
    "::ffff:192.168.1.4",
    "10.1.2.3",
    "172.16.0.2",
    "172.31.255.4",
    "fd12::1",
  ])
    assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ["8.8.8.8", "172.32.0.1", "1.2.3.4", "2001:4860:4860::8888"])
    assert.equal(isPrivateAddress(ip), false, ip);
});
test("catálogo histórico y rollback de pedido incompleto", () => {
  const f = fixture();
  try {
    const o = createOrder(f.db, input(), 1);
    f.db
      .prepare(
        "UPDATE products SET price=99999,name='Nombre nuevo',sold_out=1 WHERE id=1",
      )
      .run();
    const row = f.db
      .prepare(
        "SELECT name,price FROM order_items WHERE order_id=? AND product_id=1",
      )
      .get(o.id) as any;
    assert.equal(row.price, 12000);
    assert.equal(row.name, "Producto prueba A");
    assert.throws(() => createOrder(f.db, input(), 1));
    assert.equal(
      (f.db.prepare("SELECT count(*) n FROM orders").get() as any).n,
      1,
    );
  } finally {
    f.close();
  }
});
