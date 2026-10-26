import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rmSync, readFileSync } from "node:fs";
import { createOrder, transition, deleteOrder } from "../server/orders.ts";
import { detail, localDate, openDB } from "../server/db.ts";
import { report, workbook } from "../server/reports.ts";
import { PrintService, SimulatedAdapter } from "../server/printing.ts";
import { buildApp } from "../server/app.ts";
import { io as client } from "socket.io-client";
import { fixture, input } from "./helpers.ts";
import type { Order, OrderStatus, Actor } from "../shared/domain.ts";
process.env.TEST = "1";
const admin: Actor = { id: 1, username: "admin", role: "admin" };
const confirm = (o: Order) => ({
  confirmation: String(o.id),
  acknowledged: true,
  expected_revision: o.revision,
});
function reach(db: ReturnType<typeof openDB>, o: Order, status: OrderStatus) {
  if (status === "cancelled")
    return transition(
      db,
      o.id,
      { expected: "received", status, reason: "Prueba" },
      1,
    );
  for (const next of ["ready", "dispatched", "delivered"] as const) {
    if (o.status === status) break;
    o = transition(db, o.id, { expected: o.status, status: next }, 1);
  }
  return o;
}
for (const status of [
  "received",
  "ready",
  "dispatched",
  "delivered",
  "cancelled",
] as const)
  test(`eliminación definitiva en estado ${status}: relaciones, auditoría y consecutivo`, () => {
    const f = fixture();
    try {
      const x = input(),
        o = reach(f.db, createOrder(f.db, x, 1), status);
      const keep = createOrder(f.db, input(), 1);
      const printer = new PrintService(f.db, new SimulatedAdapter());
      printer.enqueue(o.id, "kitchen", randomUUID());
      deleteOrder(f.db, o.id, confirm(o), admin);
      assert.equal(detail(f.db, o.id), null);
      for (const table of ["order_items", "order_status_history", "print_jobs"])
        assert.equal(
          (
            f.db
              .prepare(`SELECT count(*) n FROM ${table} WHERE order_id=?`)
              .get(o.id) as { n: number }
          ).n,
          0,
        );
      assert.deepEqual(f.db.pragma("foreign_key_check"), []);
      const audit = f.db
        .prepare("SELECT * FROM order_deletions WHERE order_id=?")
        .get(o.id) as {
        admin_id: number;
        admin_username: string;
        original_status: string;
        deleted_at: string;
      };
      assert.equal(audit.admin_id, 1);
      assert.equal(audit.admin_username, "admin");
      assert.equal(audit.original_status, status);
      assert.match(audit.deleted_at, /Z$/);
      assert.equal(detail(f.db, keep.id)!.total, keep.total);
      assert.throws(() => createOrder(f.db, x, 1), /eliminado/);
      assert.ok(createOrder(f.db, input(), 1).id > keep.id);
    } finally {
      f.close();
    }
  });
test("permisos, confirmaciones, conflicto obsoleto y rollback integral", () => {
  const f = fixture();
  try {
    let o = createOrder(f.db, input(), 1);
    assert.throws(
      () =>
        deleteOrder(f.db, o.id, confirm(o), {
          id: 2,
          username: "operator",
          role: "operator",
        }),
      /administradores/,
    );
    assert.throws(() =>
      deleteOrder(f.db, o.id, { ...confirm(o), confirmation: "otro" }, admin),
    );
    assert.throws(() =>
      deleteOrder(f.db, o.id, { ...confirm(o), acknowledged: false }, admin),
    );
    const old = confirm(o);
    o = transition(f.db, o.id, { expected: "received", status: "ready" }, 1);
    assert.throws(() => deleteOrder(f.db, o.id, old, admin), /cambió/);
    f.db.exec(
      "CREATE TRIGGER reject_delete BEFORE DELETE ON orders BEGIN SELECT RAISE(ABORT,'prueba de rollback'); END;",
    );
    assert.throws(() => deleteOrder(f.db, o.id, confirm(o), admin), /rollback/);
    assert.equal(detail(f.db, o.id)!.items.length, 2);
    assert.equal(
      (
        f.db.prepare("SELECT count(*) n FROM order_deletions").get() as {
          n: number;
        }
      ).n,
      0,
    );
  } finally {
    f.close();
  }
});
test("eliminación de entregados actualiza informes, ranking y Excel del período", async () => {
  const f = fixture();
  try {
    const deleted = reach(f.db, createOrder(f.db, input(), 1), "delivered");
    const keep = reach(
      f.db,
      createOrder(
        f.db,
        {
          ...input(),
          discount: 0,
          delivery: 0,
          items: [{ product_id: 2, quantity: 1 }],
        },
        1,
      ),
      "delivered",
    );
    const day = localDate(deleted.created_at),
      q = { from: day.slice(0, 8) + "01", to: day };
    const before = report(f.db, q);
    assert.equal(before.sales, 42000);
    deleteOrder(f.db, deleted.id, confirm(deleted), admin);
    for (const query of [
      q,
      { from: day, to: day },
      {
        from: new Date(Date.parse(day + "T12:00:00Z") - 6 * 86400000)
          .toISOString()
          .slice(0, 10),
        to: day,
      },
    ]) {
      const after = report(f.db, query);
      assert.equal(after.sales, 8000);
      assert.equal(after.ticket, 8000);
      assert.equal(after.received, 1);
      assert.equal(after.delivered, 1);
      assert.equal(after.products.length, 1);
      assert.equal(after.products[0].quantity, 1);
      assert.equal(after.times.length, 1);
      assert.equal(after.fastest!.id, keep.id);
      assert.equal(
        after.daily.reduce((s, d) => s + d.orders, 0),
        1,
      );
    }
    const book = await workbook(f.db, q);
    assert.equal(book.getWorksheet("Pedidos")!.rowCount, 2);
    assert.equal(
      book.getWorksheet("Pedidos")!.getRow(2).getCell(1).value,
      keep.id,
    );
    assert.equal(book.getWorksheet("Productos vendidos")!.rowCount, 2);
  } finally {
    f.close();
  }
});
test("cola en espera se revalida tras await y no imprime pedidos eliminados", async () => {
  const f = fixture();
  try {
    const first = createOrder(f.db, input(), 1),
      second = createOrder(f.db, input(), 1);
    let resume!: () => void;
    const sent: string[] = [];
    const printer = new PrintService(f.db, {
      name: "test-delayed",
      async send(text) {
        sent.push(text);
        await new Promise<void>((resolve) => {
          resume = resolve;
        });
      },
    });
    printer.enqueue(first.id, "kitchen", randomUUID());
    printer.enqueue(second.id, "kitchen", randomUUID());
    const processing = printer.process();
    assert.throws(
      () => deleteOrder(f.db, first.id, confirm(first), admin),
      /impresión en curso/,
    );
    deleteOrder(f.db, second.id, confirm(second), admin);
    resume();
    await processing;
    assert.equal(sent.length, 1);
    deleteOrder(f.db, first.id, confirm(first), admin);
    assert.equal(
      (f.db.prepare("SELECT count(*) n FROM orders").get() as { n: number }).n,
      0,
    );
  } finally {
    f.close();
  }
});
test(
  "API: administrador, origen, dos borrados simultáneos y evento a segundo cliente",
  { timeout: 15000 },
  async () => {
    const f = fixture();
    const order = createOrder(f.db, input(), 1);
    f.db.close();
    const { app } = await buildApp(f.path);
    let socket: ReturnType<typeof client> | undefined;
    try {
      await app.listen({ port: 0, host: "127.0.0.1" });
      const login = async (username: string) => {
        const response = await app.inject({
          method: "POST",
          url: "/api/login",
          headers: { "x-thordy-request": "1" },
          payload: { username, password: "test-password-123" },
        });
        return "session=" + response.cookies[0].value;
      };
      const adminCookie = await login("admin"),
        operatorCookie = await login("operator");
      const request = {
        method: "DELETE" as const,
        url: `/api/orders/${order.id}`,
        payload: confirm(order),
      };
      assert.equal((await app.inject(request)).statusCode, 403);
      assert.equal(
        (await app.inject({ ...request, headers: { "x-thordy-request": "1" } }))
          .statusCode,
        401,
      );
      assert.equal(
        (
          await app.inject({
            ...request,
            headers: { "x-thordy-request": "1", cookie: operatorCookie },
          })
        ).statusCode,
        403,
      );
      assert.equal(
        (
          await app.inject({
            ...request,
            headers: {
              "x-thordy-request": "1",
              cookie: adminCookie,
              origin: "http://otro.invalid",
            },
          })
        ).statusCode,
        403,
      );
      socket = client(app.listeningOrigin, {
        transports: ["websocket"],
        extraHeaders: { cookie: operatorCookie },
      });
      await new Promise<void>((resolve, reject) => {
        socket!.once("connect", resolve);
        socket!.once("connect_error", reject);
      });
      const event = new Promise<unknown>((resolve) =>
        socket!.once("changed", resolve),
      );
      const results = await Promise.all(
        [1, 2].map(() =>
          app.inject({
            ...request,
            headers: { "x-thordy-request": "1", cookie: adminCookie },
          }),
        ),
      );
      assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 404]);
      assert.deepEqual(await event, {
        resource: "orders",
        action: "deleted",
        id: order.id,
      });
      assert.equal(
        (
          await app.inject({
            url: "/api/orders?active=1",
            headers: { cookie: operatorCookie },
          })
        ).json().total,
        0,
      );
      assert.equal(
        (
          await app.inject({
            url: "/api/deletions",
            headers: { cookie: adminCookie },
          })
        ).json().length,
        1,
      );
    } finally {
      socket?.disconnect();
      await app.close();
      rmSync(f.dir, { recursive: true, force: true });
    }
  },
);

test("al borrar el consecutivo más alto no se reutiliza su número", () => {
  const f = fixture();
  try {
    const o = createOrder(f.db, input(), 1);
    deleteOrder(f.db, o.id, confirm(o), admin);
    assert.ok(createOrder(f.db, input(), 1).id > o.id);
  } finally {
    f.close();
  }
});
