"use client";
import { buildApiUrl } from "@/lib/api-base";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";
import HelpTab from "@/components/HelpTab";
import { triggerBlobDownload, triggerFileDownload } from "@/lib/file-download";

const PDFViewer = dynamic(() => import("@/components/PDFViewer"), { ssr: false });

export default function FinancialReportsPage() {
  const { user } = useUser();
  const [tab, setTab] = useState<"trial" | "income" | "balance">("trial");
  const [trialBalance, setTrialBalance] = useState<any[]>([]);
  const [incomeStatement, setIncomeStatement] = useState<any>(null);
  const [balanceSheet, setBalanceSheet] = useState<any>(null);
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
  const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().slice(0, 10));

  const loadReports = () => {
    if (!user?.token) return;
    const headers = { Authorization: `Bearer ${user.token}` };
    const incomeParams = new URLSearchParams();
    if (fromDate) incomeParams.append('from', fromDate);
    if (toDate) incomeParams.append('to', toDate);
    const balanceParams = new URLSearchParams();
    if (asOfDate) balanceParams.append('asOf', asOfDate);

    setLoading(true);
    Promise.all([
      fetch(buildApiUrl(`accounting/accounts/trial-balance`), { headers }).then((r) => r.json()),
      fetch(buildApiUrl(`accounting/accounts/income-statement?${incomeParams.toString()}`), { headers }).then((r) => r.json()),
      fetch(buildApiUrl(`accounting/accounts/balance-sheet?${balanceParams.toString()}`), { headers }).then((r) => r.json()),
    ])
      .then(([trial, income, balance]) => {
        setTrialBalance(Array.isArray(trial) ? trial : []);
        setIncomeStatement(income);
        setBalanceSheet(balance);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const handleViewPdf = async () => {
    if (!user?.token) return;
    setGeneratingPdf(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.append("fromDate", fromDate);
      if (toDate) params.append("toDate", toDate);
      if (asOfDate) params.append("asOfDate", asOfDate);

      const res = await fetch(buildApiUrl(`accounting/accounts/reports/pdf?${params.toString()}`), {
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

  const handleDownloadPdf = () => {
    const name = `reportes-financieros-${new Date().toISOString().slice(0, 10)}.pdf`;
    if (pdfData?.length) {
      void triggerBlobDownload(new Blob([new Uint8Array(pdfData)], { type: "application/pdf" }), name, {
        mimeType: "application/pdf",
      });
      return;
    }
    if (!pdfUrl) return;
    void triggerFileDownload(pdfUrl, name, { preferOpenOnMobile: true, mimeType: "application/pdf" });
  };

  useEffect(() => {
    loadReports();
  }, [user?.token]);

  const fmt = (n: number) => Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 });

  const tabStyle = (t: string) => ({
    padding: "10px 16px",
    background: tab === t ? "var(--primary)" : "var(--bg-secondary)",
    color: tab === t ? "#fff" : "var(--text-primary)",
    border: "none",
    borderRadius: 8,
    fontWeight: 500 as const,
    cursor: "pointer" as const,
  });

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.ACCOUNTING_VIEW, PERMISSIONS.ACCOUNTING_MANAGE]}>
      <div style={{ display: "grid", gap: 24 }}>
        <HelpTab module="accounting-reports" user={user} />
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>📊 Reportes Financieros</h1>
          <p style={{ color: "var(--text-secondary)" }}>Balanza de comprobación, estado de resultados y balance general.</p>
        </div>

        <div className="card" style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Desde (Resultados)</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Hasta (Resultados)</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Corte Balance</label>
            <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
          </div>
          <button onClick={loadReports} disabled={loading} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Filtrando...' : '🔄 Filtrar'}
          </button>
          <button onClick={handleViewPdf} disabled={generatingPdf || loading} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: generatingPdf || loading ? '#999' : '#10b981', color: '#fff', fontWeight: 600, cursor: generatingPdf || loading ? 'not-allowed' : 'pointer', opacity: generatingPdf || loading ? 0.6 : 1 }}>
            {generatingPdf ? 'Generando...' : '📄 Ver PDF'}
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setTab("trial")} style={tabStyle("trial")}>Balanza de comprobación</button>
          <button onClick={() => setTab("income")} style={tabStyle("income")}>Estado de resultados</button>
          <button onClick={() => setTab("balance")} style={tabStyle("balance")}>Balance general</button>
        </div>

        {loading && <div className="card" style={{ padding: 32, textAlign: "center" }}>Cargando...</div>}

        {!loading && tab === "trial" && (
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 12 }}>Balanza de Comprobación</h3>
            {trialBalance.length === 0 ? (
              <p style={{ color: "var(--text-secondary)" }}>No hay datos de balanza.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border)" }}>
                      <th style={{ textAlign: "left", padding: 8 }}>Código</th>
                      <th style={{ textAlign: "left", padding: 8 }}>Cuenta</th>
                      <th style={{ textAlign: "left", padding: 8 }}>Tipo</th>
                      <th style={{ textAlign: "right", padding: 8 }}>Debe</th>
                      <th style={{ textAlign: "right", padding: 8 }}>Haber</th>
                      <th style={{ textAlign: "right", padding: 8 }}>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trialBalance.map((a: any, i: number) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: 8, fontFamily: "monospace" }}>{a.code}</td>
                        <td style={{ padding: 8 }}>{a.name}</td>
                        <td style={{ padding: 8 }}>{a.type}</td>
                        <td style={{ padding: 8, textAlign: "right" }}>${fmt(a.debit)}</td>
                        <td style={{ padding: 8, textAlign: "right" }}>${fmt(a.credit)}</td>
                        <td style={{ padding: 8, textAlign: "right", fontWeight: 600 }}>${fmt(a.debit - a.credit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!loading && tab === "income" && incomeStatement && (
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 12 }}>Estado de Resultados</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div style={{ padding: 12, background: "#dcfce7", borderRadius: 8, textAlign: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 20, color: "#16a34a" }}>${fmt(incomeStatement.totalRevenue)}</div>
                <div style={{ fontSize: 12 }}>Ingresos totales</div>
              </div>
              <div style={{ padding: 12, background: "#fee2e2", borderRadius: 8, textAlign: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 20, color: "#dc2626" }}>${fmt(incomeStatement.totalExpenses)}</div>
                <div style={{ fontSize: 12 }}>Gastos totales</div>
              </div>
              <div style={{ padding: 12, background: incomeStatement.netIncome >= 0 ? "#dbeafe" : "#fee2e2", borderRadius: 8, textAlign: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 20, color: incomeStatement.netIncome >= 0 ? "#1d4ed8" : "#dc2626" }}>
                  ${fmt(incomeStatement.netIncome)}
                </div>
                <div style={{ fontSize: 12 }}>Utilidad neta</div>
              </div>
            </div>

            {incomeStatement.revenue?.length > 0 && (
              <>
                <h4 style={{ marginBottom: 8 }}>Ingresos</h4>
                {incomeStatement.revenue.map((a: any, i: number) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                    <span>{a.code} — {a.name}</span>
                    <span style={{ fontWeight: 600, color: "#16a34a" }}>${fmt(a.amount)}</span>
                  </div>
                ))}
              </>
            )}
            {incomeStatement.expenses?.length > 0 && (
              <>
                <h4 style={{ marginTop: 16, marginBottom: 8 }}>Gastos</h4>
                {incomeStatement.expenses.map((a: any, i: number) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                    <span>{a.code} — {a.name}</span>
                    <span style={{ fontWeight: 600, color: "#dc2626" }}>${fmt(a.amount)}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {!loading && tab === "balance" && balanceSheet && (
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 12 }}>Balance General</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div style={{ padding: 12, background: "#dbeafe", borderRadius: 8, textAlign: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 18, color: "#1d4ed8" }}>${fmt(balanceSheet.totalAssets)}</div>
                <div style={{ fontSize: 12 }}>Activos</div>
              </div>
              <div style={{ padding: 12, background: "#fee2e2", borderRadius: 8, textAlign: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 18, color: "#dc2626" }}>${fmt(balanceSheet.totalLiabilities)}</div>
                <div style={{ fontSize: 12 }}>Pasivos</div>
              </div>
              <div style={{ padding: 12, background: "#dcfce7", borderRadius: 8, textAlign: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 18, color: "#16a34a" }}>${fmt(balanceSheet.totalEquity)}</div>
                <div style={{ fontSize: 12 }}>Capital</div>
              </div>
              <div style={{ padding: 12, background: balanceSheet.balanceCheck ? "#dcfce7" : "#fee2e2", borderRadius: 8, textAlign: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{balanceSheet.balanceCheck ? "✅" : "⚠️"}</div>
                <div style={{ fontSize: 12 }}>Cuadre</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <h4 style={{ marginBottom: 8 }}>Activos</h4>
                {balanceSheet.assets?.map((a: any, i: number) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                    <span>{a.code} — {a.name}</span>
                    <span style={{ fontWeight: 600 }}>${fmt(a.balance)}</span>
                  </div>
                ))}
              </div>
              <div>
                <h4 style={{ marginBottom: 8 }}>Pasivos y Capital</h4>
                {balanceSheet.liabilities?.map((a: any, i: number) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                    <span>{a.code} — {a.name}</span>
                    <span style={{ fontWeight: 600, color: "#dc2626" }}>${fmt(a.balance)}</span>
                  </div>
                ))}
                {balanceSheet.equity?.map((a: any, i: number) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                    <span>{a.code} — {a.name}</span>
                    <span style={{ fontWeight: 600, color: "#16a34a" }}>${fmt(a.balance)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {showPdfModal && pdfUrl && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setShowPdfModal(false)}
        >
          <div
            style={{
              background: "var(--surface, #fff)",
              borderRadius: 12,
              width: "100%",
              maxWidth: 900,
              maxHeight: "min(92dvh, 920px)",
              height: "min(92dvh, 920px)",
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <span style={{ fontWeight: 600 }}>📊 Reportes Financieros</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleDownloadPdf} style={{ padding: "6px 14px", background: "var(--primary)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>📥 Descargar</button>
                <button onClick={() => setShowPdfModal(false)} style={{ padding: "6px 14px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer" }}>✕ Cerrar</button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <PDFViewer
                pdfUrl={pdfUrl}
                pdfData={pdfData}
                fileName={`reportes-financieros-${new Date().toISOString().slice(0, 10)}.pdf`}
                height="800px"
                fillParent
              />
            </div>
          </div>
        </div>
      )}
    </RoleGuard>
  );
}
