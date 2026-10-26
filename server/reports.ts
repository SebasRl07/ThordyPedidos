import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AppError } from "./errors.ts";
import type { OrderRow, OrderItem } from "../shared/domain.ts";
import ExcelJS from "exceljs";
import { type DB, loadDetails, durations, localDate } from "./db.ts";
export function range(query: any) {
  const from = query.from || localDate(new Date().toISOString()),
    to = query.to || from;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
    from > to ||
    !Number.isFinite(Date.parse(from)) ||
    !Number.isFinite(Date.parse(to)) ||
    Date.parse(to) - Date.parse(from) > 366 * 86400000
  )
    throw new AppError("Rango inválido (máximo 366 días)");
  return {
    from,
    to,
    start: from + "T00:00:00-05:00",
    end: to + "T23:59:59.999-05:00",
  };
}
export function report(db: DB, q: any, includeOrders = false) {
  return db.transaction(() => reportSnapshot(db, q, includeOrders))();
}
function reportSnapshot(db: DB, q: any, includeOrders: boolean) {
  const r = range(q);
  const start = new Date(r.start).toISOString(),
    end = new Date(r.end).toISOString();
  const matches = (o: OrderRow) =>
    (!q.status || o.status === q.status) &&
    (!q.search ||
      o.customer
        .toLocaleLowerCase()
        .includes(String(q.search).toLocaleLowerCase()) ||
      String(o.id) === String(q.search));
  const created = (
    db
      .prepare(
        "SELECT * FROM orders WHERE created_at BETWEEN ? AND ? ORDER BY id",
      )
      .all(start, end) as OrderRow[]
  ).filter(matches);
  const delivered = (
    db
      .prepare(
        "SELECT * FROM orders WHERE status='delivered' AND delivered_at BETWEEN ? AND ?",
      )
      .all(start, end) as OrderRow[]
  ).filter(matches);
  const totals = delivered.reduce((s, o) => s + o.total, 0);
  const products: Record<string, any> = {},
    channels: Record<string, number> = {},
    payments: Record<string, number> = {};
  for (const o of delivered) {
    channels[o.channel] = (channels[o.channel] || 0) + o.total;
    payments[o.payment] = (payments[o.payment] || 0) + o.total;
  }
  const soldItems = db
    .prepare(
      "SELECT * FROM order_items WHERE order_id IN (SELECT value FROM json_each(?))",
    )
    .all(JSON.stringify(delivered.map((o) => o.id))) as OrderItem[];
  for (const i of soldItems) {
    const key = String(i.product_id);
    products[key] ??= { name: i.name, quantity: 0, sales: 0 };
    products[key].quantity += i.quantity;
    products[key].sales += i.quantity * i.price;
  }
  const daily: Record<string, any> = {};
  for (
    let t = Date.parse(r.from + "T12:00:00Z");
    t <= Date.parse(r.to + "T12:00:00Z");
    t += 86400000
  ) {
    const date = new Date(t).toISOString().slice(0, 10);
    daily[date] = { date, orders: 0, sales: 0 };
  }
  for (const o of created) daily[localDate(o.created_at)].orders++;
  for (const o of delivered) daily[localDate(o.delivered_at!)].sales += o.total;
  const times = delivered.map((o) => ({ id: o.id, ...durations(o) }));
  const average = (key: string) => {
    const a = times.map((t: any) => t[key]).filter((x: any) => x !== null);
    return a.length
      ? a.reduce((s: number, x: number) => s + x, 0) / a.length
      : null;
  };
  const activity = new Set([
    ...created.map((o) => localDate(o.created_at)),
    ...delivered.map((o) => localDate(o.delivered_at!)),
  ]);
  const ranked = Object.values(products).sort(
    (a, b) => b.quantity - a.quantity,
  );
  const units = ranked.reduce((s, p) => s + p.quantity, 0);
  return {
    ...r,
    received: created.length,
    delivered: delivered.length,
    cancelled: created.filter((o) => o.status === "cancelled").length,
    pending: created.filter(
      (o) => !["delivered", "cancelled"].includes(o.status),
    ).length,
    sales: totals,
    ticket: delivered.length ? totals / delivered.length : 0,
    averageDaily: created.length / Object.keys(daily).length,
    averageOperating: activity.size ? created.length / activity.size : 0,
    products: ranked.map((p) => ({
      ...p,
      share: units ? (p.quantity / units) * 100 : 0,
    })),
    channels,
    payments,
    daily: Object.values(daily),
    times,
    averages: {
      preparation: average("preparation"),
      waiting: average("waiting"),
      delivery: average("delivery"),
      total: average("total"),
    },
    fastest:
      [...times].sort((a, b) => (a.total || 0) - (b.total || 0))[0] || null,
    slowest:
      [...times].sort((a, b) => (b.total || 0) - (a.total || 0))[0] || null,
    orders: includeOrders
      ? loadDetails(
          db,
          created.map((o) => o.id),
        )
      : [],
  };
}
export async function workbook(db: DB, q: any) {
  const r = report(db, q, true);
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Pedidos");
  sheet.addRow([
    "Pedido",
    "Fecha Colombia",
    "Cliente",
    "Teléfono",
    "Dirección",
    "Barrio",
    "Canal",
    "Estado",
    "Recepción",
    "Listo",
    "Despacho",
    "Entrega",
    "Preparación min",
    "Espera min",
    "Domicilio min",
    "Total min",
    "Subtotal COP",
    "Descuento COP",
    "Domicilio COP",
    "Total COP",
    "Pago",
    "Observaciones",
  ]);
  const time = (v: string | null) =>
    v
      ? new Date(v).toLocaleString("es-CO", { timeZone: "America/Bogota" })
      : "";
  const items = book.addWorksheet("Productos vendidos");
  items.addRow([
    "Pedido",
    "Fecha Colombia",
    "Producto",
    "Cantidad",
    "Precio unitario COP",
    "Subtotal COP",
  ]);
  for (const o of r.orders) {
    const d = durations(o);
    sheet.addRow([
      o.id,
      localDate(o.created_at),
      o.customer,
      o.phone,
      o.address,
      o.neighborhood,
      o.channel,
      o.status,
      time(o.created_at),
      time(o.ready_at),
      time(o.dispatched_at),
      time(o.delivered_at),
      d.preparation,
      d.waiting,
      d.delivery,
      d.total,
      o.subtotal,
      o.discount,
      o.delivery,
      o.total,
      o.payment,
      o.notes,
    ]);
    for (const i of o.items)
      items.addRow([
        o.id,
        localDate(o.created_at),
        i.name,
        i.quantity,
        i.price,
        i.quantity * i.price,
      ]);
  }
  const summary = book.addWorksheet("Resumen");
  summary.addRows([
    ["Indicador", "Valor"],
    ["Criterio pedidos", "Fecha de creación; incluye cancelados"],
    ["Criterio ventas", "Fecha de entrega; solo entregados"],
    ["Desde", r.from],
    ["Hasta", r.to],
    ["Recibidos", r.received],
    ["Entregados en período", r.delivered],
    ["Cancelados creados en período", r.cancelled],
    ["Ventas COP", r.sales],
    ["Ticket promedio COP", r.ticket],
    ["Más vendido", r.products[0]?.name || "Sin ventas"],
    ...Object.entries(r.averages).map(([k, v]) => [k + " (min)", v]),
  ]);
  // Presentation only: retain the orders/items sheets and the exact report values.
  summary.insertRows(1, [[], [], [], [], [], []]);
  const logo = book.addImage({
    filename: fileURLToPath(
      new URL(
        "../public/brand/thordy-logotipo-exportacion.png",
        import.meta.url,
      ),
    ),
    extension: "png",
  });
  const logoBytes = readFileSync(
    new URL("../public/brand/thordy-logotipo-exportacion.png", import.meta.url),
  );
  const logoAspect = logoBytes.readUInt32BE(20) / logoBytes.readUInt32BE(16);
  summary.addImage(logo, {
    tl: { col: 0, row: 0 },
    ext: { width: 220, height: 220 * logoAspect },
  });
  for (let row = 1; row <= 6; row++) {
    summary.getRow(row).height = 20;
    for (let column = 1; column <= 2; column++)
      summary.getCell(row, column).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFDF2E3" },
      };
  }
  for (const s of book.worksheets) {
    const header = s.name === "Resumen" ? 7 : 1;
    s.getRow(header).font = {
      name: "Montserrat",
      bold: true,
      color: { argb: "FFFDF2E3" },
    };
    s.getRow(header).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF6A0B07" },
    };
    s.views = [{ state: "frozen", ySplit: header }];
    s.autoFilter = {
      from: { row: header, column: 1 },
      to: { row: header, column: s.columnCount },
    };
    s.columns.forEach((c) => {
      c.width = 23;
    });
  }
  for (const c of [17, 18, 19, 20]) sheet.getColumn(c).numFmt = '"$" #,##0';
  for (const c of [5, 6]) items.getColumn(c).numFmt = '"$" #,##0';
  return book;
}
