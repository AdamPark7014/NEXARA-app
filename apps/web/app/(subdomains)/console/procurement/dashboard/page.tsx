"use client";
import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";

const PDFViewer = dynamic(() => import("@/components/PDFViewer"), { ssr: false });

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");

export default function ProcurementDashboardPage() {
  const { user } = useUser();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState<string>(new Date().toISOString().slice(0, 10));

  const loadDashboard = useCallback(() => {
    if (!user?.token) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (fromDate) params.append("fromDate", fromDate);
    if (toDate) params.append("toDate", toDate);
    
    fetch(`${API_URL}/procurement/purchase-orders/dashboard?${params.toString()}`, {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token, fromDate, toDate]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
  }, [pdfUrl]);

  const handleViewPdf = async () => {
    if (!user?.token) return;
    setGeneratingPdf(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.append("fromDate", fromDate);
      if (toDate) params.append("toDate", toDate);

      const res = await fetch(`${API_URL}/procurement/purchase-orders/dashboard/pdf?${params.toString()}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });

      if (res.ok) {
        const blob = await res.blob();
        const arrayBuffer = await blob.arrayBuffer();
        setPdfData(new Uint8Array(arrayBuffer));
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        setPdfUrl(URL.createObjectURL(blob));
        setShowPdfModal(true);
      }
    } catch (error) {
      console.error("Error generando PDF:", error);
    } finally {
      setGeneratingPdf(false);
    }
  };

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

        {/* Date Filters */}
        <div className="card" style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 12, alignItems: "end" }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Desde</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--border-color)",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Hasta</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--border-color)",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          <button
            onClick={loadDashboard}
            disabled={loading}
            style={{
              padding: "8px 16px",
              background: "var(--primary)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Cargando..." : "Filtrar"}
          </button>
          <button
            onClick={handleViewPdf}
            disabled={generatingPdf || !data}
            style={{
              padding: "8px 16px",
              background: generatingPdf ? "#999" : "#10b981",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: generatingPdf || !data ? "not-allowed" : "pointer",
              opacity: generatingPdf || !data ? 0.6 : 1,
            }}
          >
            {generatingPdf ? "Generando..." : "📄 Ver PDF"}
          </button>
        </div>

        {loading ? (
          <div className="card" style={{ padding: 32, textAlign: "center" }}>Cargando datos...</div>
        ) : (
          data && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
                <StatCard label="Requisiciones pendientes" value={data.pendingRequisitions || 0} color="#f59e0b" />
                <StatCard label="OC activas" value={data.activePurchaseOrders || 0} color="#3b82f6" />
                <StatCard label="Entregas atrasadas" value={data.overdueDeliveries || 0} color="#ef4444" />
                <StatCard label="Gasto total" value={`$${fmt(data.totalSpend)}`} color="var(--primary)" />
              </div>

              {data.topSupplierIds?.length > 0 && (
                <div className="card" style={{ padding: 16 }}>
                  <h3 style={{ marginBottom: 12 }}>Top Proveedores (por evaluación)</h3>
                  <div style={{ display: "grid", gap: 8 }}>
                    {data.topSupplierIds.map((s: any, i: number) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--bg-secondary)", borderRadius: 8 }}>
                        <span>{s.supplierName || `Proveedor #${s.supplierId}`}</span>
                        <div style={{ display: "flex", gap: 16 }}>
                          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{s.evaluationCount || 0} evaluaciones</span>
                          <span style={{ fontWeight: 700, color: s.avgScore >= 4 ? "#16a34a" : s.avgScore >= 3 ? "#f59e0b" : "#ef4444" }}>
                            ⭐ {(s.avgScore || 0).toFixed(1)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!data.topSupplierIds?.length && (
                <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--text-secondary)" }}>
                  No hay datos disponibles para el rango de fechas seleccionado.
                </div>
              )}
            </>
          )
        )}
      </div>

      {showPdfModal && pdfUrl && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setShowPdfModal(false)}
        >
          <div
            style={{ background: "var(--surface, #fff)", borderRadius: 12, width: "100%", maxWidth: 900, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontWeight: 600 }}>📦 Reporte de Compras</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setShowPdfModal(false)} style={{ padding: "6px 14px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer" }}>✕ Cerrar</button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: "auto" }}>
              <PDFViewer pdfUrl={pdfUrl} pdfData={pdfData} fileName={`reporte-compras-${new Date().toISOString().slice(0, 10)}.pdf`} height="800px" />
            </div>
          </div>
        </div>
      )}
    </RoleGuard>
  );
}
