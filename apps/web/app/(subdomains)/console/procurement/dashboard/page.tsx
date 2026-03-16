"use client";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");

export default function ProcurementDashboardPage() {
  const { user } = useUser();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.token) return;
    fetch(`${API_URL}/procurement/purchase-orders/dashboard`, {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token]);

  const fmt = (n: number) => Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 });

  const StatCard = ({ label, value, color }: { label: string; value: string | number; color: string }) => (
    <div className="card" style={{ padding: 20, textAlign: "center" }}>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 4 }}>{label}</div>
    </div>
  );

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.PROCUREMENT_VIEW, PERMISSIONS.PROCUREMENT_MANAGE]}>
      <div style={{ display: "grid", gap: 24 }}>
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>📦 Dashboard de Compras</h1>
          <p style={{ color: "var(--text-secondary)" }}>Resumen de requisiciones, órdenes de compra y proveedores.</p>
        </div>

        {loading && <div className="card" style={{ padding: 32, textAlign: "center" }}>Cargando...</div>}

        {data && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
              <StatCard label="Requisiciones pendientes" value={data.pendingRequisitions} color="#f59e0b" />
              <StatCard label="OC activas" value={data.activePurchaseOrders} color="#3b82f6" />
              <StatCard label="Entregas atrasadas" value={data.overdueDeliveries} color="#ef4444" />
              <StatCard label="Gasto total" value={`$${fmt(data.totalSpend)}`} color="var(--primary)" />
            </div>

            {data.topSupplierIds?.length > 0 && (
              <div className="card" style={{ padding: 16 }}>
                <h3 style={{ marginBottom: 12 }}>Top Proveedores (por evaluación)</h3>
                <div style={{ display: "grid", gap: 8 }}>
                  {data.topSupplierIds.map((s: any, i: number) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--bg-secondary)", borderRadius: 8 }}>
                      <span>Proveedor #{s.supplierId}</span>
                      <div style={{ display: "flex", gap: 16 }}>
                        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{s.evaluationCount} evaluaciones</span>
                        <span style={{ fontWeight: 700, color: s.avgScore >= 4 ? "#16a34a" : s.avgScore >= 3 ? "#f59e0b" : "#ef4444" }}>
                          ⭐ {s.avgScore.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </RoleGuard>
  );
}
