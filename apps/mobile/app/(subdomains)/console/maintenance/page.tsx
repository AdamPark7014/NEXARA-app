"use client";
import { buildApiUrl } from "@/lib/api-base";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";
import HelpTab from '../../../../components/HelpTab';

export default function MaintenancePage() {
  const { user } = useUser();
  const [orders, setOrders] = useState<any[]>([]);
  const [overdue, setOverdue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"orders" | "overdue">("orders");

  useEffect(() => {
    if (!user?.token) return;
    const headers = { Authorization: `Bearer ${user.token}` };
    Promise.all([
      fetch(buildApiUrl(`maintenance/work-orders`), { headers }).then((r) => r.json()),
      fetch(buildApiUrl(`maintenance/assets/schedules/overdue`), { headers }).then((r) => r.json()),
    ])
      .then(([wo, ov]) => {
        setOrders(Array.isArray(wo) ? wo : wo.data || []);
        setOverdue(Array.isArray(ov) ? ov : ov.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token]);

  const completedWO = orders.filter((o: any) => o.status === "COMPLETED").length;
  const inProgressWO = orders.filter((o: any) => o.status === "IN_PROGRESS").length;
  const completionRate = orders.length > 0 ? Math.round((completedWO / orders.length) * 100) : 0;

  const tabStyle = (t: string) => ({
    padding: "10px 16px",
    background: tab === t ? "var(--primary)" : "var(--bg-secondary)",
    color: tab === t ? "#fff" : "var(--text-primary)",
    border: "none",
    borderRadius: 8,
    fontWeight: 500,
    cursor: "pointer",
  });

  const statusColor = (s: string) => {
    if (s === "COMPLETED") return "status-active";
    if (s === "IN_PROGRESS") return "status-pending";
    if (s === "CANCELLED") return "status-inactive";
    return "status-pending";
  };

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.MAINTENANCE_VIEW, PERMISSIONS.MAINTENANCE_MANAGE]}>
      <div style={{ display: "grid", gap: 24 }}>
        <HelpTab module="maintenance" user={user} />
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>🔩 Órdenes de Mantenimiento</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Gestión de órdenes de trabajo, mantenimiento correctivo y preventivo.
          </p>
        </div>

        {/* KPI Cards */}
        {!loading && (orders.length > 0 || overdue.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Órdenes de trabajo</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)" }}>{orders.length}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>En progreso</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--warning)" }}>{inProgressWO}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Cumplimiento</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: completionRate >= 80 ? "var(--success)" : "var(--warning)" }}>{completionRate}%</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Mant. vencidos</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: overdue.length > 0 ? "var(--danger)" : "var(--success)" }}>{overdue.length}</p>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => setTab("orders")} style={tabStyle("orders")}>
            📋 Órdenes de Trabajo
          </button>
          <button onClick={() => setTab("overdue")} style={tabStyle("overdue")}>
            ⚠️ Vencidos {overdue.length > 0 && `(${overdue.length})`}
          </button>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>Cargando...</p>
        ) : tab === "orders" ? (
          orders.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>No hay órdenes de mantenimiento.</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>OT #</th>
                    <th>Activo</th>
                    <th>Tipo</th>
                    <th>Prioridad</th>
                    <th>Asignado</th>
                    <th>Estado</th>
                    <th>Fecha prog.</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o: any) => (
                    <tr key={o.id}>
                      <td><strong>OT-{o.id}</strong></td>
                      <td>{o.asset?.name || o.assetId}</td>
                      <td><span className="badge">{o.type}</span></td>
                      <td><span className="badge">{o.priority}</span></td>
                      <td>{o.assignedTo?.nombre || o.assignedToId || "—"}</td>
                      <td><span className={statusColor(o.status)}>{o.status}</span></td>
                      <td>{o.scheduledDate ? new Date(o.scheduledDate).toLocaleDateString("es-MX") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          overdue.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>✅ Sin mantenimientos vencidos.</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Activo</th>
                    <th>Tipo mant.</th>
                    <th>Último servicio</th>
                    <th>Próximo servicio</th>
                    <th>Días vencido</th>
                  </tr>
                </thead>
                <tbody>
                  {overdue.map((s: any, i: number) => {
                    const days = s.nextDue ? Math.floor((Date.now() - new Date(s.nextDue).getTime()) / 86400000) : 0;
                    return (
                      <tr key={i}>
                        <td>{s.asset?.name || s.assetId}</td>
                        <td><span className="badge">{s.type}</span></td>
                        <td>{s.lastPerformed ? new Date(s.lastPerformed).toLocaleDateString("es-MX") : "—"}</td>
                        <td style={{ color: "var(--danger)" }}>
                          {s.nextDue ? new Date(s.nextDue).toLocaleDateString("es-MX") : "—"}
                        </td>
                        <td style={{ color: "var(--danger)", fontWeight: 600 }}>{days > 0 ? `${days}d` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </RoleGuard>
  );
}
