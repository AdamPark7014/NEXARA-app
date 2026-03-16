"use client";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");

export default function FinancialReportsPage() {
  const { user } = useUser();
  const [tab, setTab] = useState<"trial" | "income" | "balance">("trial");
  const [trialBalance, setTrialBalance] = useState<any[]>([]);
  const [incomeStatement, setIncomeStatement] = useState<any>(null);
  const [balanceSheet, setBalanceSheet] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.token) return;
    const headers = { Authorization: `Bearer ${user.token}` };
    Promise.all([
      fetch(`${API_URL}/accounting/accounts/trial-balance`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/accounting/accounts/income-statement`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/accounting/accounts/balance-sheet`, { headers }).then((r) => r.json()),
    ])
      .then(([trial, income, balance]) => {
        setTrialBalance(Array.isArray(trial) ? trial : []);
        setIncomeStatement(income);
        setBalanceSheet(balance);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
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
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>📊 Reportes Financieros</h1>
          <p style={{ color: "var(--text-secondary)" }}>Balanza de comprobación, estado de resultados y balance general.</p>
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
    </RoleGuard>
  );
}
