import { z } from "zod";
import { type DB, detail, now } from "./db.ts";
export const orderSchema = z.object({
  request_key: z.string().uuid(),
  customer: z.string().trim().min(1).max(120),
  phone: z.string().max(40).default(""),
  address: z.string().max(300).default(""),
  neighborhood: z.string().max(100).default(""),
  channel: z.enum(["WhatsApp", "Instagram", "Llamada", "Otro"]),
  payment: z.enum([
    "Efectivo",
    "Transferencia bancaria",
    "Nequi",
    "Daviplata",
    "Otro",
  ]),
  notes: z.string().max(2000).default(""),
  discount: z.number().int().min(0).max(100000000).default(0),
  delivery: z.number().int().min(0).max(10000000).default(0),
  items: z
    .array(
      z.object({
        product_id: z.number().int().positive(),
        quantity: z.number().int().min(1).max(1000),
      }),
    )
    .min(1)
    .max(100),
});
export function createOrder(db: DB, input: unknown, user: number) {
  const x = orderSchema.parse(input);
  return db.transaction(() => {
    const old = db
      .prepare("SELECT id FROM orders WHERE request_key=?")
      .get(x.request_key) as any;
    if (old) return detail(db, old.id);
    const items = x.items.map((i) => {
      const p = db
        .prepare(
          "SELECT * FROM products WHERE id=? AND active=1 AND sold_out=0",
        )
        .get(i.product_id) as any;
      if (!p) throw Error("Producto no disponible");
      return { ...i, name: p.name, price: p.price };
    });
    const subtotal = items.reduce((a, i) => a + i.price * i.quantity, 0);
    if (
      !Number.isSafeInteger(subtotal) ||
      subtotal > 100000000 ||
      x.discount > subtotal
    )
      throw Error("Valores fuera de rango");
    const time = now();
    const r = db
      .prepare(
        "INSERT INTO orders(request_key,customer,phone,address,neighborhood,channel,payment,notes,subtotal,discount,delivery,total,created_at,user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        x.request_key,
        x.customer,
        x.phone,
        x.address,
        x.neighborhood,
        x.channel,
        x.payment,
        x.notes,
        subtotal,
        x.discount,
        x.delivery,
        subtotal - x.discount + x.delivery,
        time,
        user,
      );
    const id = Number(r.lastInsertRowid);
    for (const i of items)
      db.prepare(
        "INSERT INTO order_items(order_id,product_id,name,quantity,price) VALUES(?,?,?,?,?)",
      ).run(id, i.product_id, i.name, i.quantity, i.price);
    db.prepare(
      "INSERT INTO order_status_history(order_id,status,at,user_id) VALUES(?,?,?,?)",
    ).run(id, "received", time, user);
    return detail(db, id);
  })();
}
export function transition(db: DB, id: number, input: unknown, user: number) {
  const x = z
    .object({
      expected: z.enum(["received", "ready", "dispatched"]),
      status: z.enum(["ready", "dispatched", "delivered", "cancelled"]),
      reason: z.string().trim().max(500).optional(),
    })
    .parse(input);
  return db.transaction(() => {
    const o = detail(db, id);
    if (!o) throw Error("Pedido no encontrado");
    const next: Record<string, string> = {
      received: "ready",
      ready: "dispatched",
      dispatched: "delivered",
    };
    if (
      o.status !== x.expected ||
      !(x.status === next[o.status] || x.status === "cancelled")
    )
      throw Error("El pedido cambió o la transición no es válida");
    if (x.status === "cancelled" && !x.reason)
      throw Error("Indica el motivo de cancelación");
    const field = {
      ready: "ready_at",
      dispatched: "dispatched_at",
      delivered: "delivered_at",
      cancelled: "cancelled_at",
    }[x.status];
    const time = now();
    db.prepare(
      `UPDATE orders SET status=?,${field}=?,cancel_reason=? WHERE id=?`,
    ).run(x.status, time, x.reason || null, id);
    db.prepare(
      "INSERT INTO order_status_history(order_id,status,at,user_id,reason) VALUES(?,?,?,?,?)",
    ).run(id, x.status, time, user, x.reason || null);
    return detail(db, id);
  })();
}
