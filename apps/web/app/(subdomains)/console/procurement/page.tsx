"use client";
import { useEffect, useState, useCallback } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import HelpTab from '@/components/HelpTab';
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { useMemo } from "react";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");

const emptyReqForm = () => ({
  title: "",
  description: "",
  priority: "NORMAL",
  requiredDate: "",
  items: [{ description: "", quantity: 1, estimatedCost: "" }],
});

const emptyOCForm = () => ({
  supplierName: "",
  orderDate: new Date().toISOString().slice(0, 10),
  expectedDate: "",
  notes: "",
  items: [{ description: "", quantity: 1, unitPrice: "" }],
});

export default function ProcurementPage() {
  const { user } = useUser();
  const [requisitions, setRequisitions] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"requisitions" | "orders" | "suppliers">("requisitions");

  // Modals
  const [showReqModal, setShowReqModal] = useState(false);
  const [showOCModal, setShowOCModal] = useState(false);
  const [reqForm, setReqForm] = useState(emptyReqForm());
  const [ocForm, setOCForm] = useState(emptyOCForm());
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const canManage = hasPermission(user, PERMISSIONS.PROCUREMENT_MANAGE);
  const canRequest = hasPermission(user, PERMISSIONS.PROCUREMENT_REQUEST) || canManage;
  const canApprove = hasPermission(user, PERMISSIONS.PROCUREMENT_APPROVE) || canManage;

  const loadData = useCallback(() => {
    if (!user?.token) return;
    const headers = { Authorization: `Bearer ${user.token}` };
    setLoading(true);
    Promise.all([
      fetch(`${API_URL}/procurement/requisitions`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/procurement/purchase-orders`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/procurement/purchase-orders/suppliers`, { headers }).then((r) => r.json()),
    ])
      .then(([req, ord, sup]) => {
        setRequisitions(Array.isArray(req) ? req : req.data || []);
        setOrders(Array.isArray(ord) ? ord : ord.data || []);
        setSuppliers(Array.isArray(sup) ? sup : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Requisition form handlers ─────────────────────────────────────
  const updateReqItem = (idx: number, field: string, value: any) => {
    setReqForm((f) => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [field]: value };
      return { ...f, items };
    });
  };
  const addReqItem = () => setReqForm((f) => ({ ...f, items: [...f.items, { description: "", quantity: 1, estimatedCost: "" }] }));
  const removeReqItem = (idx: number) => setReqForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const submitRequisition = async () => {
    if (!reqForm.title.trim() || reqForm.items.some((i) => !i.description.trim())) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/procurement/requisitions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${user?.token}` },
        body: JSON.stringify({
          title: reqForm.title,
          description: reqForm.description || undefined,
          priority: reqForm.priority,
          requiredDate: reqForm.requiredDate || undefined,
          items: reqForm.items.map((i) => ({
            description: i.description,
            quantity: Number(i.quantity),
            estimatedCost: i.estimatedCost ? Number(i.estimatedCost) : undefined,
          })),
        }),
      });
      if (!res.ok) throw new Error();
      setShowReqModal(false);
      setReqForm(emptyReqForm());
      loadData();
    } catch {
      alert("Error al crear la requisición");
    } finally {
      setSaving(false);
    }
  };

  // ── Purchase Order form handlers ──────────────────────────────────
  const updateOCItem = (idx: number, field: string, value: any) => {
    setOCForm((f) => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [field]: value };
      return { ...f, items };
    });
  };
  const addOCItem = () => setOCForm((f) => ({ ...f, items: [...f.items, { description: "", quantity: 1, unitPrice: "" }] }));
  const removeOCItem = (idx: number) => setOCForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const submitOC = async () => {
    if (!ocForm.supplierName.trim() || ocForm.items.some((i) => !i.description.trim() || !i.unitPrice)) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/procurement/purchase-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${user?.token}` },
        body: JSON.stringify({
          supplierName: ocForm.supplierName,
          orderDate: ocForm.orderDate,
          expectedDate: ocForm.expectedDate || undefined,
          notes: ocForm.notes || undefined,
          items: ocForm.items.map((i) => ({
            description: i.description,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
          })),
        }),
      });
      if (!res.ok) throw new Error();
      setShowOCModal(false);
      setOCForm(emptyOCForm());
      loadData();
    } catch {
      alert("Error al crear la orden de compra");
    } finally {
      setSaving(false);
    }
  };

  // ── Row actions ───────────────────────────────────────────────────
  const approveReq = async (id: number) => {
    if (!confirm("¿Aprobar esta requisición?")) return;
    setActionLoading(id);
    try {
      await fetch(`${API_URL}/procurement/requisitions/${id}/approve`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      loadData();
    } catch {} finally { setActionLoading(null); }
  };

  const rejectReq = async (id: number) => {
    const reason = prompt("Motivo de rechazo:");
    if (reason === null) return;
    setActionLoading(id);
    try {
      await fetch(`${API_URL}/procurement/requisitions/${id}/reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${user?.token}` },
        body: JSON.stringify({ reason }),
      });
      loadData();
    } catch {} finally { setActionLoading(null); }
  };

  const stats = useMemo(() => {
    const pendingReq = requisitions.filter((r) => r.status === "PENDING").length;
    const approvedReq = requisitions.filter((r) => r.status === "APPROVED").length;
    const totalOrders = orders.length;
    const orderValue = orders.reduce((s: number, o: any) => s + Number(o.totalAmount || 0), 0);
    return { totalReq: requisitions.length, pendingReq, approvedReq, totalOrders, orderValue };
  }, [requisitions, orders]);

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

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 6,
    border: "1px solid var(--border-color)", background: "var(--bg-primary)",
    color: "var(--text-primary)", fontSize: 14, boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, display: "block" };

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.PROCUREMENT_VIEW, PERMISSIONS.PROCUREMENT_MANAGE]}>
      <div style={{ display: "grid", gap: 24 }}>
        {/* Header */}
        <div className="card" style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ color: "var(--primary)", marginBottom: 4 }}>🛒 Compras y Requisiciones</h1>
            <p style={{ color: "var(--text-secondary)", margin: 0 }}>
              Requisiciones de compra, órdenes de compra y evaluación de proveedores.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {canRequest && (
              <button onClick={() => setShowReqModal(true)} style={{ padding: "8px 16px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>
                + Nueva Requisición
              </button>
            )}
            {canManage && (
              <button onClick={() => setShowOCModal(true)} style={{ padding: "8px 16px", background: "var(--success)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>
                + Nueva OC
              </button>
            )}
          </div>
        </div>

        {/* KPI Cards */}
        {!loading && (
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

        {/* Tabs */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => setTab("requisitions")} style={tabStyle("requisitions")}>📋 Requisiciones</button>
          <button onClick={() => setTab("orders")} style={tabStyle("orders")}>📦 Órdenes de Compra</button>
          <button onClick={() => setTab("suppliers")} style={tabStyle("suppliers")}>🏢 Proveedores</button>
        </div>

        {/* Content */}
        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>Cargando...</p>
        ) : tab === "requisitions" ? (
          requisitions.length === 0 ? (
            <div className="card" style={{ padding: 32, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)", marginBottom: 12 }}>No hay requisiciones registradas.</p>
              {canRequest && (
                <button onClick={() => setShowReqModal(true)} style={{ padding: "8px 16px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>
                  + Crear primera requisición
                </button>
              )}
            </div>
          ) : (
            <div className="card" style={{ overflow: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Título</th>
                    <th>Solicitante</th>
                    <th>Prioridad</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                    {canApprove && <th>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {requisitions.map((r: any) => (
                    <tr key={r.id}>
                      <td><strong>REQ-{r.id}</strong></td>
                      <td>{r.title}</td>
                      <td>{r.requestedBy?.nombre || r.requestedById}</td>
                      <td><span className="badge">{r.priority}</span></td>
                      <td>
                        <span className={`status-${r.status === "APPROVED" ? "active" : r.status === "REJECTED" ? "inactive" : "pending"}`}>
                          {r.status}
                        </span>
                      </td>
                      <td>{new Date(r.createdAt).toLocaleDateString("es-MX")}</td>
                      {canApprove && (
                        <td>
                          {r.status === "PENDING" && (
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                onClick={() => approveReq(r.id)}
                                disabled={actionLoading === r.id}
                                style={{ padding: "4px 10px", background: "var(--success)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
                                ✓ Aprobar
                              </button>
                              <button
                                onClick={() => rejectReq(r.id)}
                                disabled={actionLoading === r.id}
                                style={{ padding: "4px 10px", background: "var(--danger)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
                                ✗ Rechazar
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tab === "orders" ? (
          orders.length === 0 ? (
            <div className="card" style={{ padding: 32, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)", marginBottom: 12 }}>No hay órdenes de compra.</p>
              {canManage && (
                <button onClick={() => setShowOCModal(true)} style={{ padding: "8px 16px", background: "var(--success)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>
                  + Crear primera OC
                </button>
              )}
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
                      <td>{o.supplierName || o.supplier?.name || "—"}</td>
                      <td>${Number(o.totalAmount || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                      <td>
                        <span className={`status-${o.status === "APPROVED" ? "active" : o.status === "CANCELLED" ? "inactive" : "pending"}`}>
                          {o.status}
                        </span>
                      </td>
                      <td>{o.expectedDate ? new Date(o.expectedDate).toLocaleDateString("es-MX") : "—"}</td>
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

        {/* ── Modal: Nueva Requisición ─────────────────────────────────── */}
        {showReqModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div className="card" style={{ width: "100%", maxWidth: 600, maxHeight: "90vh", overflow: "auto", padding: 24 }}>
              <h2 style={{ color: "var(--primary)", marginBottom: 20 }}>📋 Nueva Requisición</h2>

              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Título *</label>
                  <input style={inputStyle} value={reqForm.title} onChange={(e) => setReqForm((f) => ({ ...f, title: e.target.value }))} placeholder="Ej. Compra de suministros de oficina" />
                </div>
                <div>
                  <label style={labelStyle}>Descripción</label>
                  <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={reqForm.description} onChange={(e) => setReqForm((f) => ({ ...f, description: e.target.value }))} placeholder="Detalles adicionales..." />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Prioridad</label>
                    <select style={inputStyle} value={reqForm.priority} onChange={(e) => setReqForm((f) => ({ ...f, priority: e.target.value }))}>
                      <option value="URGENT">🔴 Urgente</option>
                      <option value="HIGH">🟠 Alta</option>
                      <option value="NORMAL">🟡 Normal</option>
                      <option value="LOW">🟢 Baja</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Fecha requerida</label>
                    <input type="date" style={inputStyle} value={reqForm.requiredDate} onChange={(e) => setReqForm((f) => ({ ...f, requiredDate: e.target.value }))} />
                  </div>
                </div>

                {/* Items */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Artículos *</label>
                    <button onClick={addReqItem} style={{ padding: "4px 10px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>+ Agregar</button>
                  </div>
                  {reqForm.items.map((item, idx) => (
                    <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 80px 110px 32px", gap: 8, marginBottom: 8, alignItems: "end" }}>
                      <div>
                        {idx === 0 && <label style={labelStyle}>Descripción</label>}
                        <input style={inputStyle} value={item.description} onChange={(e) => updateReqItem(idx, "description", e.target.value)} placeholder="Descripción del artículo" />
                      </div>
                      <div>
                        {idx === 0 && <label style={labelStyle}>Cant.</label>}
                        <input type="number" min={1} style={inputStyle} value={item.quantity} onChange={(e) => updateReqItem(idx, "quantity", e.target.value)} />
                      </div>
                      <div>
                        {idx === 0 && <label style={labelStyle}>Costo est.</label>}
                        <input type="number" min={0} step="0.01" style={inputStyle} value={item.estimatedCost} onChange={(e) => updateReqItem(idx, "estimatedCost", e.target.value)} placeholder="0.00" />
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-end" }}>
                        {reqForm.items.length > 1 && (
                          <button onClick={() => removeReqItem(idx)} style={{ padding: "8px", background: "var(--danger)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", lineHeight: 1 }}>✕</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
                <button onClick={() => { setShowReqModal(false); setReqForm(emptyReqForm()); }} style={{ padding: "8px 20px", background: "var(--bg-secondary)", color: "var(--text-primary)", border: "none", borderRadius: 8, cursor: "pointer" }}>
                  Cancelar
                </button>
                <button onClick={submitRequisition} disabled={saving} style={{ padding: "8px 20px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>
                  {saving ? "Guardando..." : "Crear Requisición"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal: Nueva Orden de Compra ─────────────────────────────── */}
        {showOCModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div className="card" style={{ width: "100%", maxWidth: 640, maxHeight: "90vh", overflow: "auto", padding: 24 }}>
              <h2 style={{ color: "var(--success)", marginBottom: 20 }}>📦 Nueva Orden de Compra</h2>

              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Proveedor *</label>
                  <input
                    list="suppliers-list"
                    style={inputStyle}
                    value={ocForm.supplierName}
                    onChange={(e) => setOCForm((f) => ({ ...f, supplierName: e.target.value }))}
                    placeholder="Nombre del proveedor (existente o nuevo)"
                  />
                  <datalist id="suppliers-list">
                    {suppliers.map((s) => <option key={s.id} value={s.name} />)}
                  </datalist>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Fecha de orden *</label>
                    <input type="date" style={inputStyle} value={ocForm.orderDate} onChange={(e) => setOCForm((f) => ({ ...f, orderDate: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Entrega esperada</label>
                    <input type="date" style={inputStyle} value={ocForm.expectedDate} onChange={(e) => setOCForm((f) => ({ ...f, expectedDate: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Notas</label>
                  <textarea style={{ ...inputStyle, minHeight: 56, resize: "vertical" }} value={ocForm.notes} onChange={(e) => setOCForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Condiciones, observaciones..." />
                </div>

                {/* Items */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Artículos *</label>
                    <button onClick={addOCItem} style={{ padding: "4px 10px", background: "var(--success)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>+ Agregar</button>
                  </div>
                  {ocForm.items.map((item, idx) => (
                    <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px 32px", gap: 8, marginBottom: 8, alignItems: "end" }}>
                      <div>
                        {idx === 0 && <label style={labelStyle}>Descripción</label>}
                        <input style={inputStyle} value={item.description} onChange={(e) => updateOCItem(idx, "description", e.target.value)} placeholder="Artículo o servicio" />
                      </div>
                      <div>
                        {idx === 0 && <label style={labelStyle}>Cant.</label>}
                        <input type="number" min={1} style={inputStyle} value={item.quantity} onChange={(e) => updateOCItem(idx, "quantity", e.target.value)} />
                      </div>
                      <div>
                        {idx === 0 && <label style={labelStyle}>Precio unit. *</label>}
                        <input type="number" min={0} step="0.01" style={inputStyle} value={item.unitPrice} onChange={(e) => updateOCItem(idx, "unitPrice", e.target.value)} placeholder="0.00" />
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-end" }}>
                        {ocForm.items.length > 1 && (
                          <button onClick={() => removeOCItem(idx)} style={{ padding: "8px", background: "var(--danger)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", lineHeight: 1 }}>✕</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
                <button onClick={() => { setShowOCModal(false); setOCForm(emptyOCForm()); }} style={{ padding: "8px 20px", background: "var(--bg-secondary)", color: "var(--text-primary)", border: "none", borderRadius: 8, cursor: "pointer" }}>
                  Cancelar
                </button>
                <button onClick={submitOC} disabled={saving} style={{ padding: "8px 20px", background: "var(--success)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>
                  {saving ? "Guardando..." : "Crear Orden de Compra"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
