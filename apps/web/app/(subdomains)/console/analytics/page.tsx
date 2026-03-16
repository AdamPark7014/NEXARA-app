"use client";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import HelpTab from '@/components/HelpTab';
import { PERMISSIONS } from "@/lib/permissions";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");

interface KpiCard {
  name: string;
  value: number;
  previousValue?: number;
  unit?: string;
}

export default function AnalyticsPage() {
  const { user } = useUser();
  const [dashboard, setDashboard] = useState<any>(null);
  const [kpis, setKpis] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"dashboard" | "kpis">("dashboard");

  useEffect(() => {
    if (!user?.token) return;
    const headers = { Authorization: `Bearer ${user.token}` };
    Promise.all([
      fetch(`${API_URL}/analytics/dashboard`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/analytics/kpi`, { headers }).then((r) => r.json()),
    ])
      .then(([dash, kpi]) => {
        setDashboard(dash);
        setKpis(Array.isArray(kpi) ? kpi : kpi.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token]);

  const tabStyle = (t: string) => ({
    padding: "10px 16px",
    background: tab === t ? "var(--primary)" : "var(--bg-secondary)",
    color: tab === t ? "#fff" : "var(--text-primary)",
    border: "none",
    borderRadius: 8,
    fontWeight: 500,
    cursor: "pointer",
  });

  const kpiCards: KpiCard[] = dashboard
    ? [
        { name: "Usuarios activos", value: dashboard.activeUsers ?? 0 },
        { name: "Producción del mes", value: dashboard.monthlyProduction ?? 0, unit: "unidades" },
        { name: "Órdenes pendientes", value: dashboard.pendingOrders ?? 0 },
        { name: "Incidentes abiertos", value: dashboard.openIncidents ?? 0 },
        { name: "Inspecciones del mes", value: dashboard.monthlyInspections ?? 0 },
        { name: "Mant. vencidos", value: dashboard.overdueMaintenances ?? 0 },
        { name: "Facturas por cobrar", value: dashboard.pendingInvoices ?? 0 },
        { name: "Flujos pendientes", value: dashboard.pendingWorkflows ?? 0 },
      ]
    : [];

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.BI_VIEW, PERMISSIONS.BI_MANAGE]}>
      <div style={{ display: "grid", gap: 24 }}>
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>📊 BI y Analytics</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Indicadores clave de rendimiento, tendencias y métricas operativas.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => setTab("dashboard")} style={tabStyle("dashboard")}>📈 Dashboard</button>
          <button onClick={() => setTab("kpis")} style={tabStyle("kpis")}>🎯 KPIs</button>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>Cargando...</p>
        ) : tab === "dashboard" ? (
          kpiCards.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>No hay datos del dashboard aún.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
              {kpiCards.map((kpi, i) => (
                <div key={i} className="card" style={{ padding: 20, textAlign: "center" }}>
                  <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 8 }}>{kpi.name}</p>
                  <p style={{ fontSize: 28, fontWeight: 700, color: "var(--primary)" }}>{kpi.value}</p>
                  {kpi.unit && (
                    <p style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 4 }}>{kpi.unit}</p>
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          kpis.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>No hay snapshots de KPI registrados.</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>KPI</th>
                    <th>Valor</th>
                    <th>Objetivo</th>
                    <th>Unidad</th>
                    <th>Período</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {kpis.map((k: any) => (
                    <tr key={k.id}>
                      <td><strong>{k.name}</strong></td>
                      <td style={{ fontWeight: 600 }}>{k.value}</td>
                      <td>{k.target ?? "—"}</td>
                      <td>{k.unit || "—"}</td>
                      <td><span className="badge">{k.period}</span></td>
                      <td>{new Date(k.snapshotDate || k.createdAt).toLocaleDateString("es-MX")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
        <HelpTab module="analytics" user={user} />
      </div>
    </RoleGuard>
  );
}
