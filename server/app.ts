import { listOrders } from "./orderQueries.ts";
import { AppError } from "./errors.ts";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import staticFiles from "@fastify/static";
import { Server } from "socket.io";
import { randomBytes, createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { openDB, hash, verify, now, detail, localDate } from "./db.ts";
import { createOrder, transition, deleteOrder } from "./orders.ts";
import { report, range, workbook } from "./reports.ts";
import { backup } from "./backup.ts";
import { PrintService, SimulatedAdapter } from "./printing.ts";
import { isPrivateAddress } from "./network.ts";
export async function buildApp(
  path = process.env.DB_PATH || "data/thordy.sqlite",
) {
  const db = openDB(path),
    printer = new PrintService(db, new SimulatedAdapter()),
    app = Fastify({ logger: !process.env.TEST });
  await app.register(cookie);
  const io = new Server(app.server, { serveClient: false });
  const digest = (s: string) => createHash("sha256").update(s).digest("hex");
  function session(token: string | undefined) {
    if (!token) return null;
    return db
      .prepare(
        "SELECT u.id,u.username,u.role FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=? AND s.expires>? AND u.active=1",
      )
      .get(digest(token), Date.now()) as any;
  }
  io.use((socket, next) => {
    const cookies = app.parseCookie(socket.request.headers.cookie || "");
    if (isPrivateAddress(socket.handshake.address) && session(cookies.session))
      next();
    else next(Error("No autorizado"));
  });
  const attempts = new Map<string, { count: number; until: number }>();
  app.addHook("onRequest", async (req, reply) => {
    if (!isPrivateAddress(req.ip))
      return reply
        .code(403)
        .send({ error: "Acceso permitido solo desde la red local" });
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("X-Frame-Options", "DENY")
      .header("Referrer-Policy", "same-origin");
    if (!req.url.startsWith("/api/")) return;
    reply.header("Cache-Control", "no-store");
    if (!["GET", "HEAD"].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin && origin !== `${req.protocol}://${req.headers.host}`)
        return reply.code(403).send({ error: "Origen no autorizado" });
      if (req.headers["x-thordy-request"] !== "1")
        return reply.code(403).send({ error: "Solicitud no autorizada" });
    }
    if (req.url === "/api/login" || req.url === "/api/health") return;
    const user = session(req.cookies.session);
    if (!user) return reply.code(401).send({ error: "Inicia sesión" });
    (req as any).user = user;
    const operatorRoutes =
      (req.method === "GET" &&
        /^\/api\/(me|products|settings|orders)(\?|\/|$)/.test(req.url)) ||
      (req.method === "POST" &&
        (/^\/api\/orders($|\/\d+\/(status|print)$)/.test(req.url) ||
          req.url === "/api/logout"));
    if (user.role !== "admin" && !operatorRoutes)
      return reply.code(403).send({ error: "Solo administradores" });
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(400).send({ error: "Revisa los campos ingresados" });
    if (error instanceof AppError)
      return reply.code(error.statusCode).send({ error: error.message });
    const err = error as Error & { statusCode?: number; code?: string };
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE")
      return reply.code(409).send({ error: "El registro ya existe" });
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500)
      return reply.code(err.statusCode).send({ error: err.message });
    app.log.error(error);
    return reply.code(500).send({
      error:
        "No se pudo completar la operación. Consulta el registro del servidor.",
    });
  });
  app.get("/api/health", () => ({ ok: true }));
  app.post("/api/login", async (req, reply) => {
    const ip = req.ip;
    let rate = attempts.get(ip);
    if (!rate || rate.until < Date.now()) {
      rate = { count: 0, until: Date.now() + 900000 };
      attempts.set(ip, rate);
    }
    if (rate.count >= 10)
      return reply
        .code(429)
        .send({ error: "Demasiados intentos. Espera 15 minutos." });
    const x = z
      .object({ username: z.string().max(100), password: z.string().max(256) })
      .parse(req.body);
    const user = db
      .prepare("SELECT * FROM users WHERE username=? AND active=1")
      .get(x.username) as any;
    rate.count++;
    if (!user || !verify(x.password, user.password))
      return reply.code(401).send({ error: "Credenciales incorrectas" });
    attempts.delete(ip);
    const token = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      digest(token),
      user.id,
      Date.now() + 12 * 3600000,
    );
    reply.setCookie("session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.COOKIE_SECURE === "true",
      path: "/",
      maxAge: 43200,
    });
    return { id: user.id, username: user.username, role: user.role };
  });
  app.get("/api/me", (req) => (req as any).user);
  app.post("/api/logout", async (req, reply) => {
    const user = (req as any).user;
    db.prepare("DELETE FROM sessions WHERE token=?").run(
      digest(req.cookies.session || ""),
    );
    for (const socket of io.sockets.sockets.values()) {
      const c = app.parseCookie(socket.request.headers.cookie || "");
      if (!session(c.session)) socket.disconnect(true);
    }
    reply.clearCookie("session", { path: "/" });
    return { ok: true, user: user.id };
  });
  app.get("/api/products", () =>
    db.prepare("SELECT * FROM products ORDER BY name").all(),
  );
  const productSchema = z.object({
    name: z.string().trim().min(1).max(120),
    price: z.number().int().min(0).max(10000000),
    category: z.string().max(100).default(""),
    presentation: z.string().max(100).default(""),
    active: z.boolean().default(true),
    sold_out: z.boolean().default(false),
  });
  for (const method of ["POST", "PUT"] as const)
    app.route({
      method,
      url: method === "POST" ? "/api/products" : "/api/products/:id",
      handler: async (req) => {
        const p = productSchema.parse(req.body);
        db.transaction(() => {
          if (p.category)
            db.prepare(
              "INSERT OR IGNORE INTO product_categories(name) VALUES(?)",
            ).run(p.category);
          if (method === "POST")
            db.prepare(
              "INSERT INTO products(name,price,category,presentation,active,sold_out) VALUES(?,?,?,?,?,?)",
            ).run(
              p.name,
              p.price,
              p.category,
              p.presentation,
              +p.active,
              +p.sold_out,
            );
          else
            db.prepare(
              "UPDATE products SET name=?,price=?,category=?,presentation=?,active=?,sold_out=? WHERE id=?",
            ).run(
              p.name,
              p.price,
              p.category,
              p.presentation,
              +p.active,
              +p.sold_out,
              Number((req.params as any).id),
            );
          db.prepare("INSERT INTO audit(at,user_id,action) VALUES(?,?,?)").run(
            now(),
            (req as any).user.id,
            "Catálogo actualizado",
          );
        })();
        io.emit("changed", { resource: "products" });
        return { ok: true };
      },
    });
  app.get("/api/orders", (req) => listOrders(db, req.query, (req as any).user));
  app.post("/api/orders", async (req) => {
    const o = createOrder(db, req.body, (req as any).user.id);
    const settings = JSON.parse(
      (
        db
          .prepare("SELECT value FROM app_settings WHERE key='operation'")
          .get() as any
      ).value,
    );
    if (settings.autoPrint) {
      printer.enqueue(o.id, "kitchen", "auto-kitchen-" + o.id);
      await printer.process();
    }
    io.emit("changed", { resource: "orders", id: o.id, action: "updated" });
    return o;
  });
  app.post("/api/orders/:id/status", (req) => {
    const o = transition(
      db,
      Number((req.params as any).id),
      req.body,
      (req as any).user.id,
    );
    io.emit("changed", { resource: "orders", id: o.id, action: "updated" });
    return o;
  });
  app.get("/api/orders/:id", (req, reply) => {
    const o = detail(db, Number((req.params as { id: string }).id));
    if (!o) return reply.code(404).send({ error: "Pedido no encontrado" });
    if (
      (req as any).user.role !== "admin" &&
      ["cancelled", "delivered"].includes(o.status) &&
      (!o.delivered_at || localDate(o.delivered_at) !== localDate(now()))
    )
      return reply
        .code(403)
        .send({ error: "Solo información operativa actual" });
    return o;
  });
  app.delete("/api/orders/:id", (req) => {
    const result = deleteOrder(
      db,
      Number((req.params as { id: string }).id),
      req.body,
      (req as any).user,
    );
    io.emit("changed", {
      resource: "orders",
      action: "deleted",
      id: result.id,
    });
    return result;
  });
  app.get("/api/deletions", () =>
    db
      .prepare(
        "SELECT order_id,deleted_at,admin_username,original_status FROM order_deletions ORDER BY deleted_at DESC LIMIT 100",
      )
      .all(),
  );
  app.get("/api/reports", (req) => {
    const r = report(db, req.query);
    const { orders, ...rest } = r;
    return rest;
  });
  app.get("/api/export", async (req, reply) => {
    const r = range(req.query),
      book = await workbook(db, req.query);
    reply
      .header(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      )
      .header(
        "Content-Disposition",
        `attachment; filename="THORDY_Pedidos_${r.from}.xlsx"`,
      );
    return reply.send(Buffer.from(await book.xlsx.writeBuffer()));
  });
  app.get("/api/settings", () =>
    JSON.parse(
      (
        db
          .prepare("SELECT value FROM app_settings WHERE key='operation'")
          .get() as any
      ).value,
    ),
  );
  const settingsSchema = z.object({
    warningMinutes: z.number().int().min(1).max(240),
    retentionDays: z.number().int().min(1).max(3650),
    backupHour: z.number().int().min(0).max(23),
    paperWidth: z.union([z.literal(58), z.literal(80)]),
    copies: z.number().int().min(1).max(5),
    autoPrint: z.boolean(),
    connection: z.literal("simulated"),
    printer: z.string().max(120),
  });
  app.put("/api/settings", (req) => {
    const s = settingsSchema.parse(req.body);
    db.prepare("UPDATE app_settings SET value=? WHERE key='operation'").run(
      JSON.stringify(s),
    );
    io.emit("changed", { resource: "settings" });
    return s;
  });
  app.get("/api/users", () =>
    db.prepare("SELECT id,username,role,active FROM users").all(),
  );
  app.post("/api/users", (req) => {
    const x = z
      .object({
        username: z.string().trim().min(3).max(100),
        password: z.string().min(12).max(256),
        role: z.enum(["admin", "operator"]),
      })
      .parse(req.body);
    db.prepare("INSERT INTO users(username,password,role) VALUES(?,?,?)").run(
      x.username,
      hash(x.password),
      x.role,
    );
    return { ok: true };
  });
  app.post("/api/users/:id/disable", (req) => {
    const id = Number((req.params as any).id);
    if (id === (req as any).user.id)
      throw new AppError("No puedes desactivar tu cuenta");
    db.prepare("UPDATE users SET active=0 WHERE id=?").run(id);
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
    return { ok: true };
  });
  app.get("/api/backups", () =>
    db.prepare("SELECT * FROM backup_history ORDER BY id DESC LIMIT 100").all(),
  );
  app.post("/api/backups", () => {
    const s = JSON.parse(
      (
        db
          .prepare("SELECT value FROM app_settings WHERE key='operation'")
          .get() as any
      ).value,
    );
    return backup(
      db,
      process.env.BACKUP_DIR || "data/backups",
      s.retentionDays,
    );
  });
  app.get("/api/print-jobs", () =>
    db.prepare("SELECT * FROM print_jobs ORDER BY id DESC LIMIT 100").all(),
  );
  app.post("/api/print-jobs/retry", async () => {
    await printer.process();
    return { ok: true };
  });
  app.post("/api/orders/:id/print", async (req) => {
    const id = Number((req.params as any).id);
    if (!detail(db, id)) throw new AppError("Pedido no encontrado");
    const x = z
      .object({
        kind: z.enum(["kitchen", "receipt"]),
        request_key: z.string().uuid(),
      })
      .parse(req.body);
    const job = printer.enqueue(id, x.kind, x.request_key);
    await printer.process();
    return {
      job_id: job.id,
      simulated: true,
      message:
        "Trabajo registrado por adaptador simulado; no se envió a hardware.",
    };
  });
  const dist = resolve("dist");
  if (existsSync(dist)) {
    await app.register(staticFiles, { root: dist });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/")
        ? reply.code(404).send({ error: "No encontrado" })
        : reply.sendFile("index.html"),
    );
  }
  let backing = false;
  const timer = setInterval(async () => {
    if (backing) return;
    const date = now(),
      s = JSON.parse(
        (
          db
            .prepare("SELECT value FROM app_settings WHERE key='operation'")
            .get() as any
        ).value,
      );
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/Bogota",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(new Date()),
    );
    const last = db
      .prepare(
        "SELECT at FROM backup_history WHERE status='ok' ORDER BY id DESC LIMIT 1",
      )
      .get() as any;
    if (
      (hour >= s.backupHour &&
        (!last || localDate(last.at) !== localDate(date))) ||
      (last && Date.parse(date) - Date.parse(last.at) > 86400000)
    ) {
      backing = true;
      try {
        await backup(
          db,
          process.env.BACKUP_DIR || "data/backups",
          s.retentionDays,
        );
      } catch (e) {
        app.log.error(e);
      } finally {
        backing = false;
      }
    }
  }, 60000);
  timer.unref();
  app.addHook("onClose", async () => {
    clearInterval(timer);
    io.disconnectSockets(true);
    io.close();
    db.close();
  });
  return { app, db, io };
}
