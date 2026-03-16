"use client";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");

export default function ProductionSchedulePage() {
  const { user } = useUser();
  const [orders, setOrders] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [utilization, setUtilization] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.token) return;
    const headers = { Authorization: `Bearer ${user.token}` };
    Promise.all([
      fetch(`${API_URL}/manufacturing/production/schedule`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/manufacturing/production/dashboard`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/manufacturing/production/work-center-utilization`, { headers }).then((r) => r.json()),
    ])
      .then(([sched, dash, util]) => {
        setOrders(Array.isArray(sched) ? sched : sched.data || []);
        setDashboard(dash);
        setUtilization(Array.isArray(util) ? util : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token]);

  const StatCard = ({ label, value, color }: { label: string; value: string | number; color: string }) => (
    <div className="card" style={{ padding: 20, textAlign: "center" }}>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 4 }}>{label}</div>
    </div>
  );

  const statusColor = (s: string) => {
    switch (s) {
      case "PLANNED": return { bg: "#dbeafe", text: "#1d4ed8" };
      case "IN_PROGRESS": return { bg: "#fef3c7", text: "#d97706" };
      case "COMPLETED": return { bg: "#dcfce7", text: "#16a34a" };
      default: return { bg: "#f3f4f6", text: "#6b7280" };
    }
  };

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.MANUFACTURING_VIEW, PERMISSIONS.PRODUCTION_MANAGE]}>
      <div style={{ display: "grid", gap: 24 }}>
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>📅 Planificación de Producción</h1>
          <p style={{ color: "var(--text-secondary)" }}>Órdenes de producción, programación y utilización de centros de trabajo.</p>
        </div>

        {loading && <div className="card" style={{ padding: 32, textAlign: "center" }}>Cargando...</div>}

        {dashboard && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
            <StatCard label="Planificadas" value={dashboard.planned} color="#3b82f6" />
            <StatCard label="En progreso" value={dashboard.inProgress} color="#f59e0b" />
            <StatCard label="Completadas" value={dashboard.completed} color="#22c55e" />
            <StatCard label="Scrap total" value={dashboard.totalScrap} color="#ef4444" />
          </div>
        )}

        {utilization.length > 0 && (
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 12 }}>Utilización de Centros de Trabajo</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              {utilization.map((wc: any) => (
                <div key={wc.id} style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{wc.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>Código: {wc.code}</div>
                  <div style={{ background: "var(--bg-secondary)", borderRadius: 6, height: 8, overflow: "hidden" }}>
                    <div style={{
                      width: `${Math.min(wc.utilization, 100)}%`,
                      height: "100%",
                      background: wc.utilization > 90 ? "#ef4444" : wc.utilization > 70 ? "#f59e0b" : "#22c55e",
                      borderRadius: 6,
                    }} />
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4, textAlign: "right" }}>{wc.utilization}%</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {orders.length > 0 && (
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 12 }}>Órdenes Programadas</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border)" }}>
                    <th style={{ textAlign: "left", padding: 8 }}>Orden</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Producto</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Cantidad</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Estatus</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Inicio plan.</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Fin plan.</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o: any) => {
                    const sc = statusColor(o.status);
                    return (
                      <tr key={o.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: 8, fontFamily: "monospace" }}>{o.orderNumber}</td>
                        <td style={{ padding: 8 }}>{o.product?.name || "—"}</td>
                        <td style={{ padding: 8 }}>{Number(o.plannedQty)}</td>
                        <td style={{ padding: 8 }}>
                          <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: sc.bg, color: sc.text }}>
                            {o.status}
                          </span>
                        </td>
                        <td style={{ padding: 8 }}>{o.plannedStartDate ? new Date(o.plannedStartDate).toLocaleDateString("es-MX") : "—"}</td>
                        <td style={{ padding: 8 }}>{o.plannedEndDate ? new Date(o.plannedEndDate).toLocaleDateString("es-MX") : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
