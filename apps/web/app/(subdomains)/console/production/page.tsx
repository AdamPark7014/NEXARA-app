"use client";
import { useEffect, useState, useMemo } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");

const STATUS_LABELS: Record<string, string> = {
  PLANNED: "Planificada", IN_PROGRESS: "En progreso", COMPLETED: "Completada",
  CANCELLED: "Cancelada", ON_HOLD: "En pausa",
};

export default function ProductionPage() {
  const { user } = useUser();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");

  useEffect(() => {
    if (!user?.token) return;
    fetch(`${API_URL}/manufacturing/production`, {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((r) => r.json())
      .then((d) => setOrders(Array.isArray(d) ? d : d.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token]);

  const stats = useMemo(() => {
    const inProgress = orders.filter((o) => o.status === "IN_PROGRESS").length;
    const completed = orders.filter((o) => o.status === "COMPLETED").length;
    const planned = orders.filter((o) => o.status === "PLANNED").length;
    const totalQty = orders.reduce((s, o) => s + (o.quantity || 0), 0);
    const producedQty = orders.reduce((s, o) => s + (o.producedQuantity || 0), 0);
    const completionRate = totalQty > 0 ? Math.round((producedQty / totalQty) * 100) : 0;
    return { total: orders.length, inProgress, completed, planned, totalQty, producedQty, completionRate };
  }, [orders]);

  const statusColor = (s: string) => {
    if (s === "COMPLETED") return "status-active";
    if (s === "IN_PROGRESS") return "status-pending";
    if (s === "CANCELLED") return "status-inactive";
    return "status-pending";
  };

  const filtered = filterStatus ? orders.filter((o) => o.status === filterStatus) : orders;

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.PRODUCTION_MANAGE, PERMISSIONS.MANUFACTURING_VIEW]}>
      <div style={{ display: "grid", gap: 24 }}>
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>🏭 Órdenes de Producción</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Planificación, seguimiento y control de órdenes de producción en planta.
          </p>
        </div>

        {/* KPI Cards */}
        {!loading && orders.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Total OPs</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)" }}>{stats.total}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>En progreso</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--warning)" }}>{stats.inProgress}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Completadas</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--success)" }}>{stats.completed}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Rendimiento</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: stats.completionRate >= 80 ? "var(--success)" : "var(--warning)" }}>
                {stats.completionRate}%
              </p>
              <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>{stats.producedQty.toLocaleString()} / {stats.totalQty.toLocaleString()} uds</p>
            </div>
          </div>
        )}

        {/* Status Filters */}
        {!loading && orders.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["", "PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((s) => (
              <button key={s} onClick={() => setFilterStatus(s)}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600,
                  background: filterStatus === s ? "var(--primary)" : "var(--card-bg)", color: filterStatus === s ? "#fff" : "var(--text-primary)" }}>
                {s ? STATUS_LABELS[s] || s : "Todas"} ({s ? orders.filter((o) => o.status === s).length : orders.length})
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>Cargando...</p>
        ) : filtered.length === 0 ? (
          <div className="card" style={{ padding: 24, textAlign: "center" }}>
            <p style={{ color: "var(--text-secondary)" }}>No hay órdenes de producción.</p>
          </div>
        ) : (
          <div className="card" style={{ overflow: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>OP #</th>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Producido</th>
                  <th>Avance</th>
                  <th>Inicio plan.</th>
                  <th>Fin plan.</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o: any) => {
                  const pct = o.quantity > 0 ? Math.round(((o.producedQuantity || 0) / o.quantity) * 100) : 0;
                  return (
                    <tr key={o.id}>
                      <td><strong>OP-{o.id}</strong></td>
                      <td>{o.bom?.productName || o.productName || "—"}</td>
                      <td>{o.quantity}</td>
                      <td>{o.producedQuantity || 0}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ flex: 1, height: 6, background: "var(--border)", borderRadius: 3, minWidth: 50 }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? "var(--success)" : "var(--primary)", borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{pct}%</span>
                        </div>
                      </td>
                      <td>{o.plannedStart ? new Date(o.plannedStart).toLocaleDateString("es-MX") : "—"}</td>
                      <td>{o.plannedEnd ? new Date(o.plannedEnd).toLocaleDateString("es-MX") : "—"}</td>
                      <td><span className={statusColor(o.status)}>{STATUS_LABELS[o.status] || o.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
