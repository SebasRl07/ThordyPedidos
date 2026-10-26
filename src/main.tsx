import React, {
  Suspense,
  lazy,
  useEffect,
  useState,
  useRef,
  useMemo,
} from "react";
import { createRoot } from "react-dom/client";
import { api, ApiError } from "./api";
import { orderLabels } from "../shared/domain";
import type { Order, ChangeEvent, Actor } from "../shared/domain";
import { Icon } from "./components/Icon";
import { BrandLogo } from "./components/BrandLogo";
import { Dialog, CloseButton } from "./components/Dialog";
import { DeleteOrderDialog } from "./components/DeleteOrderDialog";
import { useRealtime, useDebounced } from "./hooks/useRealtime";
import "@fontsource/montserrat/latin-400.css";
import "@fontsource/montserrat/latin-500.css";
import "@fontsource/montserrat/latin-600.css";
import "@fontsource/montserrat/latin-700.css";
import "@fontsource/luckiest-guy/latin-400.css";
import "./theme.css";
const ReportCharts = lazy(() => import("./ReportCharts"));
import "./style.css";
const labels: Record<string, string> = orderLabels;
const money = (v: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(v);
const date = (v: string) =>
  v ? new Date(v).toLocaleString("es-CO", { timeZone: "America/Bogota" }) : "—";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
function App() {
  const [user, U] = useState<Actor | null>(null),
    [tab, T] = useState("Tablero"),
    [error, E] = useState(""),
    [connected, C] = useState(false),
    [products, P] = useState<any[]>([]),
    [orders, O] = useState<Order[]>([]),
    [total, Total] = useState(0),
    [page, Page] = useState(1),
    [search, Search] = useState(""),
    [status, Status] = useState(""),
    [from, F] = useState(today()),
    [to, To] = useState(today()),
    [report, R] = useState<any>(null),
    [settings, S] = useState<any>(null),
    [users, Users] = useState<any[]>([]),
    [backups, B] = useState<any[]>([]),
    [modal, M] = useState(false),
    [selected, Selected] = useState<Order | null>(null),
    [deleting, Deleting] = useState<Order | null>(null),
    [printKind, PrintKind] = useState<"kitchen" | "receipt">("receipt"),
    [editing, Editing] = useState<any>(null),
    [busy, Busy] = useState(false),
    [tick, Tick] = useState(0);
  const [draft, D] = useState<any>({
    customer: "",
    phone: "",
    address: "",
    neighborhood: "",
    channel: "WhatsApp",
    payment: "Efectivo",
    notes: "",
    discount: 0,
    delivery: 0,
    items: [],
  });
  const [key, K] = useState(() => cryptoKey());
  function cryptoKey() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const s = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
      "",
    );
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  }
  async function action(fn: () => Promise<void>) {
    Busy(true);
    E("");
    try {
      await fn();
    } catch (e: any) {
      E(e.message);
    } finally {
      Busy(false);
    }
  }
  const viewSequence = useRef(0),
    selectedRef = useRef(selected),
    deletingRef = useRef(deleting);
  selectedRef.current = selected;
  deletingRef.current = deleting;
  const debouncedSearch = useDebounced(search);
  async function refresh(
    reason: "view" | "orders" | "products" | "settings" | "all" = "view",
  ) {
    const sequence =
      reason === "products" || reason === "settings"
        ? viewSequence.current
        : ++viewSequence.current;
    try {
      if (
        reason === "orders" &&
        !["Tablero", "Historial", "Informes"].includes(tab)
      )
        return;
      if (reason === "products" || reason === "all") {
        P(await api("products"));
        if (reason === "products") return;
      }
      if (reason === "settings" || reason === "all") {
        S(await api("settings"));
        if (reason === "settings") return;
      }
      if (sequence !== viewSequence.current) return;
      if (tab === "Tablero" || tab === "Historial") {
        const query =
          tab === "Tablero"
            ? "active=1"
            : new URLSearchParams({
                search: debouncedSearch,
                status,
                page: String(page),
                from,
                to,
              }).toString();
        const result = await api<{ rows: Order[]; total: number }>(
          "orders?" + query,
        );
        if (sequence !== viewSequence.current) return;
        O(result.rows);
        Total(result.total);
        if (
          tab === "Historial" &&
          result.rows.length === 0 &&
          page > 1 &&
          result.total <= (page - 1) * 50
        )
          Page(Math.max(1, Math.ceil(result.total / 50)));
      } else if (tab === "Informes" && user?.role === "admin") {
        const result = await api(
          "reports?" + new URLSearchParams({ from, to }),
        );
        if (sequence === viewSequence.current) R(result);
      } else if (tab === "Catálogo") {
        const result = await api("products");
        if (sequence === viewSequence.current) P(result);
      } else if (tab === "Configuración" && user?.role === "admin") {
        const [s, u, b] = await Promise.all([
          api("settings"),
          api("users"),
          api("backups"),
        ]);
        if (sequence === viewSequence.current) {
          S(s);
          Users(u);
          B(b);
        }
      }
    } catch (e) {
      E(e instanceof Error ? e.message : "Error al actualizar");
    }
  }
  async function refreshSelected() {
    const id = selectedRef.current?.id;
    if (!id) return;
    try {
      const order = await api<Order>(`orders/${id}`);
      if (selectedRef.current?.id === id) Selected(order);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        if (selectedRef.current?.id === id) Selected(null);
        if (deletingRef.current?.id === id) Deleting(null);
      }
    }
  }
  async function syncChange(event: ChangeEvent) {
    if (event.resource === "orders") {
      if (event.action === "deleted") {
        O((rows) => rows.filter((row) => row.id !== event.id));
        if (selectedRef.current?.id === event.id) Selected(null);
        if (deletingRef.current?.id === event.id) Deleting(null);
      } else await refreshSelected();
      await refresh("orders");
    } else await refresh(event.resource);
  }
  useEffect(() => {
    api<Actor>("me")
      .then(U)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (user) {
      void refresh("all");
    }
    return () => {
      viewSequence.current++;
    };
  }, [user?.id]);
  useEffect(() => {
    if (user) void refresh();
    return () => {
      viewSequence.current++;
    };
  }, [user?.id, tab, page, debouncedSearch, status, from, to]);
  useRealtime(user?.id, syncChange, C, () => {
    void refresh("all");
    void refreshSelected();
  });
  useEffect(() => {
    const timer = setInterval(() => Tick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  const [visiblePerStatus, VisiblePerStatus] = useState<Record<string, number>>(
    { received: 20, ready: 20, dispatched: 20, delivered: 20 },
  );
  const grouped = useMemo(
    () =>
      orders.reduce<Record<string, Order[]>>(
        (groups, order) => {
          (groups[order.status] ??= []).push(order);
          return groups;
        },
        { received: [], ready: [], dispatched: [], delivered: [] },
      ),
    [orders],
  );
  if (!user)
    return (
      <div className="login-shell">
        <section className="login-identity" aria-label="THORDY AL BARRIL">
          <BrandLogo tone="beige" />
          <p className="eyebrow">MANIZALES · COLOMBIA</p>
          <div className="identity-rule" />
          <h2>
            Tradición en el sabor.
            <br />
            Confianza en cada pedido.
          </h2>
          <p>
            Tu centro de gestión gastronómica. Una operación conectada, con la
            identidad de nuestra cocina.
          </p>
        </section>
        <div className="login-area">
          <main className="login">
            <BrandLogo />
            <p className="login-context">PLATAFORMA DE GESTIÓN GASTRONÓMICA</p>
            <h1>Bienvenido a tu operación</h1>
            <p>Ingresa con tu usuario autorizado para comenzar.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                action(async () =>
                  U(await api("login", "POST", Object.fromEntries(f))),
                );
              }}
            >
              <label>
                Usuario
                <input name="username" autoComplete="username" required />
              </label>
              <label>
                Contraseña
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              <button disabled={busy}>Entrar al panel →</button>
            </form>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <small>
              Servidor local · Datos guardados en el computador principal
            </small>
          </main>
        </div>
      </div>
    );
  const subtotal = draft.items.reduce(
    (s: number, i: any) =>
      s +
      (products.find((p) => p.id === i.product_id)?.price || 0) * i.quantity,
    0,
  );
  const next: Record<string, string> = {
    received: "ready",
    ready: "dispatched",
    dispatched: "delivered",
  };
  const nextLabel: Record<string, string> = {
    received: "Marcar como listo",
    ready: "Salió a domicilio",
    dispatched: "Pedido entregado",
  };
  function change(o: any, newStatus: string) {
    const reason =
      newStatus === "cancelled" ? prompt("Motivo de cancelación") : undefined;
    if (newStatus === "cancelled" && !reason) return;
    action(async () => {
      await api(`orders/${o.id}/status`, "POST", {
        expected: o.status,
        status: newStatus,
        reason,
      });
      Selected(null);
      await refresh();
    });
  }
  function preset(value: string) {
    const d = new Date(today() + "T12:00:00Z");
    let start = today(),
      end = today();
    if (value === "Ayer") {
      d.setUTCDate(d.getUTCDate() - 1);
      start = end = d.toISOString().slice(0, 10);
    }
    if (value === "Semana") {
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      start = d.toISOString().slice(0, 10);
    }
    if (value === "Mes") start = today().slice(0, 8) + "01";
    F(start);
    To(end);
    Page(1);
  }
  return (
    <div className="app">
      <aside>
        <div className="sidebar-wide">
          <BrandLogo tone="beige" />
        </div>
        <div className="sidebar-compact">
          <BrandLogo kind="isotipo" tone="beige" />
          <p>GESTIÓN DE PEDIDOS</p>
        </div>
        <p className="muted">CENTRO DE OPERACIONES</p>
        <nav>
          {[
            "Tablero",
            ...(user.role === "admin"
              ? ["Historial", "Informes", "Catálogo", "Configuración"]
              : []),
          ].map((n, i) => (
            <button
              className={tab === n ? "nav active" : "nav"}
              onClick={() => {
                T(n);
                Page(1);
              }}
              key={n}
            >
              <Icon
                name={["board", "history", "reports", "catalog", "settings"][i]}
              />
              {n}
            </button>
          ))}
        </nav>
        <div className="account">
          <strong>{user.username}</strong>
          <small>{user.role === "admin" ? "Administrador" : "Operador"}</small>
          <button
            className="ghost"
            onClick={() =>
              action(async () => {
                await api("logout", "POST", {});
                U(null);
              })
            }
          >
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <div className="compact-heading">
              <BrandLogo kind="isotipo" decorative />
              <p className="eyebrow">
                CENTRO DE OPERACIONES / {tab.toUpperCase()}
              </p>
            </div>
            <h1>{tab === "Tablero" ? "Pedidos en marcha" : tab}</h1>
            <p className="muted">
              {today()} · Hora de Colombia ·{" "}
              {user.role === "admin" ? "Administración" : "Operación"}
            </p>
          </div>
          <button className="primary-action" onClick={() => M(true)}>
            <Icon name="plus" />
            Nuevo pedido
          </button>
        </header>
        <div
          className={"connection " + (connected ? "online" : "offline")}
          role="status"
        >
          ●{" "}
          {connected
            ? "Conectado al servidor local · Sincronización activa"
            : "Sin conexión en tiempo real. Comprueba la red local y reintenta."}
          {!connected && (
            <button className="ghost" onClick={() => location.reload()}>
              Reconectar
            </button>
          )}
        </div>
        {error && (
          <div role="alert" className="error">
            {error}
            <CloseButton onClick={() => E("")} />
          </div>
        )}
        {tab === "Tablero" && (
          <>
            <div className="stats board-summary">
              {["received", "ready", "dispatched"].map((s) => (
                <div className="stat" key={s}>
                  <small>{labels[s]}</small>
                  <strong>{grouped[s].length}</strong>
                  <span>Pedidos activos</span>
                </div>
              ))}
            </div>
            <div className="board">
              {["received", "ready", "dispatched", "delivered"].map((s) => (
                <section key={s}>
                  <h2>
                    <i className={s} /> {labels[s]}{" "}
                    <small>{grouped[s].length}</small>
                  </h2>
                  {grouped[s].slice(0, visiblePerStatus[s]).map((o) => (
                    <article
                      className={
                        o.status !== "delivered" &&
                        (Date.now() - Date.parse(o.created_at)) / 60000 >
                          settings?.warningMinutes
                          ? "order overdue"
                          : "order"
                      }
                      key={o.id}
                    >
                      <div className="spread">
                        <strong>#{String(o.id).padStart(4, "0")}</strong>
                        <span className={"badge " + s}>{labels[s]}</span>
                      </div>
                      <h3>{o.customer}</h3>
                      <small className="muted">
                        {date(o.created_at)} ·{" "}
                        {Math.floor(
                          (Date.now() - Date.parse(o.created_at)) / 60000,
                        )}{" "}
                        min
                      </small>
                      <ul>
                        {o.items.map((i: any) => (
                          <li key={i.id}>
                            <b>{i.quantity}×</b> {i.name}
                          </li>
                        ))}
                      </ul>
                      {o.notes && <p className="note">{o.notes}</p>}
                      <div className="spread">
                        <strong>{money(o.total)}</strong>
                        <button className="ghost" onClick={() => Selected(o)}>
                          Detalles
                        </button>
                      </div>
                      {next[s] && (
                        <button
                          disabled={busy || !connected}
                          className="wide"
                          onClick={() => change(o, next[s])}
                        >
                          {nextLabel[s]} →
                        </button>
                      )}
                    </article>
                  ))}
                  {grouped[s].length > visiblePerStatus[s] && (
                    <button
                      className="ghost wide"
                      onClick={() =>
                        VisiblePerStatus((v) => ({ ...v, [s]: v[s] + 20 }))
                      }
                    >
                      Mostrar más ({grouped[s].length - visiblePerStatus[s]})
                    </button>
                  )}
                  {!grouped[s].length && (
                    <div className="empty">
                      Sin pedidos {labels[s].toLowerCase()}
                      <small>Los nuevos pedidos aparecerán aquí</small>
                    </div>
                  )}
                </section>
              ))}
            </div>
          </>
        )}
        {(tab === "Historial" || tab === "Informes") && (
          <div className="filters">
            {["Hoy", "Ayer", "Semana", "Mes"].map((x) => (
              <button className="ghost" onClick={() => preset(x)} key={x}>
                {x}
              </button>
            ))}
            <label>
              Desde
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  F(e.target.value);
                  Page(1);
                }}
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  To(e.target.value);
                  Page(1);
                }}
              />
            </label>
            <a
              className="button"
              href={
                "/api/export?" +
                new URLSearchParams({
                  from,
                  to,
                  ...(tab === "Historial" ? { search, status } : {}),
                })
              }
            >
              ↓ Exportar Excel
            </a>
          </div>
        )}
        {tab === "Historial" && (
          <>
            <div className="filters">
              <input
                aria-label="Buscar pedido o cliente"
                placeholder="Buscar número o cliente…"
                value={search}
                onChange={(e) => {
                  Search(e.target.value);
                  Page(1);
                }}
              />
              <select
                aria-label="Estado"
                value={status}
                onChange={(e) => {
                  Status(e.target.value);
                  Page(1);
                }}
              >
                <option value="">Todos los estados</option>
                {Object.entries(labels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="table">
              <table>
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th>Recepción</th>
                    <th>Estado</th>
                    <th>Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td>#{o.id}</td>
                      <td>{o.customer}</td>
                      <td>{date(o.created_at)}</td>
                      <td>
                        <span className={"badge " + o.status}>
                          {labels[o.status]}
                        </span>
                      </td>
                      <td>{money(o.total)}</td>
                      <td>
                        <div className="row-actions">
                          <button className="ghost" onClick={() => Selected(o)}>
                            Ver
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Eliminar pedido #${o.id}`}
                            title="Eliminar pedido"
                            disabled={busy || !connected}
                            onClick={() => Deleting(o)}
                          >
                            <Icon name="trash" size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!orders.length && (
                <p className="empty">No hay pedidos en este rango.</p>
              )}
            </div>
            <div className="filters">
              <button
                className="ghost"
                disabled={page === 1}
                onClick={() => Page(page - 1)}
              >
                Anterior
              </button>
              <span>
                Página {page} · {total} pedidos
              </span>
              <button
                className="ghost"
                disabled={page * 50 >= total}
                onClick={() => Page(page + 1)}
              >
                Siguiente
              </button>
            </div>
          </>
        )}
        {tab === "Informes" && report && (
          <>
            <p className="note">
              Pedidos: fecha de creación. Ventas y tiempos: pedidos entregados
              en el período. Los cancelados no generan ventas. Días operativos:
              días con recepción o entrega.
            </p>
            <div className="stats">
              {[
                ["Recibidos", report.received],
                ["Entregados", report.delivered],
                ["Cancelados", report.cancelled],
                ["Pendientes", report.pending],
                ["Ventas efectivas", money(report.sales)],
                ["Ticket promedio", money(report.ticket)],
                ["Promedio diario", report.averageDaily.toFixed(1)],
                ["Por día operativo", report.averageOperating.toFixed(1)],
              ].map(([k, v]) => (
                <div className="stat" key={k}>
                  <small>{k}</small>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
            <Suspense fallback={<p>Cargando gráficos…</p>}>
              <ReportCharts report={report} />
            </Suspense>
            <div className="grid2">
              <div className="panel">
                <h2>Productos más vendidos</h2>
                {report.products.map((p: any) => (
                  <p className="spread" key={p.name}>
                    <span>
                      {p.name} · {p.quantity} uds · {p.share.toFixed(1)}%
                    </span>
                    <b>{money(p.sales)}</b>
                  </p>
                ))}
                {!report.products.length && <p>Sin ventas entregadas.</p>}
                <small>
                  Valores de productos antes de descuento y domicilio.
                </small>
              </div>
              <div className="panel">
                <h2>Tiempos operativos promedio</h2>
                {Object.entries(report.averages).map(([k, v]: any) => (
                  <p className="spread" key={k}>
                    <span>
                      {
                        (
                          {
                            preparation: "Preparación",
                            waiting: "Espera de despacho",
                            delivery: "Domicilio",
                            total: "Atención total",
                          } as Record<string, string>
                        )[k]
                      }
                    </span>
                    <b>{v === null ? "—" : v.toFixed(1) + " min"}</b>
                  </p>
                ))}
                <p>
                  Más rápido: {report.fastest ? "#" + report.fastest.id : "—"} ·
                  Más demorado: {report.slowest ? "#" + report.slowest.id : "—"}
                </p>
              </div>
              {["channels", "payments"].map((k) => (
                <div className="panel" key={k}>
                  <h2>
                    {k === "channels" ? "Ventas por canal" : "Ventas por pago"}
                  </h2>
                  {Object.entries(report[k]).map(([name, value]: any) => (
                    <p className="spread" key={name}>
                      {name}
                      <b>{money(value)}</b>
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
        {tab === "Catálogo" && (
          <>
            <div className="spread">
              <p>Define los productos y precios reales del negocio.</p>
              <button
                onClick={() =>
                  Editing({
                    name: "",
                    price: 0,
                    category: "",
                    presentation: "",
                    active: true,
                    sold_out: false,
                  })
                }
              >
                ＋ Crear producto
              </button>
            </div>
            <div className="catalog">
              {products.map((p) => (
                <article className="panel" key={p.id}>
                  <span className="muted">{p.category || "Sin categoría"}</span>
                  <h2>{p.name}</h2>
                  <p>{p.presentation}</p>
                  <strong>{money(p.price)}</strong>
                  <p>
                    {!p.active
                      ? "Inactivo"
                      : p.sold_out
                        ? "Agotado"
                        : "Disponible"}
                  </p>
                  <button
                    className="ghost"
                    onClick={() =>
                      Editing({
                        ...p,
                        active: !!p.active,
                        sold_out: !!p.sold_out,
                      })
                    }
                  >
                    Editar producto
                  </button>
                </article>
              ))}
            </div>
            {!products.length && (
              <div className="empty">
                Tu catálogo está vacío. Agrega tu primer producto con su precio
                real.
              </div>
            )}
          </>
        )}
        {tab === "Configuración" && settings && (
          <div className="grid2">
            <section className="panel">
              <h2>Operación y respaldos</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  action(async () => {
                    S(await api("settings", "PUT", settings));
                  });
                }}
              >
                {[
                  ["warningMinutes", "Alerta de pedido (min)"],
                  ["retentionDays", "Conservar respaldos (días)"],
                  ["backupHour", "Hora diaria de respaldo (0–23)"],
                  ["copies", "Copias de impresión"],
                ].map(([k, v]) => (
                  <label key={k}>
                    {v}
                    <input
                      type="number"
                      required
                      value={settings[k]}
                      onChange={(e) =>
                        S({ ...settings, [k]: Number(e.target.value) })
                      }
                    />
                  </label>
                ))}
                <label>
                  Papel
                  <select
                    value={settings.paperWidth}
                    onChange={(e) =>
                      S({ ...settings, paperWidth: Number(e.target.value) })
                    }
                  >
                    <option value={58}>58 mm</option>
                    <option value={80}>80 mm</option>
                  </select>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={settings.autoPrint}
                    onChange={(e) =>
                      S({ ...settings, autoPrint: e.target.checked })
                    }
                  />
                  Comanda automática (simulada)
                </label>
                <p>Adaptador de impresión: simulado. No imprime en hardware.</p>
                <button disabled={busy}>Guardar configuración</button>
              </form>
              <button
                className="ghost"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    await api("backups", "POST", {});
                    await refresh();
                  })
                }
              >
                Crear respaldo verificado
              </button>
              {backups.slice(0, 5).map((b) => (
                <p key={b.id}>
                  {date(b.at)} · {b.status}
                </p>
              ))}
              <small>Carpeta configurable con BACKUP_DIR en el servidor.</small>
            </section>
            <section className="panel">
              <h2>Usuarios autorizados</h2>
              {users.map((u) => (
                <p className="spread" key={u.id}>
                  {u.username} · {u.role} {u.active ? "" : "(inactivo)"}
                  {u.id !== user.id && !!u.active && (
                    <button
                      className="ghost"
                      onClick={() =>
                        action(async () => {
                          await api(`users/${u.id}/disable`, "POST", {});
                          await refresh();
                        })
                      }
                    >
                      Desactivar
                    </button>
                  )}
                </p>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const data = Object.fromEntries(new FormData(form));
                  action(async () => {
                    await api("users", "POST", data);
                    form.reset();
                    await refresh();
                  });
                }}
              >
                <label>
                  Nuevo usuario
                  <input name="username" required minLength={3} />
                </label>
                <label>
                  Contraseña
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={12}
                  />
                </label>
                <label>
                  Rol
                  <select name="role">
                    <option value="operator">Operador</option>
                    <option value="admin">Administrador</option>
                  </select>
                </label>
                <button disabled={busy}>Crear usuario</button>
              </form>
            </section>
          </div>
        )}
      </main>
      {modal && (
        <Dialog title="Nuevo pedido" onClose={() => M(false)}>
          <p className="muted">
            El número y la hora se asignan al guardar en el servidor.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action(async () => {
                await api("orders", "POST", { ...draft, request_key: key });
                D({
                  ...draft,
                  customer: "",
                  phone: "",
                  address: "",
                  neighborhood: "",
                  notes: "",
                  discount: 0,
                  delivery: 0,
                  items: [],
                });
                K(cryptoKey());
                M(false);
                await refresh();
              });
            }}
          >
            <div className="grid2">
              {[
                ["customer", "Cliente"],
                ["phone", "Teléfono"],
                ["address", "Dirección"],
                ["neighborhood", "Barrio"],
              ].map(([k, v]) => (
                <label key={k}>
                  {v}
                  <input
                    required={k === "customer"}
                    value={draft[k]}
                    onChange={(e) => D({ ...draft, [k]: e.target.value })}
                  />
                </label>
              ))}
              <label>
                Canal
                <select
                  value={draft.channel}
                  onChange={(e) => D({ ...draft, channel: e.target.value })}
                >
                  {["WhatsApp", "Instagram", "Llamada", "Otro"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Pago
                <select
                  value={draft.payment}
                  onChange={(e) => D({ ...draft, payment: e.target.value })}
                >
                  {[
                    "Efectivo",
                    "Transferencia bancaria",
                    "Nequi",
                    "Daviplata",
                    "Otro",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </div>
            <h3>Productos</h3>
            {draft.items.map((i: any, index: number) => (
              <div className="item" key={index}>
                <select
                  aria-label="Producto"
                  value={i.product_id}
                  onChange={(e) =>
                    D({
                      ...draft,
                      items: draft.items.map((v: any, n: number) =>
                        n === index
                          ? { ...v, product_id: Number(e.target.value) }
                          : v,
                      ),
                    })
                  }
                >
                  {products
                    .filter((p) => p.active && !p.sold_out)
                    .map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name} · {money(p.price)}
                      </option>
                    ))}
                </select>
                <input
                  aria-label="Cantidad"
                  type="number"
                  min={1}
                  max={1000}
                  value={i.quantity}
                  onChange={(e) =>
                    D({
                      ...draft,
                      items: draft.items.map((v: any, n: number) =>
                        n === index
                          ? { ...v, quantity: Number(e.target.value) }
                          : v,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="ghost"
                  onClick={() =>
                    D({
                      ...draft,
                      items: draft.items.filter(
                        (_: any, n: number) => n !== index,
                      ),
                    })
                  }
                >
                  Quitar
                </button>
              </div>
            ))}
            <button
              type="button"
              className="ghost"
              disabled={!products.some((p) => p.active && !p.sold_out)}
              onClick={() =>
                D({
                  ...draft,
                  items: [
                    ...draft.items,
                    {
                      product_id: products.find((p) => p.active && !p.sold_out)
                        .id,
                      quantity: 1,
                    },
                  ],
                })
              }
            >
              ＋ Agregar producto
            </button>
            <div className="grid2">
              {[
                ["delivery", "Domicilio COP"],
                ["discount", "Descuento COP"],
              ].map(([k, v]) => (
                <label key={k}>
                  {v}
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={draft[k]}
                    onChange={(e) =>
                      D({ ...draft, [k]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
            </div>
            <label>
              Observaciones
              <textarea
                value={draft.notes}
                onChange={(e) => D({ ...draft, notes: e.target.value })}
              />
            </label>
            <p className="spread">
              Subtotal <b>{money(subtotal)}</b>
            </p>
            <h2 className="spread">
              Total{" "}
              <span>{money(subtotal + draft.delivery - draft.discount)}</span>
            </h2>
            <button
              className="wide"
              disabled={busy || !connected || !draft.items.length}
            >
              Confirmar pedido
            </button>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </form>
        </Dialog>
      )}
      {editing && (
        <Dialog
          title={editing.id ? "Editar producto" : "Crear producto"}
          onClose={() => Editing(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action(async () => {
                await api(
                  "products" + (editing.id ? "/" + editing.id : ""),
                  editing.id ? "PUT" : "POST",
                  editing,
                );
                Editing(null);
                await refresh();
              });
            }}
          >
            {[
              ["name", "Nombre"],
              ["price", "Precio COP"],
              ["category", "Categoría"],
              ["presentation", "Presentación"],
            ].map(([k, v]) => (
              <label key={k}>
                {v}
                <input
                  required={k === "name"}
                  type={k === "price" ? "number" : "text"}
                  min={0}
                  step={1}
                  value={editing[k]}
                  onChange={(e) =>
                    Editing({
                      ...editing,
                      [k]:
                        k === "price" ? Number(e.target.value) : e.target.value,
                    })
                  }
                />
              </label>
            ))}
            {[
              ["active", "Activo"],
              ["sold_out", "Agotado"],
            ].map(([k, v]) => (
              <label className="check" key={k}>
                <input
                  type="checkbox"
                  checked={editing[k]}
                  onChange={(e) =>
                    Editing({ ...editing, [k]: e.target.checked })
                  }
                />
                {v}
              </label>
            ))}
            <button disabled={busy}>Guardar producto</button>
            {error && <p className="error">{error}</p>}
          </form>
        </Dialog>
      )}
      {selected && (
        <Dialog title={`Pedido #${selected.id}`} onClose={() => Selected(null)}>
          <label className="no-print">
            Vista previa
            <select
              value={printKind}
              onChange={(e) =>
                PrintKind(e.target.value as "kitchen" | "receipt")
              }
            >
              <option value="receipt">Recibo de pedido</option>
              <option value="kitchen">Comanda de cocina</option>
            </select>
          </label>
          <div
            className="receipt"
            style={
              {
                "--paper-width": `${settings?.paperWidth || 80}mm`,
              } as React.CSSProperties
            }
          >
            <BrandLogo className="receipt-brand" />
            <p>
              Pedido #{selected.id} · {date(selected.created_at)}
            </p>
            <h3>{selected.customer}</h3>
            <p>
              {selected.phone} · {selected.address} · {selected.neighborhood}
            </p>
            {selected.items.map((i: any) => (
              <p className="spread" key={i.id}>
                {i.quantity} × {i.name}
                {printKind === "receipt" && (
                  <b>{money(i.quantity * i.price)}</b>
                )}
              </p>
            ))}
            {printKind === "receipt" && (
              <>
                <hr />
                <p>
                  Subtotal: {money(selected.subtotal)} · Descuento:{" "}
                  {money(selected.discount)} · Domicilio:{" "}
                  {money(selected.delivery)}
                </p>
                <h2>Total {money(selected.total)}</h2>
                <p>
                  {selected.payment} · {selected.channel}
                </p>
              </>
            )}
            <p>{selected.notes}</p>
          </div>
          <div className="no-print">
            <h3>Historial de estados</h3>
            {selected.history.map((h: any) => (
              <p key={h.id}>
                {labels[h.status]} · {date(h.at)} · {h.username}{" "}
                {h.reason && "· " + h.reason}
              </p>
            ))}
            <h3>Tiempos operativos</h3>
            {[
              ["Preparación", "ready_at", "created_at"],
              ["Espera", "dispatched_at", "ready_at"],
              ["Domicilio", "delivered_at", "dispatched_at"],
              ["Total", "delivered_at", "created_at"],
            ].map(([n, a, b]) => (
              <p key={n}>
                {n}:{" "}
                {selected[a as keyof Order] && selected[b as keyof Order]
                  ? (
                      (Date.parse(selected[a as keyof Order] as string) -
                        Date.parse(selected[b as keyof Order] as string)) /
                      60000
                    ).toFixed(1) + " min"
                  : "—"}
              </p>
            ))}
            <p>Registró: {selected.responsible}</p>
            {user.role === "admin" && (
              <div className="deletion-section">
                <div>
                  <strong>Administración del pedido</strong>
                  <p className="muted">
                    Eliminación permanente, con registro de auditoría.
                  </p>
                </div>
                <button
                  className="danger-outline"
                  disabled={busy || !connected}
                  onClick={() => Deleting(selected)}
                >
                  <Icon name="trash" size={18} />
                  Eliminar pedido
                </button>
              </div>
            )}
            <div className="filters">
              <button className="ghost" onClick={() => window.print()}>
                Vista previa / imprimir navegador
              </button>
              <button
                className="ghost"
                onClick={() =>
                  action(async () => {
                    const r = await api(`orders/${selected.id}/print`, "POST", {
                      kind: printKind,
                      request_key: cryptoKey(),
                    });
                    alert(r.message);
                  })
                }
              >
                Probar impresión simulada
              </button>
              {next[selected.status] && (
                <button
                  disabled={busy || !connected}
                  onClick={() => change(selected, next[selected.status])}
                >
                  {nextLabel[selected.status]}
                </button>
              )}
              {next[selected.status] && (
                <button
                  className="danger"
                  disabled={busy || !connected}
                  onClick={() => change(selected, "cancelled")}
                >
                  Cancelar pedido
                </button>
              )}
            </div>
          </div>
        </Dialog>
      )}
      {deleting && user.role === "admin" && (
        <DeleteOrderDialog
          order={deleting}
          onClose={() => Deleting(null)}
          onConflict={() => {
            void refresh();
          }}
          onDeleted={() => {
            Deleting(null);
            Selected(null);
            void refresh("orders");
          }}
        />
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
