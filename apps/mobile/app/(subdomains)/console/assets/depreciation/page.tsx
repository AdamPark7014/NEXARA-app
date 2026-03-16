"use client";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";
import HelpTab from '../../../../../components/HelpTab';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");

export default function DepreciationPage() {
  const { user } = useUser();
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.token) return;
    fetch(`${API_URL}/maintenance/assets/depreciation/summary`, {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((r) => r.json())
      .then(setSummary)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token]);

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.ASSETS_VIEW, PERMISSIONS.ASSETS_MANAGE]}>
      <div style={{ display: "grid", gap: 24 }}>
        <HelpTab module="assets-depreciation" user={user} />
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>📉 Depreciación de Activos</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Cálculo de depreciación en línea recta para todos los activos con valores asignados.
          </p>
        </div>

        {loading && <div className="card" style={{ padding: 32, textAlign: "center" }}>Cargando...</div>}

        {!loading && summary && (
          <>
            {/* Summary KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {[
                { label: "Activos evaluados", value: summary.totalAssets, color: "#3b82f6" },
                { label: "Costo original total", value: `$${summary.totalOriginalCost?.toLocaleString()}`, color: "#8b5cf6" },
                { label: "Valor en libros", value: `$${summary.totalBookValue?.toLocaleString()}`, color: "#10b981" },
                { label: "Depreciación acumulada", value: `$${summary.totalDepreciated?.toLocaleString()}`, color: "#ef4444" },
              ].map((kpi) => (
                <div key={kpi.label} className="card" style={{ padding: 16, borderLeft: `4px solid ${kpi.color}` }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{kpi.label}</div>
                </div>
              ))}
            </div>

            {/* Table */}
            <div className="card" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg-secondary)" }}>
                    <th style={{ padding: 10, textAlign: "left" }}>Código</th>
                    <th style={{ padding: 10, textAlign: "left" }}>Nombre</th>
                    <th style={{ padding: 10, textAlign: "right" }}>Costo original</th>
                    <th style={{ padding: 10, textAlign: "right" }}>Valor en libros</th>
                    <th style={{ padding: 10, textAlign: "right" }}>Depreciado</th>
                    <th style={{ padding: 10, textAlign: "center" }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {(summary.items || []).length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>
                        No hay activos con datos de depreciación
                      </td>
                    </tr>
                  )}
                  {(summary.items || []).map((item: any) => (
                    <tr key={item.assetId} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: 10, fontFamily: "monospace" }}>{item.code}</td>
                      <td style={{ padding: 10 }}>{item.name}</td>
                      <td style={{ padding: 10, textAlign: "right" }}>${item.purchaseCost?.toLocaleString()}</td>
                      <td style={{ padding: 10, textAlign: "right", fontWeight: 600, color: item.currentBookValue > 0 ? "#10b981" : "#6b7280" }}>
                        ${item.currentBookValue?.toLocaleString()}
                      </td>
                      <td style={{ padding: 10, textAlign: "right", color: "#ef4444" }}>${item.depreciated?.toLocaleString()}</td>
                      <td style={{ padding: 10, textAlign: "center" }}>
                        <span
                          style={{
                            padding: "2px 10px",
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 600,
                            background: item.fullyDepreciated ? "#ef444422" : "#10b98122",
                            color: item.fullyDepreciated ? "#ef4444" : "#10b981",
                          }}
                        >
                          {item.fullyDepreciated ? "Depreciado" : "Activo"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </RoleGuard>
  );
}
