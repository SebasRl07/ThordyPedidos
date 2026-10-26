import { z } from "zod";
import type { Actor } from "../shared/domain.ts";
import { type DB, loadDetails, localDate, now } from "./db.ts";
import { range } from "./reports.ts";
const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  active: z.enum(["0", "1"]).optional(),
  search: z.string().max(100).optional(),
  status: z
    .enum(["received", "ready", "dispatched", "delivered", "cancelled"])
    .optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
export function listOrders(db: DB, input: unknown, actor: Actor) {
  const q = querySchema.parse(input);
  return db.transaction(() => {
    const conditions: string[] = [],
      args: (string | number)[] = [];
    const active = q.active === "1" || actor.role !== "admin";
    if (active) {
      conditions.push(
        "(status IN ('received','ready','dispatched') OR (status='delivered' AND delivered_at>=?))",
      );
      args.push(new Date(localDate(now()) + "T00:00:00-05:00").toISOString());
    }
    if (q.search) {
      conditions.push("(customer LIKE ? OR CAST(id AS TEXT)=?)");
      args.push("%" + q.search + "%", q.search);
    }
    if (q.status) {
      conditions.push("status=?");
      args.push(q.status);
    }
    if (q.from || q.to) {
      const dates = range(q);
      conditions.push("created_at BETWEEN ? AND ?");
      args.push(
        new Date(dates.start).toISOString(),
        new Date(dates.end).toISOString(),
      );
    }
    const where = conditions.length ? " WHERE " + conditions.join(" AND ") : "";
    const total = (
      db.prepare("SELECT count(*) n FROM orders" + where).get(...args) as {
        n: number;
      }
    ).n;
    const rows = db
      .prepare(
        "SELECT id FROM orders" +
          where +
          (active ? " ORDER BY id ASC" : " ORDER BY id DESC LIMIT 50 OFFSET ?"),
      )
      .all(...args, ...(active ? [] : [(q.page - 1) * 50])) as { id: number }[];
    return {
      total,
      page: q.page,
      rows: loadDetails(
        db,
        rows.map((row) => row.id),
      ),
    };
  })();
}
