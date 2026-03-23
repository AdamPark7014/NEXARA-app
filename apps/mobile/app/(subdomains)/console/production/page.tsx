"use client";
import { useEffect, useState, useMemo } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import HelpTab from "@/components/HelpTab";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");

const STATUS_LABELS: Record<string, string> = {
  PLANNED: "Planificada", IN_PROGRESS: "En progreso", COMPLETED: "Completada",
  CANCELLED: "Cancelada", ON_HOLD: "En pausa",
};

export default function ProductionPage() {
  const { user } = useUser();
  const [orders, setOrders] = useState<any[]>([]);
  const [boms, setBoms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");

  const canManage = hasPermission(user, PERMISSIONS.PRODUCTION_MANAGE);
  const [form, setForm] = useState({
    productId: "",
    bomId: "",
    plannedQty: "",
    plannedStartDate: "",
    plannedEndDate: "",
    priority: "NORMAL",
    notes: "",
  });

  const loadData = () => {
    if (!user?.token) return;
    setLoading(true);
    const headers = { Authorization: `Bearer ${user.token}` };
    Promise.all([
      fetch(`${API_URL}/manufacturing/production`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/manufacturing/bom`, { headers }).then((r) => r.json()),
    ])
      .then(([d, b]) => {
        setOrders(Array.isArray(d) ? d : d.data || []);
        setBoms(Array.isArray(b) ? b : b.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!user?.token) return;
    loadData();
  }, [user?.token]);

  const createOrder = async () => {
    if (!canManage) return;
    if (!form.productId || !form.bomId || !form.plannedQty) {
      alert("Completa productId, bomId y cantidad planeada.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/manufacturing/production`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user?.token}`,
        },
        body: JSON.stringify({
          productId: Number(form.productId),
          bomId: Number(form.bomId),
          plannedQty: Number(form.plannedQty),
          plannedStartDate: form.plannedStartDate || undefined,
          plannedEndDate: form.plannedEndDate || undefined,
          priority: form.priority,
          notes: form.notes || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      setForm({ productId: "", bomId: "", plannedQty: "", plannedStartDate: "", plannedEndDate: "", priority: "NORMAL", notes: "" });
      loadData();
    } catch {
      alert("No se pudo crear la orden de producción.");
    } finally {
      setSaving(false);
    }
  };

  const startOrder = async (id: number) => {
    if (!canManage) return;
    try {
      const res = await fetch(`${API_URL}/manufacturing/production/${id}/start`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (!res.ok) throw new Error();
      loadData();
    } catch {
      alert("No se pudo iniciar la orden.");
    }
  };

  const completeOrder = async (id: number) => {
    if (!canManage) return;
    const producedQty = Number(window.prompt("Cantidad producida final", "0") || "0");
    if (!producedQty) return;
    try {
      const res = await fetch(`${API_URL}/manufacturing/production/${id}/complete`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user?.token}`,
        },
        body: JSON.stringify({ producedQty }),
      });
      if (!res.ok) throw new Error();
      loadData();
    } catch {
      alert("No se pudo completar la orden.");
    }
  };

  const stats = useMemo(() => {
    const inProgress = orders.filter((o) => o.status === "IN_PROGRESS").length;
    const completed = orders.filter((o) => o.status === "COMPLETED").length;
    const planned = orders.filter((o) => o.status === "PLANNED").length;
    const totalQty = orders.reduce((s, o) => s + Number(o.plannedQty || 0), 0);
    const producedQty = orders.reduce((s, o) => s + Number(o.completedQty || 0), 0);
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
        <HelpTab module="production" user={user} />
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>🏭 Órdenes de Producción</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Planificación, seguimiento y control de órdenes de producción en planta.
          </p>
        </div>

        {canManage && (
          <div className="card" style={{ padding: 16, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
            <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--text-secondary)" }}>
              Crea una orden de producción. Selecciona un BOM y confirma cantidad, fechas y prioridad.
            </div>
            <input placeholder="ID interno del producto" value={form.productId} onChange={(e) => setForm((p) => ({ ...p, productId: e.target.value }))} />
            <select value={form.bomId} onChange={(e) => {
              const bom = boms.find((x: any) => String(x.id) === e.target.value);
              setForm((p) => ({ ...p, bomId: e.target.value, productId: bom?.productId ? String(bom.productId) : p.productId }));
            }}>
              <option value="">Selecciona BOM (lista de materiales)</option>
              {boms.map((bom: any) => (
                <option key={bom.id} value={bom.id}>#{bom.id} - {bom.name || bom.product?.name || "BOM"}</option>
              ))}
            </select>
            <input placeholder="Cantidad a producir" value={form.plannedQty} onChange={(e) => setForm((p) => ({ ...p, plannedQty: e.target.value }))} />
            <input type="date" value={form.plannedStartDate} onChange={(e) => setForm((p) => ({ ...p, plannedStartDate: e.target.value }))} />
            <input type="date" value={form.plannedEndDate} onChange={(e) => setForm((p) => ({ ...p, plannedEndDate: e.target.value }))} />
            <select value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}>
              <option value="LOW">Baja</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">Alta</option>
            </select>
            <input placeholder="Observaciones de la orden" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            <button onClick={createOrder} disabled={saving} style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
              {saving ? "Guardando..." : "Crear Orden"}
            </button>
          </div>
        )}
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
                  const plannedQty = Number(o.plannedQty || 0);
                  const completedQty = Number(o.completedQty || 0);
                  const pct = plannedQty > 0 ? Math.round((completedQty / plannedQty) * 100) : 0;
                  return (
                    <tr key={o.id}>
                      <td><strong>{o.orderNumber || `OP-${o.id}`}</strong></td>
                      <td>{o.product?.name || o.bom?.name || "—"}</td>
                      <td>{plannedQty}</td>
                      <td>{completedQty}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ flex: 1, height: 6, background: "var(--border)", borderRadius: 3, minWidth: 50 }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? "var(--success)" : "var(--primary)", borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{pct}%</span>
                        </div>
                      </td>
                      <td>{o.plannedStartDate ? new Date(o.plannedStartDate).toLocaleDateString("es-MX") : "—"}</td>
                      <td>{o.plannedEndDate ? new Date(o.plannedEndDate).toLocaleDateString("es-MX") : "—"}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span className={statusColor(o.status)}>{STATUS_LABELS[o.status] || o.status}</span>
                          {canManage && o.status === "PLANNED" && (
                            <button onClick={() => startOrder(o.id)} style={{ border: "none", borderRadius: 6, padding: "4px 8px", background: "#fef3c7", cursor: "pointer" }}>
                              Iniciar
                            </button>
                          )}
                          {canManage && o.status === "IN_PROGRESS" && (
                            <button onClick={() => completeOrder(o.id)} style={{ border: "none", borderRadius: 6, padding: "4px 8px", background: "#dcfce7", cursor: "pointer" }}>
                              Completar
                            </button>
                          )}
                        </div>
                      </td>
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
