"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import HelpTab from "@/components/HelpTab";
import { buildApiUrl } from "@/lib/api-base";

const emptyMov = () => ({ type: "IN", productId: "", warehouseId: "", quantity: 1, unitCost: "", reference: "", notes: "" });

interface StockLevel {
  id: number;
  productName: string;
  sku: string;
  warehouseName: string;
  quantity: number;
  minQuantity: number;
  maxQuantity: number | null;
  unitCost: number;
  product?: { id: number; name: string; sku: string };
  warehouse?: { id: number; name: string };
}

interface StockMovement {
  id: number;
  type: string;
  productName: string;
  quantity: number;
  reference: string | null;
  createdAt: string;
}

export default function StockPage() {
  const { user } = useUser();
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [warehouseFilterId, setWarehouseFilterId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"levels" | "movements" | "alerts">("levels");

  // Modal state
  const [showMovModal, setShowMovModal] = useState(false);
  const [movForm, setMovForm] = useState(emptyMov());
  const [saving, setSaving] = useState(false);

  const canManage = hasPermission(user, PERMISSIONS.STOCK_MANAGE);

  const loadData = useCallback(() => {
    if (!user?.token) return;
    const headers = { Authorization: `Bearer ${user.token}` };
    const warehouseParam = warehouseFilterId ? `warehouseId=${warehouseFilterId}` : "";
    const stockPath = (resource: "levels" | "movements") =>
      warehouseParam ? `stock/${resource}?${warehouseParam}` : `stock/${resource}`;
    setLoading(true);
    Promise.all([
      fetch(buildApiUrl(stockPath("levels")), { headers }).then((r) => r.json()),
      fetch(buildApiUrl(stockPath("movements")), { headers }).then((r) => r.json()),
      fetch(buildApiUrl(`stock/alerts/low-stock`), { headers }).then((r) => r.json()),
      fetch(buildApiUrl(`warehouse`), { headers }).then((r) => r.json()),
    ])
      .then(([l, m, a, w]) => {
        setLevels(Array.isArray(l) ? l : l.data || []);
        setMovements(Array.isArray(m) ? m : m.data || []);
        const rawAlerts = Array.isArray(a) ? a : a.data || [];
        const filteredAlerts = warehouseFilterId
          ? rawAlerts.filter((item: any) => String(item.warehouseId || item.warehouse?.id || "") === warehouseFilterId)
          : rawAlerts;
        setAlerts(filteredAlerts);
        setWarehouses(Array.isArray(w) ? w : w.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token, warehouseFilterId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Unique products and warehouses derived from levels (for selects)
  const uniqueProducts = useMemo(() => {
    const seen = new Set<number>();
    return levels.reduce<Array<{ id: number; name: string; sku: string }>>((acc, l: any) => {
      const p = l.product ?? { id: l.productId, name: l.productName, sku: l.sku };
      if (p.id && !seen.has(p.id)) { seen.add(p.id); acc.push(p); }
      return acc;
    }, []);
  }, [levels]);

  const uniqueWarehouses = useMemo(() => {
    if (warehouses.length > 0) {
      return warehouses.map((w) => ({ id: w.id, name: `${w.code} - ${w.name}` }));
    }
    const seen = new Set<number>();
    return levels.reduce<Array<{ id: number; name: string }>>((acc, l: any) => {
      const w = l.warehouse ?? { id: l.warehouseId, name: l.warehouseName };
      if (w.id && !seen.has(w.id)) { seen.add(w.id); acc.push(w); }
      return acc;
    }, []);
  }, [levels, warehouses]);

  const submitMovement = async () => {
    if (!movForm.productId || !movForm.warehouseId || !movForm.quantity) return;
    setSaving(true);
    try {
      const res = await fetch(buildApiUrl(`stock/movements`), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${user?.token}` },
        body: JSON.stringify({
          type: movForm.type,
          productId: Number(movForm.productId),
          toWarehouseId: ["IN", "ADJUSTMENT"].includes(movForm.type) ? Number(movForm.warehouseId) : undefined,
          fromWarehouseId: movForm.type === "OUT" ? Number(movForm.warehouseId) : undefined,
          quantity: Number(movForm.quantity),
          unitCost: movForm.unitCost ? Number(movForm.unitCost) : undefined,
          reference: movForm.reference || undefined,
          notes: movForm.notes || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      setShowMovModal(false);
      setMovForm(emptyMov());
      loadData();
    } catch {
      alert("Error al registrar el movimiento");
    } finally {
      setSaving(false);
    }
  };

  const stats = useMemo(() => {
    const totalItems = levels.length;
    const totalValue = levels.reduce((s, l) => s + l.quantity * l.unitCost, 0);
    const lowStock = levels.filter((l) => l.quantity <= l.minQuantity).length;
    const totalUnits = levels.reduce((s, l) => s + l.quantity, 0);
    return { totalItems, totalValue, lowStock, totalUnits };
  }, [levels]);

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
    <RoleGuard anyPermissions={[PERMISSIONS.STOCK_VIEW, PERMISSIONS.STOCK_MANAGE]}>
      <div style={{ display: "grid", gap: 24 }}>
        <HelpTab module="stock" user={user} />
        <div className="card" style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ color: "var(--primary)", marginBottom: 4 }}>📦 Inventario / Stock</h1>
            <p style={{ color: "var(--text-secondary)", margin: 0 }}>
              Niveles de inventario, movimientos de stock y alertas de reabastecimiento.
            </p>
          </div>
          {canManage && (
            <button onClick={() => setShowMovModal(true)} style={{ padding: "8px 16px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>
              + Registrar Movimiento
            </button>
          )}
        </div>

        {!loading && (
          <div className="card" style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
            <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Filtrar por almacén</label>
            <select
              value={warehouseFilterId}
              onChange={(e) => setWarehouseFilterId(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-color)", background: "var(--bg-primary)", color: "var(--text-primary)" }}>
              <option value="">Todos los almacenes</option>
              {warehouses.map((w) => (
                <option key={w.id} value={String(w.id)}>{w.code} - {w.name}</option>
              ))}
            </select>
          </div>
        )}
        {/* KPI Cards */}
        {!loading && levels.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Productos en stock</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)" }}>{stats.totalItems}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Unidades totales</p>
              <p style={{ fontSize: 24, fontWeight: 700 }}>{stats.totalUnits.toLocaleString()}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Valor de inventario</p>
              <p style={{ fontSize: 22, fontWeight: 700, color: "var(--success)" }}>${fmt(stats.totalValue)}</p>
            </div>
            <div className="card" style={{ padding: 14 }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 12 }}>Stock bajo</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: stats.lowStock > 0 ? "var(--danger)" : "var(--success)" }}>{stats.lowStock}</p>
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => setTab("levels")} style={tabStyle("levels")}>Niveles</button>
          <button onClick={() => setTab("movements")} style={tabStyle("movements")}>Movimientos</button>
          <button onClick={() => setTab("alerts")} style={tabStyle("alerts")}>⚠️ Alertas {alerts.length > 0 && `(${alerts.length})`}</button>
        </div>
        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>Cargando...</p>
        ) : tab === "levels" ? (
          levels.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>No hay niveles de stock registrados.</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Producto</th>
                    <th>Almacén</th>
                    <th>Cantidad</th>
                    <th>Mín</th>
                    <th>Máx</th>
                    <th>Costo Unit.</th>
                  </tr>
                </thead>
                <tbody>
                  {levels.map((s) => (
                    <tr key={s.id}>
                      <td><strong>{s.sku}</strong></td>
                      <td>{s.productName}</td>
                      <td>{s.warehouseName}</td>
                      <td style={{ color: s.quantity <= s.minQuantity ? "var(--danger)" : undefined }}>
                        {s.quantity}
                      </td>
                      <td>{s.minQuantity}</td>
                      <td>{s.maxQuantity ?? "—"}</td>
                      <td>${s.unitCost.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tab === "movements" ? (
          movements.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>No hay movimientos registrados.</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Producto</th>
                    <th>Cantidad</th>
                    <th>Referencia</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td><span className="badge">{m.type}</span></td>
                      <td>{m.productName}</td>
                      <td>{m.quantity}</td>
                      <td>{m.reference || "—"}</td>
                      <td>{new Date(m.createdAt).toLocaleDateString("es-MX")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          alerts.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)" }}>✅ Sin alertas de stock bajo.</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Producto</th>
                    <th>Cantidad actual</th>
                    <th>Mínimo</th>
                    <th>Déficit</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a: any, i: number) => (
                    <tr key={i}>
                      <td><strong>{a.sku}</strong></td>
                      <td>{a.productName}</td>
                      <td style={{ color: "var(--danger)" }}>{a.quantity}</td>
                      <td>{a.minQuantity}</td>
                      <td style={{ color: "var(--danger)" }}>{a.minQuantity - a.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* ── Modal: Registrar Movimiento de Stock ─────────────────────── */}
        {showMovModal && (() => {
          const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border-color)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: 14, boxSizing: "border-box" };
          const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, display: "block" };
          return (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
              <div className="card" style={{ width: "100%", maxWidth: 500, padding: 24 }}>
                <h2 style={{ color: "var(--primary)", marginBottom: 20 }}>📊 Registrar Movimiento de Stock</h2>
                <div style={{ display: "grid", gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Tipo de movimiento *</label>
                    <select style={inputStyle} value={movForm.type} onChange={(e) => setMovForm((f) => ({ ...f, type: e.target.value }))}>
                      <option value="IN">📥 Entrada</option>
                      <option value="OUT">📤 Salida</option>
                      <option value="ADJUSTMENT">🔧 Ajuste</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Producto *</label>
                    {uniqueProducts.length > 0 ? (
                      <select style={inputStyle} value={movForm.productId} onChange={(e) => setMovForm((f) => ({ ...f, productId: e.target.value }))}>
                        <option value="">— Seleccionar —</option>
                        {uniqueProducts.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                      </select>
                    ) : (
                      <input type="number" style={inputStyle} placeholder="ID del producto" value={movForm.productId} onChange={(e) => setMovForm((f) => ({ ...f, productId: e.target.value }))} />
                    )}
                  </div>
                  <div>
                    <label style={labelStyle}>{movForm.type === "OUT" ? "Almacén origen *" : "Almacén destino *"}</label>
                    {uniqueWarehouses.length > 0 ? (
                      <select style={inputStyle} value={movForm.warehouseId} onChange={(e) => setMovForm((f) => ({ ...f, warehouseId: e.target.value }))}>
                        <option value="">— Seleccionar —</option>
                        {uniqueWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                    ) : (
                      <input type="number" style={inputStyle} placeholder="ID del almacén" value={movForm.warehouseId} onChange={(e) => setMovForm((f) => ({ ...f, warehouseId: e.target.value }))} />
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Cantidad *</label>
                      <input type="number" min={1} style={inputStyle} value={movForm.quantity} onChange={(e) => setMovForm((f) => ({ ...f, quantity: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Costo unitario</label>
                      <input type="number" min={0} step="0.01" style={inputStyle} placeholder="0.00" value={movForm.unitCost} onChange={(e) => setMovForm((f) => ({ ...f, unitCost: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Referencia</label>
                    <input style={inputStyle} placeholder="Ej. OC-001, Factura #123" value={movForm.reference} onChange={(e) => setMovForm((f) => ({ ...f, reference: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Notas</label>
                    <textarea style={{ ...inputStyle, minHeight: 56, resize: "vertical" }} placeholder="Observaciones..." value={movForm.notes} onChange={(e) => setMovForm((f) => ({ ...f, notes: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
                  <button onClick={() => { setShowMovModal(false); setMovForm(emptyMov()); }} style={{ padding: "8px 20px", background: "var(--bg-secondary)", color: "var(--text-primary)", border: "none", borderRadius: 8, cursor: "pointer" }}>Cancelar</button>
                  <button onClick={submitMovement} disabled={saving} style={{ padding: "8px 20px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>
                    {saving ? "Guardando..." : "Registrar"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </RoleGuard>
  );
}
