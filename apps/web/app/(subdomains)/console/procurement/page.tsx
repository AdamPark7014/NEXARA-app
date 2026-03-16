"use client";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import HelpTab from '@/components/HelpTab';
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { useMemo } from "react";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");

export default function ProcurementPage() {
  const { user } = useUser();
  const [requisitions, setRequisitions] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"requisitions" | "orders" | "suppliers">("requisitions");

  const canManage = hasPermission(user, PERMISSIONS.PROCUREMENT_MANAGE);

  useEffect(() => {
    if (!user?.token) return;
    const headers = { Authorization: `Bearer ${user.token}` };
    Promise.all([
      fetch(`${API_URL}/procurement/requisitions`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/procurement/purchase-orders`, { headers }).then((r) => r.json()),
    ])
      .then(([req, ord]) => {
        setRequisitions(Array.isArray(req) ? req : req.data || []);
        setOrders(Array.isArray(ord) ? ord : ord.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token]);

  const stats = useMemo(() => {
    const pendingReq = requisitions.filter((r) => r.status === "PENDING").length;
    const approvedReq = requisitions.filter((r) => r.status === "APPROVED").length;
    const totalOrders = orders.length;
    const orderValue = orders.reduce((s: number, o: any) => s + Number(o.totalAmount || 0), 0);
    return { totalReq: requisitions.length, pendingReq, approvedReq, totalOrders, orderValue };
  }, [requisitions, orders]);

  const fmt = (n: number) => Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 });

  const tabStyle = (t: string) => ({
    padding: "10px 16px",
    background: tab === t ? "var(--primary)" : "var(--bg-secondary)",
    color: tab === t ? "#fff" : "var(--text-primary)",
    border: "none",
    borderRadius: 8,
    fontWeight: 500,
    cursor: "pointer",
  });

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.PROCUREMENT_VIEW, PERMISSIONS.PROCUREMENT_MANAGE]}>
      <div style={{ display: "grid", gap: 24 }}>
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>🛒 Compras y Requisiciones</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Requisiciones de compra, órdenes de compra y evaluación de proveedores.
          </p>
        </div>

        {/* KPI Cards */}
        {!loading && (requisitions.length > 0 || orders.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Requisiciones</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)" }}>{stats.totalReq}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Pendientes aprobación</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--warning)" }}>{stats.pendingReq}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Órdenes de compra</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)" }}>{stats.totalOrders}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Valor total OC</p>
              <p style={{ fontSize: 22, fontWeight: 700, color: "var(--success)" }}>${fmt(stats.orderValue)}</p>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => setTab("requisitions")} style={tabStyle("requisitions")}>
            📋 Requisiciones
          </button>
          <button onClick={() => setTab("orders")} style={tabStyle("orders")}>
            📦 Órdenes de Compra
          </button>
          <button onClick={() => setTab("suppliers")} style={tabStyle("suppliers")}>
            🏢 Proveedores
          </button>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>Cargando...</p>
        ) : tab === "requisitions" ? (
          requisitions.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>No hay requisiciones registradas.</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Solicitante</th>
                    <th>Departamento</th>
                    <th>Prioridad</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {requisitions.map((r: any) => (
                    <tr key={r.id}>
                      <td><strong>REQ-{r.id}</strong></td>
                      <td>{r.requestedBy?.nombre || r.requestedById}</td>
                      <td>{r.department || "—"}</td>
                      <td><span className="badge">{r.priority}</span></td>
                      <td>
                        <span className={`status-${r.status === "APPROVED" ? "active" : r.status === "REJECTED" ? "inactive" : "pending"}`}>
                          {r.status}
                        </span>
                      </td>
                      <td>{new Date(r.createdAt).toLocaleDateString("es-MX")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tab === "orders" ? (
          orders.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>No hay órdenes de compra.</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>OC #</th>
                    <th>Proveedor</th>
                    <th>Total</th>
                    <th>Estado</th>
                    <th>Entrega esperada</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o: any) => (
                    <tr key={o.id}>
                      <td><strong>OC-{o.id}</strong></td>
                      <td>{o.supplierName}</td>
                      <td>${Number(o.totalAmount || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                      <td>
                        <span className={`status-${o.status === "APPROVED" ? "active" : o.status === "CANCELLED" ? "inactive" : "pending"}`}>
                          {o.status}
                        </span>
                      </td>
                      <td>{o.expectedDelivery ? new Date(o.expectedDelivery).toLocaleDateString("es-MX") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="card" style={{ padding: 24, textAlign: "center" }}>
            <p style={{ color: "var(--text-secondary)" }}>Módulo de evaluación de proveedores disponible próximamente.</p>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
