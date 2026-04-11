"use client";
import { buildApiUrl } from "@/lib/api-base";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import HelpTab from '@/components/HelpTab';
import { PERMISSIONS } from "@/lib/permissions";

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  ok:      { bg: "rgba(34,197,94,0.12)",  text: "#16a34a", dot: "#22c55e" },
  warning: { bg: "rgba(234,179,8,0.12)",  text: "#b45309", dot: "#eab308" },
  danger:  { bg: "rgba(239,68,68,0.12)",  text: "#b91c1c", dot: "#ef4444" },
  info:    { bg: "rgba(15,106,214,0.10)", text: "var(--primary)", dot: "#0f6ad6" },
};

const CATEGORY_ICONS: Record<string, string> = {
  "Operaciones": "⚙️",
  "Ventas": "💰",
  "Seguridad": "🛡️",
  "Recursos Humanos": "👥",
  "Compras & Stock": "📦",
  "Documentos & Flujos": "📑",
  "Calidad & Mantenimiento": "🔧",
};

export default function AnalyticsPage() {
  const { user } = useUser();
  const [dashboard, setDashboard] = useState<any>(null);
  const [computedKpis, setComputedKpis] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"dashboard" | "kpis">("dashboard");

  useEffect(() => {
    if (!user?.token) return;
    const headers = { Authorization: `Bearer ${user.token}` };
    Promise.all([
      fetch(buildApiUrl(`analytics/dashboard`), { headers }).then((r) => r.json()).catch(() => null),
      fetch(buildApiUrl(`analytics/kpi/computed`), { headers }).then((r) => r.json()).catch(() => []),
    ])
      .then(([dash, computed]) => {
        setDashboard(dash);
        setComputedKpis(Array.isArray(computed) ? computed : []);
      })
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

  // Group computed KPIs by category
  const kpiByCategory = computedKpis.reduce((acc: Record<string, any[]>, kpi) => {
    const cat = kpi.category || "General";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(kpi);
    return acc;
  }, {});

  // Dashboard executive cards from getExecutiveDashboard()
  const dashCards = dashboard ? [
    { label: "Ingreso ventas aprobadas", value: Number(dashboard.revenue ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }), icon: "💰" },
    { label: "Órdenes de compra abiertas", value: dashboard.openPurchaseOrders ?? 0, icon: "🛒" },
    { label: "Producción activa", value: dashboard.activeProductionOrders ?? 0, icon: "🏭" },
    { label: "Mantenimientos pendientes", value: dashboard.pendingMaintenanceOrders ?? 0, icon: "🔧" },
    { label: "No conformidades abiertas", value: dashboard.openNonConformances ?? 0, icon: "🔍" },
    { label: "Flujos activos", value: dashboard.activeWorkflows ?? 0, icon: "🔄" },
    { label: "Alertas de bajo stock", value: dashboard.lowStockAlerts ?? 0, icon: "📦" },
  ] : [];

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.BI_VIEW, PERMISSIONS.BI_MANAGE]}>
      <div style={{ display: "grid", gap: 24 }}>
        <HelpTab module="analytics" user={user} />

        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>📊 BI y Analytics</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Indicadores clave de rendimiento calculados en tiempo real desde todos los módulos del sistema.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => setTab("dashboard")} style={tabStyle("dashboard")}>📈 Dashboard</button>
          <button onClick={() => setTab("kpis")} style={tabStyle("kpis")}>🎯 KPIs por módulo</button>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>Cargando...</p>
        ) : tab === "dashboard" ? (
          dashCards.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>No hay datos del dashboard aún.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
              {dashCards.map((c, i) => (
                <div key={i} className="card" style={{ padding: 20, textAlign: "center" }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>{c.icon}</div>
                  <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 8 }}>{c.label}</p>
                  <p style={{ fontSize: 26, fontWeight: 700, color: "var(--primary)" }}>{c.value}</p>
                </div>
              ))}
            </div>
          )
        ) : (
          computedKpis.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>No se pudieron cargar los KPIs calculados.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 24 }}>
              {Object.entries(kpiByCategory).map(([category, items]) => (
                <div key={category}>
                  <h3 style={{ margin: "0 0 12px", color: "var(--text-primary)", fontSize: 16, fontWeight: 600 }}>
                    {CATEGORY_ICONS[category] ?? "📌"} {category}
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                    {items.map((kpi: any, i: number) => {
                      const colors = STATUS_COLORS[kpi.status] ?? STATUS_COLORS.info;
                      return (
                        <div key={i} className="card" style={{ padding: "16px 18px", background: colors.bg, border: `1px solid ${colors.dot}33` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: colors.dot, flexShrink: 0, display: "inline-block" }} />
                            <p style={{ color: "var(--text-secondary)", fontSize: 12, margin: 0, lineHeight: 1.3 }}>{kpi.name}</p>
                          </div>
                          <p style={{ fontSize: 28, fontWeight: 700, color: colors.text, margin: 0 }}>
                            {kpi.unit === "MXN"
                              ? Number(kpi.value).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })
                              : kpi.value}
                          </p>
                          {kpi.unit && kpi.unit !== "MXN" && (
                            <p style={{ color: "var(--text-secondary)", fontSize: 11, margin: "4px 0 0" }}>{kpi.unit}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <p style={{ color: "var(--text-secondary)", fontSize: 12, textAlign: "right" }}>
                Actualizado al cargar la página • {new Date().toLocaleString("es-MX")}
              </p>
            </div>
          )
        )}
      </div>
    </RoleGuard>
  );
}
