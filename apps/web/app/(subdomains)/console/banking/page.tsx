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
  const [loadError, setLoadError] = useState<string>("");
  const [speiSearch, setSpeiSearch] = useState("");
  const [speiResult, setSpeiResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTx, setLoadingTx] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accountForm, setAccountForm] = useState({
    name: '',
    bankName: '',
    accountNumber: '',
    clabe: '',
    currency: 'MXN',
    bankCode: '',
    rfc: '',
    accountType: '',
    branch: '',
    speiEnabled: true,
  });
  const [txForm, setTxForm] = useState({
    transactionDate: new Date().toISOString().slice(0, 10),
    description: '',
    amount: '',
    isDebit: false,
    speiTrackingKey: '',
    counterpartyName: '',
    counterpartyRfc: '',
    concept: '',
  });

  const headers = { Authorization: `Bearer ${user?.token}` };

  const loadAccount = (accountId: number) => {
    setSelectedAccount(accountId);
    setLoadingTx(true);
    setLoadError("");
    Promise.all([
      fetch(`${API_URL}/accounting/banking/accounts/${accountId}/summary`, { headers }).then((r) => {
        if (!r.ok) throw new Error('No se pudo cargar el resumen bancario.');
        return r.json();
      }),
      fetch(`${API_URL}/accounting/banking/accounts/${accountId}/transactions`, { headers }).then((r) => {
        if (!r.ok) throw new Error('No se pudieron cargar los movimientos de la cuenta.');
        return r.json();
      }),
    ])
      .then(([sum, txs]) => {
        setSummary(sum);
        setTransactions(Array.isArray(txs) ? txs : txs.data || []);
      })
      .catch((err: any) => {
        setSummary(null);
        setTransactions([]);
        setLoadError(err?.message || 'Error al jalar datos de la cuenta bancaria.');
      })
      .finally(() => setLoadingTx(false));
  };

  const fetchAccounts = async (autoLoad = true, preferredAccountId?: number) => {
    if (!user?.token) return;
    setLoadError("");
    const res = await fetch(`${API_URL}/accounting/banking/accounts`, { headers });
    if (!res.ok) {
      throw new Error(`No se pudo cargar cuentas bancarias (HTTP ${res.status}).`);
    }
    const d = await res.json();
    const accounts = Array.isArray(d) ? d : d.data || [];
    setBankAccounts(accounts);

    if (!autoLoad) return;
    if (!accounts.length) {
      setSelectedAccount(null);
      setSummary(null);
      setTransactions([]);
      return;
    }

    const accountToLoad =
      (preferredAccountId && accounts.find((a: any) => a.id === preferredAccountId)?.id) ||
      (selectedAccount && accounts.find((a: any) => a.id === selectedAccount)?.id) ||
      accounts[0].id;

    loadAccount(accountToLoad);
  };

  useEffect(() => {
    if (!user?.token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchAccounts(true)
      .catch((err: any) => {
        setBankAccounts([]);
        setSelectedAccount(null);
        setSummary(null);
        setTransactions([]);
        setLoadError(err?.message || 'Error al cargar banca.');
      })
      .finally(() => setLoading(false));
  }, [user?.token]);

  const reloadAccounts = async () => {
    await fetchAccounts(true);
  };

  const searchSpei = () => {
    if (!speiSearch.trim()) return;
    fetch(`${API_URL}/accounting/banking/spei/${encodeURIComponent(speiSearch.trim())}`, { headers })
      .then((r) => r.ok ? r.json() : null)
      .then(setSpeiResult)
      .catch(() => setSpeiResult(null));
  };

  const fmt = (n: number) => Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 });

  const createAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.token) return;
    if (!accountForm.name || !accountForm.bankName || !accountForm.accountNumber) {
      alert('Completa nombre, banco y numero de cuenta.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/accounting/banking/accounts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(accountForm),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = await res.json().catch(() => null);
      setAccountForm({
        name: '', bankName: '', accountNumber: '', clabe: '', currency: 'MXN', bankCode: '', rfc: '', accountType: '', branch: '', speiEnabled: true,
      });
      await fetchAccounts(true, created?.id);
    } catch (error: any) {
      alert(error?.message || 'No se pudo crear la cuenta bancaria.');
    } finally {
      setSaving(false);
    }
  };

  const importOneTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.token || !selectedAccount) return;
    const amount = Number(txForm.amount || 0);
    if (!txForm.description || amount <= 0) {
      alert('Captura descripcion y monto valido.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/accounting/banking/accounts/${selectedAccount}/transactions/import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactions: [
            {
              transactionDate: txForm.transactionDate,
              description: txForm.description,
              amount,
              isDebit: txForm.isDebit,
              speiTrackingKey: txForm.speiTrackingKey || undefined,
              counterpartyName: txForm.counterpartyName || undefined,
              counterpartyRfc: txForm.counterpartyRfc || undefined,
              concept: txForm.concept || undefined,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setTxForm({
        transactionDate: new Date().toISOString().slice(0, 10),
        description: '',
        amount: '',
        isDebit: false,
        speiTrackingKey: '',
        counterpartyName: '',
        counterpartyRfc: '',
        concept: '',
      });
      loadAccount(selectedAccount);
    } catch (error: any) {
      alert(error?.message || 'No se pudo registrar el movimiento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.BANKING_VIEW, PERMISSIONS.BANKING_MANAGE]}>
      <div style={{ display: "grid", gap: 24 }}>
        <HelpTab module="banking" user={user} />
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>🏦 Banca — Banorte & SPEI</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Cuentas Banorte, movimientos SPEI, clave de rastreo, conciliación bancaria y CEP.
          </p>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h4 style={{ color: 'var(--primary)', marginBottom: 8 }}>Alta de cuenta bancaria</h4>
          <form onSubmit={createAccount} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
            <input type="text" placeholder="Nombre interno" value={accountForm.name} onChange={(e) => setAccountForm((p) => ({ ...p, name: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
            <input type="text" placeholder="Banco" value={accountForm.bankName} onChange={(e) => setAccountForm((p) => ({ ...p, bankName: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
            <input type="text" placeholder="Numero de cuenta" value={accountForm.accountNumber} onChange={(e) => setAccountForm((p) => ({ ...p, accountNumber: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
            <input type="text" placeholder="CLABE" value={accountForm.clabe} onChange={(e) => setAccountForm((p) => ({ ...p, clabe: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
            <input type="text" placeholder="RFC" value={accountForm.rfc} onChange={(e) => setAccountForm((p) => ({ ...p, rfc: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
            <input type="text" placeholder="Tipo de cuenta" value={accountForm.accountType} onChange={(e) => setAccountForm((p) => ({ ...p, accountType: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
            <button type="submit" disabled={saving} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Guardando...' : 'Crear cuenta'}
            </button>
          </form>
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
        ) : loadError ? (
          <div className="card" style={{ padding: 24, textAlign: "center" }}>
            <p style={{ color: "var(--danger, #ef4444)", marginBottom: 8 }}>{loadError}</p>
            <button
              type="button"
              onClick={reloadAccounts}
              style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer' }}
            >
              Reintentar carga de cuentas
            </button>
          </div>
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
                <div className="card" style={{ padding: 16 }}>
                  <h4 style={{ color: 'var(--primary)', marginBottom: 8 }}>Registrar movimiento (custom)</h4>
                  <form onSubmit={importOneTransaction} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                    <input type="date" value={txForm.transactionDate} onChange={(e) => setTxForm((p) => ({ ...p, transactionDate: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
                    <input type="text" placeholder="Descripcion" value={txForm.description} onChange={(e) => setTxForm((p) => ({ ...p, description: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
                    <input type="number" min={0} step="0.01" placeholder="Monto" value={txForm.amount} onChange={(e) => setTxForm((p) => ({ ...p, amount: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
                    <input type="text" placeholder="Clave SPEI" value={txForm.speiTrackingKey} onChange={(e) => setTxForm((p) => ({ ...p, speiTrackingKey: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
                    <input type="text" placeholder="Contraparte" value={txForm.counterpartyName} onChange={(e) => setTxForm((p) => ({ ...p, counterpartyName: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
                    <input type="text" placeholder="RFC contraparte" value={txForm.counterpartyRfc} onChange={(e) => setTxForm((p) => ({ ...p, counterpartyRfc: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
                    <input type="text" placeholder="Concepto" value={txForm.concept} onChange={(e) => setTxForm((p) => ({ ...p, concept: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <input type="checkbox" checked={txForm.isDebit} onChange={(e) => setTxForm((p) => ({ ...p, isDebit: e.target.checked }))} />
                      Es cargo
                    </label>
                    <button type="submit" disabled={saving} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer' }}>
                      {saving ? 'Guardando...' : 'Registrar movimiento'}
                    </button>
                  </form>
                </div>

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
