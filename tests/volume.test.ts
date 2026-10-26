import { test } from "node:test";
import assert from "node:assert/strict";
import { createOrder, transition } from "../server/orders.ts";
import { loadDetails, localDate } from "../server/db.ts";
import { report } from "../server/reports.ts";
import { fixture, input } from "./helpers.ts";
test(
  "3000 pedidos: paginación, informes, detalles por lotes e índices",
  { timeout: 20000 },
  () => {
    const f = fixture();
    try {
      const started = performance.now();
      f.db.transaction(() => {
        for (let n = 0; n < 3000; n++) {
          const o = createOrder(f.db, input(), 1);
          if (n < 300) {
            for (const [expected, status] of [
              ["received", "ready"],
              ["ready", "dispatched"],
              ["dispatched", "delivered"],
            ])
              transition(f.db, o.id, { expected, status }, 1);
          }
        }
      })();
      const ids = (
        f.db
          .prepare("SELECT id FROM orders ORDER BY id DESC LIMIT 50 OFFSET 50")
          .all() as { id: number }[]
      ).map((o) => o.id);
      const rows = loadDetails(f.db, ids);
      assert.equal(rows.length, 50);
      assert.equal(rows[0].id, 2950);
      assert.equal(rows.at(-1)!.id, 2901);
      const day = localDate(new Date().toISOString());
      const r = report(f.db, { from: day, to: day });
      assert.equal(r.received, 3000);
      assert.equal(r.delivered, 300);
      assert.equal(r.sales, 34000 * 300);
      assert.equal(r.products[0].quantity, 600);
      assert.equal(r.orders.length, 0);
      const plan = f.db
        .prepare(
          "EXPLAIN QUERY PLAN SELECT * FROM order_items WHERE order_id=?",
        )
        .all(1) as { detail: string }[];
      assert.ok(plan.some((p) => p.detail.includes("order_items_order")));
      console.log(
        `Volumen 3000: ${Math.round(performance.now() - started)} ms (métrica informativa, sin umbral de velocidad dependiente de hardware)`,
      );
    } finally {
      f.close();
    }
  },
);
