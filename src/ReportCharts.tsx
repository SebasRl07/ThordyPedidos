import { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
export default function ReportCharts({ report }: { report: any }) {
  const [group, G] = useState("daily");
  const groups: Record<string, any> = {};
  for (const day of report.daily) {
    let key = day.date;
    if (group === "monthly") key = key.slice(0, 7);
    if (group === "weekly") {
      const d = new Date(key + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      key = d.toISOString().slice(0, 10);
    }
    groups[key] ??= { date: key, orders: 0, sales: 0 };
    groups[key].orders += day.orders;
    groups[key].sales += day.sales;
  }
  const distribution = [
    { name: "0–15 min", count: 0 },
    { name: "15–30 min", count: 0 },
    { name: "30–60 min", count: 0 },
    { name: "Más de 60 min", count: 0 },
  ];
  for (const t of report.times) {
    if (t.total === null) continue;
    distribution[t.total <= 15 ? 0 : t.total <= 30 ? 1 : t.total <= 60 ? 2 : 3]
      .count++;
  }
  return (
    <>
      <div className="panel">
        <div className="spread">
          <h2>Evolución de pedidos y ventas</h2>
          <select
            aria-label="Agrupar informes"
            style={{ width: 150 }}
            value={group}
            onChange={(e) => G(e.target.value)}
          >
            <option value="daily">Diaria</option>
            <option value="weekly">Semanal</option>
            <option value="monthly">Mensual</option>
          </select>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={Object.values(groups)}>
            <XAxis dataKey="date" />
            <YAxis yAxisId="orders" />
            <YAxis yAxisId="sales" orientation="right" />
            <Tooltip
              contentStyle={{
                background: "#202226",
                border: "1px solid #44474d",
                borderRadius: 6,
                color: "#eee",
              }}
              cursor={{ fill: "#ffffff06" }}
            />
            <Bar
              yAxisId="orders"
              dataKey="orders"
              name="Pedidos"
              fill="#c69450"
            />
            <Bar
              yAxisId="sales"
              dataKey="sales"
              name="Ventas COP"
              fill="#8da9b5"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid2">
        <div className="panel">
          <h2>Unidades por producto</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={report.products}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip
                contentStyle={{
                  background: "#202226",
                  border: "1px solid #44474d",
                  borderRadius: 6,
                  color: "#eee",
                }}
                cursor={{ fill: "#ffffff06" }}
              />
              <Bar dataKey="quantity" name="Unidades" fill="#c69450" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="panel">
          <h2>Distribución del tiempo total</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={distribution}>
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "#202226",
                  border: "1px solid #44474d",
                  borderRadius: 6,
                  color: "#eee",
                }}
                cursor={{ fill: "#ffffff06" }}
              />
              <Bar dataKey="count" name="Pedidos entregados" fill="#82a793" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
