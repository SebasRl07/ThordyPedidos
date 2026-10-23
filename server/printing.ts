import { type DB, detail, now } from "./db.ts";
export interface PrintAdapter {
  readonly name: string;
  send(
    text: string,
    options: { paperWidth: 58 | 80; copies: number },
  ): Promise<void>;
}
export class SimulatedAdapter implements PrintAdapter {
  readonly name = "simulated";
  jobs: string[] = [];
  async send(text: string) {
    this.jobs.push(text);
    if (this.jobs.length > 100) this.jobs.shift();
  }
}
export function printText(order: any, kind: "kitchen" | "receipt") {
  const lines = [
    "THORDY AL BARRIL",
    kind === "kitchen" ? "COMANDA DE COCINA" : "RECIBO DE PEDIDO",
    `Pedido #${order.id}`,
    new Date(order.created_at).toLocaleString("es-CO", {
      timeZone: "America/Bogota",
    }),
    order.customer,
    ...order.items.map(
      (i: any) =>
        `${i.quantity} x ${i.name}${kind === "receipt" ? `  $${i.price * i.quantity}` : ""}`,
    ),
    `Observaciones: ${order.notes || "Sin observaciones"}`,
  ];
  if (kind === "receipt")
    lines.push(
      `Subtotal: $${order.subtotal}`,
      `Descuento: $${order.discount}`,
      `Domicilio: $${order.delivery}`,
      `TOTAL: $${order.total}`,
      `Pago: ${order.payment}`,
    );
  return lines.join("\n");
}
// Un adaptador ESC/POS futuro implementa send y controla codificación, driver y transporte.
export class PrintService {
  private working = false;
  constructor(
    private db: DB,
    private adapter: PrintAdapter,
  ) {}
  enqueue(orderId: number, kind: "kitchen" | "receipt", key: string) {
    if (!detail(this.db, orderId)) throw Error("Pedido no encontrado");
    this.db
      .prepare(
        "INSERT OR IGNORE INTO print_jobs(order_id,kind,request_key,status,attempts,at) VALUES(?,?,?,'pending',0,?)",
      )
      .run(orderId, kind, key, now());
    return this.db
      .prepare("SELECT * FROM print_jobs WHERE request_key=?")
      .get(key) as any;
  }
  async process() {
    if (this.working) return;
    this.working = true;
    try {
      for (const job of this.db
        .prepare(
          "SELECT * FROM print_jobs WHERE status IN ('pending','retry') AND attempts<3 ORDER BY id",
        )
        .all() as any[]) {
        this.db
          .prepare(
            "UPDATE print_jobs SET status='processing',attempts=attempts+1 WHERE id=?",
          )
          .run(job.id);
        try {
          const settings = JSON.parse(
            (
              this.db
                .prepare("SELECT value FROM app_settings WHERE key='operation'")
                .get() as any
            ).value,
          );
          await this.adapter.send(
            printText(detail(this.db, job.order_id), job.kind),
            settings,
          );
          this.db
            .prepare("UPDATE print_jobs SET status=? WHERE id=?")
            .run(
              this.adapter.name === "simulated" ? "simulated" : "completed",
              job.id,
            );
        } catch {
          this.db
            .prepare("UPDATE print_jobs SET status=? WHERE id=?")
            .run(job.attempts + 1 >= 3 ? "failed" : "retry", job.id);
        }
      }
    } finally {
      this.working = false;
    }
  }
}
