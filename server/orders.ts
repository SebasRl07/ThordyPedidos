import { AppError } from "./errors.ts";
import type { Actor, OrderStatus } from "../shared/domain.ts";
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
    if (
      db
        .prepare("SELECT 1 FROM order_deletions WHERE request_key=?")
        .get(x.request_key)
    )
      throw new AppError(
        "Este envío corresponde a un pedido eliminado. Crea un pedido nuevo.",
        409,
      );
    const old = db
      .prepare("SELECT id FROM orders WHERE request_key=?")
      .get(x.request_key) as any;
    if (old) return detail(db, old.id)!;
    const items = x.items.map((i) => {
      const p = db
        .prepare(
          "SELECT * FROM products WHERE id=? AND active=1 AND sold_out=0",
        )
        .get(i.product_id) as any;
      if (!p) throw new AppError("Producto no disponible");
      return { ...i, name: p.name, price: p.price };
    });
    const subtotal = items.reduce((a, i) => a + i.price * i.quantity, 0);
    if (
      !Number.isSafeInteger(subtotal) ||
      subtotal > 100000000 ||
      x.discount > subtotal
    )
      throw new AppError("Valores fuera de rango");
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
    return detail(db, id)!;
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
    if (!o) throw new AppError("Pedido no encontrado", 404);
    const next: Record<string, string> = {
      received: "ready",
      ready: "dispatched",
      dispatched: "delivered",
    };
    if (
      o.status !== x.expected ||
      !(x.status === next[o.status] || x.status === "cancelled")
    )
      throw new AppError("El pedido cambió o la transición no es válida");
    if (x.status === "cancelled" && !x.reason)
      throw new AppError("Indica el motivo de cancelación");
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
    return detail(db, id)!;
  })();
}

const deletionSchema = z.object({
  confirmation: z.string(),
  acknowledged: z.literal(true),
  expected_revision: z.number().int().positive(),
});
export function deleteOrder(db: DB, id: number, input: unknown, actor: Actor) {
  if (actor.role !== "admin") throw new AppError("Solo administradores", 403);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new AppError("Identificador inválido");
  const x = deletionSchema.parse(input);
  if (x.confirmation !== String(id))
    throw new AppError("Escribe el número exacto del pedido");
  return db
    .transaction(() => {
      const o = detail(db, id);
      if (!o) throw new AppError("El pedido ya no existe", 404);
      if (o.revision !== x.expected_revision)
        throw new AppError(
          "El pedido cambió. Revisa su estado actualizado antes de eliminar.",
          409,
        );
      if (
        db
          .prepare(
            "SELECT 1 FROM print_jobs WHERE order_id=? AND status='processing'",
          )
          .get(id)
      )
        throw new AppError(
          "Hay una impresión en curso. Espera a que termine y vuelve a intentar.",
          409,
        );
      db.prepare(
        "INSERT INTO order_deletions(order_id,request_key,deleted_at,admin_id,admin_username,original_status) VALUES(?,?,?,?,?,?)",
      ).run(id, o.request_key, now(), actor.id, actor.username, o.status);
      db.prepare("DELETE FROM print_jobs WHERE order_id=?").run(id);
      db.prepare("DELETE FROM order_status_history WHERE order_id=?").run(id);
      db.prepare("DELETE FROM order_items WHERE order_id=?").run(id);
      db.prepare("DELETE FROM orders WHERE id=?").run(id);
      return { id, deleted: true };
    })
    .immediate();
}
