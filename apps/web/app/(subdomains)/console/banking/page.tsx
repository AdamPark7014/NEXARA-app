"use client";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";
import HelpTab from "@/components/HelpTab";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");

export default function BankingPage() {
  const { user } = useUser();
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [speiSearch, setSpeiSearch] = useState("");
  const [speiResult, setSpeiResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTx, setLoadingTx] = useState(false);

  const headers = { Authorization: `Bearer ${user?.token}` };

  useEffect(() => {
    if (!user?.token) return;
    fetch(`${API_URL}/accounting/banking/accounts`, { headers })
        <HelpTab module="banking" user={user} />
      .then((r) => r.json())
      .then((d) => setBankAccounts(Array.isArray(d) ? d : d.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token]);

  const loadAccount = (accountId: number) => {
    setSelectedAccount(accountId);
    setLoadingTx(true);
    Promise.all([
      fetch(`${API_URL}/accounting/banking/accounts/${accountId}/summary`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/accounting/banking/accounts/${accountId}/transactions`, { headers }).then((r) => r.json()),
    ])
      .then(([sum, txs]) => {
        setSummary(sum);
        setTransactions(Array.isArray(txs) ? txs : txs.data || []);
      })
      .catch(() => {})
      .finally(() => setLoadingTx(false));
  };

  const searchSpei = () => {
    if (!speiSearch.trim()) return;
    fetch(`${API_URL}/accounting/banking/spei/${encodeURIComponent(speiSearch.trim())}`, { headers })
      .then((r) => r.ok ? r.json() : null)
      .then(setSpeiResult)
      .catch(() => setSpeiResult(null));
  };

  const fmt = (n: number) => Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 });

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.BANKING_VIEW, PERMISSIONS.BANKING_MANAGE]}>
      <div style={{ display: "grid", gap: 24 }}>
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>🏦 Banca — Banorte & SPEI</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Cuentas Banorte, movimientos SPEI, clave de rastreo, conciliación bancaria y CEP.
          </p>
        </div>

        {/* SPEI Search */}
        <div className="card" style={{ padding: 16 }}>
          <h4 style={{ color: "var(--primary)", marginBottom: 8 }}>Buscar transacción SPEI</h4>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Clave de rastreo SPEI..."
              value={speiSearch}
              onChange={(e) => setSpeiSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchSpei()}
              style={{ flex: 1, minWidth: 200, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
            />
            <button onClick={searchSpei} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
              Buscar
            </button>
          </div>
          {speiResult && (
            <div style={{ marginTop: 12, padding: 12, background: "var(--bg-secondary, #f8f9fa)", borderRadius: 8 }}>
              <p><strong>Clave rastreo:</strong> <span style={{ fontFamily: "monospace" }}>{speiResult.speiTrackingKey}</span></p>
              <p><strong>Cuenta:</strong> {speiResult.bankAccount?.bankName} — {speiResult.bankAccount?.accountNumber}</p>
              <p><strong>Monto:</strong> <span style={{ fontWeight: 700 }}>${fmt(speiResult.amount)}</span> ({speiResult.isDebit ? "Cargo" : "Abono"})</p>
              <p><strong>Contraparte:</strong> {speiResult.counterpartyName || "—"} (RFC: {speiResult.counterpartyRfc || "—"})</p>
              <p><strong>CLABE contraparte:</strong> <span style={{ fontFamily: "monospace" }}>{speiResult.counterpartyClabe || "—"}</span></p>
              <p><strong>Banco contraparte:</strong> {speiResult.counterpartyBank || "—"}</p>
              <p><strong>Concepto:</strong> {speiResult.concept || speiResult.description || "—"}</p>
              <p><strong>Conciliado:</strong> {speiResult.reconciliation ? "Sí" : "No"}</p>
            </div>
          )}
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>Cargando...</p>
        ) : bankAccounts.length === 0 ? (
          <div className="card" style={{ padding: 24, textAlign: "center" }}>
            <p style={{ color: "var(--text-secondary)" }}>No hay cuentas bancarias registradas.</p>
          </div>
        ) : (
          <>
            {/* Bank Account cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
              {bankAccounts.map((ba: any) => (
                <div
                  key={ba.id}
                  className="card"
                  style={{
                    padding: 16,
                    cursor: "pointer",
                    border: selectedAccount === ba.id ? "2px solid var(--primary)" : "2px solid transparent",
                  }}
                  onClick={() => loadAccount(ba.id)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ color: "var(--primary)", marginBottom: 4 }}>{ba.bankName}</h3>
                    {ba.speiEnabled && <span className="badge" style={{ fontSize: 11 }}>SPEI</span>}
                  </div>
                  <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Cuenta: {ba.accountNumber}</p>
                  {ba.clabe && <p style={{ fontFamily: "monospace", fontSize: 13, color: "var(--text-secondary)" }}>CLABE: {ba.clabe}</p>}
                  {ba.bankCode && <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>Código banco: {ba.bankCode} {ba.branch ? `· Suc. ${ba.branch}` : ""}</p>}
                  {ba.rfc && <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>RFC: {ba.rfc}</p>}
                  <p style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>
                    ${fmt(ba.currentBalance)} <span style={{ fontSize: 14, fontWeight: 400 }}>{ba.currency || "MXN"}</span>
                  </p>
                  {ba.accountType && <span className="badge" style={{ marginTop: 4 }}>{ba.accountType}</span>}
                </div>
              ))}
            </div>

            {/* Account Summary + Transactions */}
            {selectedAccount && (
              <div style={{ display: "grid", gap: 16 }}>
                {/* Month summary */}
                {summary && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
                    <div className="card" style={{ padding: 16 }}>
                      <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Ingresos del mes</p>
                      <p style={{ fontSize: 20, fontWeight: 700, color: "var(--success)" }}>${fmt(summary.monthCredits)}</p>
                    </div>
                    <div className="card" style={{ padding: 16 }}>
                      <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Egresos del mes</p>
                      <p style={{ fontSize: 20, fontWeight: 700, color: "var(--danger)" }}>${fmt(summary.monthDebits)}</p>
                    </div>
                    <div className="card" style={{ padding: 16 }}>
                      <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Neto del mes</p>
                      <p style={{ fontSize: 20, fontWeight: 700, color: summary.monthNet >= 0 ? "var(--success)" : "var(--danger)" }}>${fmt(summary.monthNet)}</p>
                    </div>
                    <div className="card" style={{ padding: 16 }}>
                      <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Sin conciliar</p>
                      <p style={{ fontSize: 20, fontWeight: 700, color: "var(--warning)" }}>{summary.unreconciledCount}</p>
                    </div>
                  </div>
                )}

                <h2 style={{ color: "var(--primary)" }}>Movimientos bancarios</h2>
                {loadingTx ? (
                  <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>Cargando movimientos...</p>
                ) : transactions.length === 0 ? (
                  <div className="card" style={{ padding: 24, textAlign: "center" }}>
                    <p style={{ color: "var(--text-secondary)" }}>Sin movimientos en esta cuenta.</p>
                  </div>
                ) : (
                  <div className="card" style={{ overflow: "auto" }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Descripción</th>
                          <th>Concepto</th>
                          <th>Clave SPEI</th>
                          <th>Contraparte</th>
                          <th>RFC</th>
                          <th>Monto</th>
                          <th>Conciliado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map((tx: any) => (
                          <tr key={tx.id}>
                            <td>{new Date(tx.transactionDate).toLocaleDateString("es-MX")}</td>
                            <td>{tx.description}</td>
                            <td>{tx.concept || "—"}</td>
                            <td style={{ fontFamily: "monospace", fontSize: 12 }}>{tx.speiTrackingKey || "—"}</td>
                            <td>{tx.counterpartyName || "—"}</td>
                            <td style={{ fontFamily: "monospace", fontSize: 12 }}>{tx.counterpartyRfc || "—"}</td>
                            <td style={{ color: tx.isDebit ? "var(--danger)" : "var(--success)", fontWeight: 600 }}>
                              {tx.isDebit ? "-" : "+"}${fmt(tx.amount)}
                            </td>
                            <td>
                              <span className={tx.reconciliation ? "status-active" : "status-pending"}>
                                {tx.reconciliation ? "Sí" : "No"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </RoleGuard>
  );
}
