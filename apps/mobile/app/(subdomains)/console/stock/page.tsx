"use client";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");

import { useMemo } from "react";

interface StockLevel {
  id: number;
  productName: string;
  sku: string;
  warehouseName: string;
  quantity: number;
  minQuantity: number;
  maxQuantity: number | null;
  unitCost: number;
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
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"levels" | "movements" | "alerts">("levels");

  useEffect(() => {
    if (!user?.token) return;
    const headers = { Authorization: `Bearer ${user.token}` };
    Promise.all([
      fetch(`${API_URL}/stock/levels`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/stock/movements`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/stock/alerts/low-stock`, { headers }).then((r) => r.json()),
    ])
      .then(([l, m, a]) => {
        setLevels(Array.isArray(l) ? l : l.data || []);
        setMovements(Array.isArray(m) ? m : m.data || []);
        setAlerts(Array.isArray(a) ? a : a.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token]);

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
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>📦 Inventario / Stock</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Niveles de inventario, movimientos de stock y alertas de reabastecimiento.
          </p>
        </div>

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
          <button onClick={() => setTab("alerts")} style={tabStyle("alerts")}>
            ⚠️ Alertas {alerts.length > 0 && `(${alerts.length})`}
          </button>
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
      </div>
    </RoleGuard>
  );
}
