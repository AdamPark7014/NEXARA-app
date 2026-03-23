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

const getPeriodStart = (period: string) => {
  const now = new Date();
  const start = new Date(now);
  if (period === "DAILY") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "WEEKLY") {
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
  } else if (period === "MONTHLY") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else if (period === "QUARTERLY") {
    const quarterStartMonth = Math.floor(start.getMonth() / 3) * 3;
    start.setMonth(quarterStartMonth, 1);
    start.setHours(0, 0, 0, 0);
  } else if (period === "YEARLY") {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  }
  return start;
};

const getPeriodLabel = (row: any) => {
  const metaPeriod = row?.metadata?.period;
  if (metaPeriod) return metaPeriod;
  if (row?.period) return row.period;
  if (!row?.periodStart) return "—";
  const start = new Date(row.periodStart);
  return start.toLocaleDateString("es-MX", { year: "numeric", month: "short" });
};

const normalizeKpiRows = (rows: any[]) => {
  return rows
    .map((row: any) => ({
      ...row,
      displayName: String(row?.kpiName || row?.name || "").trim(),
      displayTarget: row?.metadata?.target ?? row?.target ?? null,
      displayPeriod: getPeriodLabel(row),
      displayDate: row?.periodEnd || row?.periodStart || row?.snapshotDate || row?.createdAt,
    }))
    .filter((row: any) => row.displayName.length > 0)
    .filter((row: any) => row.kpiCategory !== "PUBLIC_TRAFFIC")
    .filter((row: any) => !row.displayName.toLowerCase().startsWith("landing:"));
};

export default function AnalyticsPage() {
  const { user } = useUser();
  const [dashboard, setDashboard] = useState<any>(null);
  const [kpis, setKpis] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"dashboard" | "kpis">("dashboard");
  const [showKpiForm, setShowKpiForm] = useState(false);
  const [kpiForm, setKpiForm] = useState({ name: "", value: 0, target: 0, unit: "", period: "MONTHLY" });
  const [savingKpi, setSavingKpi] = useState(false);

  useEffect(() => {
    if (!user?.token) return;
    const headers = { Authorization: `Bearer ${user.token}` };
    Promise.all([
      fetch(`${API_URL}/analytics/dashboard`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/analytics/kpi`, { headers }).then((r) => r.json()),
    ])
      .then(([dash, kpi]) => {
        setDashboard(dash);
        const rawRows = Array.isArray(kpi) ? kpi : kpi.data || [];
        setKpis(normalizeKpiRows(rawRows));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token]);

  const handleCreateKpi = async () => {
    if (!user?.token || !kpiForm.name) return;
    setSavingKpi(true);
    try {
      const periodStart = getPeriodStart(kpiForm.period);
      const periodEnd = new Date();
      const res = await fetch(`${API_URL}/analytics/kpi`, {
        method: "POST",
        headers: { Authorization: `Bearer ${user.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          kpiName: kpiForm.name.trim(),
          value: Number(kpiForm.value) || 0,
          unit: kpiForm.unit?.trim() || undefined,
          kpiCategory: "GENERAL",
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          metadata: { target: Number(kpiForm.target) || 0, period: kpiForm.period },
        }),
      });
      if (res.ok) {
        const newKpi = await res.json();
        setKpis([...normalizeKpiRows([newKpi]), ...kpis]);
        setKpiForm({ name: "", value: 0, target: 0, unit: "", period: "MONTHLY" });
        setShowKpiForm(false);
      }
    } catch (e) { console.error(e); }
    finally { setSavingKpi(false); }
  };

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
        <HelpTab module="analytics" user={user} />
        
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
          <>
            {showKpiForm && (
              <div className="card" style={{ padding: 16, marginBottom: 16, borderLeft: '4px solid var(--primary)' }}>
                <h3 style={{ marginBottom: 12 }}>Registrar Nuevo KPI</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <input type="text" placeholder="Nombre del KPI" value={kpiForm.name} onChange={(e) => setKpiForm({ ...kpiForm, name: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 13 }} />
                  <input type="number" placeholder="Valor actual" value={kpiForm.value} onChange={(e) => setKpiForm({ ...kpiForm, value: parseFloat(e.target.value) || 0 })} style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 13 }} />
                  <input type="number" placeholder="Objetivo/Meta" value={kpiForm.target} onChange={(e) => setKpiForm({ ...kpiForm, target: parseFloat(e.target.value) || 0 })} style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 13 }} />
                  <input type="text" placeholder="Unidad (ej: unidades, %)" value={kpiForm.unit} onChange={(e) => setKpiForm({ ...kpiForm, unit: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 13 }} />
                  <select value={kpiForm.period} onChange={(e) => setKpiForm({ ...kpiForm, period: e.target.value })} style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 13, gridColumn: '1/-1' }}>
                    <option value="DAILY">Diario</option>
                    <option value="WEEKLY">Semanal</option>
                    <option value="MONTHLY">Mensual</option>
                    <option value="QUARTERLY">Trimestral</option>
                    <option value="YEARLY">Anual</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleCreateKpi} disabled={savingKpi} style={{ padding: '8px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>
                    {savingKpi ? 'Guardando...' : 'Registrar KPI'}
                  </button>
                  <button onClick={() => setShowKpiForm(false)} style={{ padding: '8px 16px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>Cancelar</button>
                </div>
              </div>
            )}
            {!showKpiForm && (
              <button onClick={() => setShowKpiForm(true)} style={{ marginBottom: 12, padding: '10px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>+ Registrar KPI</button>
            )}
            {kpis.length === 0 ? (
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
                      <td><strong>{k.displayName}</strong></td>
                      <td style={{ fontWeight: 600 }}>{k.value}</td>
                      <td>{k.displayTarget ?? "—"}</td>
                      <td>{k.unit || "—"}</td>
                      <td><span className="badge">{k.displayPeriod}</span></td>
                      <td>{k.displayDate ? new Date(k.displayDate).toLocaleDateString("es-MX") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </>
        )}
      </div>
    </RoleGuard>
  );
}
