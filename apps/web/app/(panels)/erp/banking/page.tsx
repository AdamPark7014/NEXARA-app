"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getErpFinanceSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { toast } from "@/components/Toast";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToCsv } from "@/lib/export-csv";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import Modal from "@/components/ui/Modal";

interface BankAccount {
  id: number;
  name: string;
  bankName: string;
  accountNumber: string;
  clabe?: string | null;
  currency: string;
  currentBalance: number | string;
  isActive: boolean;
}

interface BankTransaction {
  id: number;
  transactionDate: string;
  description: string;
  amount: number | string;
  isDebit: boolean;
  concept?: string | null;
  counterpartyName?: string | null;
  reconciled?: boolean;
  reconciliationStatus?: string;
}

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

const emptyForm = { name: "", bankName: "", accountNumber: "", clabe: "", currentBalance: 0 };

const emptyTxForm = {
  transactionDate: new Date().toISOString().slice(0, 10),
  description: "",
  amount: 0,
  isDebit: true,
  counterpartyName: "",
  concept: "",
};

export default function BankingPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpFinanceSectionConfig(user, "banking"), [user]);
  const token = user?.token ?? "";

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selected, setSelected] = useState<BankAccount | null>(null);
  const [txs, setTxs] = useState<BankTransaction[]>([]);
  const [txSearch, setTxSearch] = useState("");
  const [txFilterType, setTxFilterType] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingTx, setLoadingTx] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [showTxForm, setShowTxForm] = useState(false);
  const [txForm, setTxForm] = useState({ ...emptyTxForm });
  const [savingTx, setSavingTx] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("accounting/banking/accounts", token);
      const list: BankAccount[] = Array.isArray(data) ? data : [];
      setAccounts(list);
      if (list.length && !selected) setSelected(list[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar cuentas bancarias");
    } finally { setLoading(false); }
  }, [token, selected]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!token || !selected) return;
    setLoadingTx(true);
    setTxError(null);
    apiFetch(`accounting/banking/accounts/${selected.id}/transactions`, token)
      .then((data) => setTxs(Array.isArray(data) ? data : []))
      .catch((e) => {
        setTxError(formatApiError(e, "No se pudieron cargar los movimientos"));
        setTxs([]);
      })
      .finally(() => setLoadingTx(false));
  }, [token, selected]);

  const visibleTxs = useMemo(() => {
    let rows = txs;
    if (txSearch.trim()) {
      const q = txSearch.toLowerCase();
      rows = rows.filter((t) =>
        (t.description ?? "").toLowerCase().includes(q) ||
        (t.counterpartyName ?? "").toLowerCase().includes(q) ||
        (t.concept ?? "").toLowerCase().includes(q)
      );
    }
    if (txFilterType === "debit") rows = rows.filter((t) => t.isDebit);
    if (txFilterType === "credit") rows = rows.filter((t) => !t.isDebit);
    return rows;
  }, [txs, txSearch, txFilterType]);

  const totalBalance = accounts.reduce((s, a) => s + Number(a.currentBalance), 0);

  const openNewAccount = () => { setEditingAccount(null); setForm({ ...emptyForm }); setShowForm(true); };
  const openEditAccount = (a: BankAccount) => {
    setEditingAccount(a);
    setForm({ name: a.name, bankName: a.bankName, accountNumber: a.accountNumber, clabe: a.clabe ?? "", currentBalance: Number(a.currentBalance) });
    setShowForm(true);
  };

  const saveAccount = async () => {
    if (!token || !form.name || !form.bankName || !form.accountNumber) return;
    setSaving(true);
    try {
      if (editingAccount) {
        await apiFetch(`accounting/banking/accounts/${editingAccount.id}`, token, { method: "PATCH", body: JSON.stringify(form) });
      } else {
        await apiFetch("accounting/banking/accounts", token, { method: "POST", body: JSON.stringify(form) });
      }
      setShowForm(false);
      setEditingAccount(null);
      setForm({ ...emptyForm });
      void load();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo guardar la cuenta"));
    } finally { setSaving(false); }
  };

  const importTransaction = async () => {
    if (!token || !selected || !txForm.description.trim() || !txForm.amount) return;
    setSavingTx(true);
    try {
      await apiFetch(`accounting/banking/accounts/${selected.id}/transactions/import`, token, {
        method: "POST",
        body: JSON.stringify({
          transactions: [{
            transactionDate: txForm.transactionDate,
            description: txForm.description.trim(),
            amount: txForm.amount,
            isDebit: txForm.isDebit,
            counterpartyName: txForm.counterpartyName.trim() || undefined,
            concept: txForm.concept.trim() || undefined,
          }],
        }),
      });
      setShowTxForm(false);
      setTxForm({ ...emptyTxForm });
      const data = await apiFetch(`accounting/banking/accounts/${selected.id}/transactions`, token);
      setTxs(Array.isArray(data) ? data : []);
      void load();
    } catch (e) {
      toast.error(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally { setSavingTx(false); }
  };

  const reconcile = (tx: BankTransaction) => {
    if (!token) return;
    const amount = Number(tx.amount);
    setConfirmState({
      title: "Conciliar movimiento",
      message: `¿Marcar como conciliado el movimiento de ${amount.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}?`,
      confirmLabel: "Conciliar",
      danger: false,
      fn: async () => {
        try {
          await apiFetch(`accounting/banking/transactions/${tx.id}/reconcile`, token, {
            method: "PATCH",
            body: JSON.stringify({ matchedAmount: amount }),
          });
          setTxs((prev) =>
            prev.map((t) =>
              t.id === tx.id ? { ...t, reconciled: true, reconciliationStatus: "MATCHED" } : t,
            ),
          );
        } catch (e) {
          toast.error(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
        }
      },
    });
  };

  const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13 };

  const txColumns: Column<BankTransaction>[] = [
    { key: "transactionDate", label: "Fecha", render: (t) => <span style={{ fontSize: 12 }}>{new Date(t.transactionDate).toLocaleDateString("es-MX")}</span>, width: 100 },
    {
      key: "description", label: "Descripción",
      render: (t) => (
        <div>
          <div style={{ fontSize: 13 }}>{t.description}</div>
          {t.counterpartyName && <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{t.counterpartyName}</div>}
        </div>
      ),
    },
    { key: "amount", label: "Monto", align: "right" as const, render: (t) => <span style={{ color: t.isDebit ? "var(--danger)" : "var(--success)", fontWeight: 700 }}>{t.isDebit ? "-" : "+"}<Money value={Number(t.amount)} /></span>, width: 130 },
    { key: "reconciliationStatus", label: "Estado", render: (t) => <Tag variant={t.reconciliationStatus === "MATCHED" ? "positive" : "warning"}>{t.reconciliationStatus === "MATCHED" ? "Conciliado" : "Pendiente"}</Tag>, width: 110 },
    ...(cfg.canApprove ? [{
      key: "acciones" as keyof BankTransaction, label: "",
      render: (t: BankTransaction) => t.reconciliationStatus !== "MATCHED" ? <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); void reconcile(t); }}>Conciliar</Button> : null,
      width: 100,
    }] : []),
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Finanzas"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate && <Button variant="primary" iconLeft="+" onClick={openNewAccount}>Nueva cuenta</Button>}
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Saldo total" value={<Money value={totalBalance} compact />} icon="🏦" variant={totalBalance > 0 ? "positive" : "danger"} hint={`${accounts.length} cuentas registradas`} />
        <KpiCard label="Cuentas activas" value={accounts.filter((a) => a.isActive).length} icon="💳" variant="accent" hint={`${accounts.filter((a) => !a.isActive).length} inactivas`} />
        <KpiCard label="En negativo" value={accounts.filter((a) => Number(a.currentBalance) < 0).length} icon="🔴" variant={accounts.some((a) => Number(a.currentBalance) < 0) ? "danger" : "positive"} hint={accounts.some((a) => Number(a.currentBalance) < 0) ? "Cuentas con saldo negativo" : "Sin cuentas negativas"} />
        <KpiCard label="Más líquida" value={accounts.length > 0 ? (accounts.reduce((max, a) => Number(a.currentBalance) > Number(max.currentBalance) ? a : max, accounts[0])?.name ?? "—") : "—"} icon="💧" hint="Mayor saldo disponible" />
      </div>

      {accounts.length > 1 && (() => {
        const positivas = accounts.filter((a) => Number(a.currentBalance) >= 0).length;
        const negativas = accounts.filter((a) => Number(a.currentBalance) < 0).length;
        const activas = accounts.filter((a) => a.isActive).length;
        const inactivas = accounts.filter((a) => !a.isActive).length;
        const total = accounts.length;
        return (
          <div style={{ marginBottom: 20, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Estado de cuentas</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {([
                { label: "Con saldo positivo", count: positivas, color: "var(--success)" },
                { label: "En negativo", count: negativas, color: "var(--danger)" },
                { label: "Activas", count: activas, color: "var(--primary)" },
                { label: "Inactivas", count: inactivas, color: "var(--text-tertiary)" },
              ] as { label: string; count: number; color: string }[]).filter((r) => r.count > 0).map((r) => (
                <div key={r.label} style={{ display: "grid", gridTemplateColumns: "140px 1fr 36px", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{r.label}</span>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(r.count / total) * 100}%`, background: r.color, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{r.count}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {loading && <EmptyState icon="⏳" title="Cargando cuentas…" description="Consultando cuentas bancarias." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}

      {!loading && !error && (
        <>
          <Section title="Cuentas">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              {accounts.map((a) => (
                <div key={a.id} style={{ position: "relative" }}>
                <button onClick={() => setSelected(a)} style={{
                  width: "100%",
                  textAlign: "left", padding: 16, borderRadius: 12, cursor: "pointer",
                  border: `1px solid ${selected?.id === a.id ? "var(--primary)" : "var(--border)"}`,
                  background: selected?.id === a.id ? "color-mix(in srgb, var(--primary) 6%, var(--surface))" : "var(--surface)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{a.name}</div>
                    <Tag variant={a.isActive ? "positive" : "neutral"}>{a.currency}</Tag>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginBottom: 8 }}>{a.bankName} · {a.clabe ?? a.accountNumber}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}><Money value={Number(a.currentBalance)} /></div>
                  {totalBalance > 0 && (
                    <div>
                      <div style={{ height: 4, borderRadius: 2, background: "var(--surface-2)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.max(2, (Number(a.currentBalance) / totalBalance) * 100)}%`, background: "var(--primary)", borderRadius: 2 }} />
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 3 }}>{((Number(a.currentBalance) / totalBalance) * 100).toFixed(0)}% del total</div>
                    </div>
                  )}
                </button>
                {cfg.canCreate && (
                  <button onClick={() => openEditAccount(a)} title="Editar cuenta" style={{ position: "absolute", top: 8, right: 8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", fontSize: 12, padding: "2px 6px" }}>✎</button>
                )}
                </div>
              ))}
            </div>
          </Section>

          {selected && (
            <Section
              title={loadingTx ? "Cargando movimientos…" : `Movimientos · ${selected.name}`}
              actions={cfg.canCreate ? (
                <Button variant="primary" size="sm" iconLeft="+" onClick={() => setShowTxForm(true)}>Registrar movimiento</Button>
              ) : undefined}
            >
              <FilterToolbar
                search={{ value: txSearch, onChange: setTxSearch, placeholder: "Buscar por descripción o contraparte…" }}
                selects={[{
                  label: "Tipo",
                  value: txFilterType,
                  onChange: setTxFilterType,
                  options: [
                    { value: "debit", label: "Cargo" },
                    { value: "credit", label: "Abono" },
                  ],
                  allowAll: true,
                }]}
                onClear={() => { setTxSearch(""); setTxFilterType(""); }}
                resultCount={loadingTx ? null : visibleTxs.length}
                rightActions={txs.length > 0 ? (
                  <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToCsv(visibleTxs, [
                    { key: "transactionDate", label: "Fecha", format: (v) => v ? String(v).slice(0, 10) : "" },
                    { key: "description", label: "Descripción" },
                    { key: "counterpartyName", label: "Contraparte" },
                    { key: "amount", label: "Monto" },
                    { key: "isDebit", label: "Tipo", format: (v) => v ? "Cargo" : "Abono" },
                    { key: "reconciliationStatus", label: "Estado" },
                  ], `movimientos-${selected.name.toLowerCase().replace(/\s+/g, "-")}`)}>CSV</Button>
                ) : undefined}
              />
              {loadingTx
                ? <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
                : txError
                  ? <EmptyState icon="⚠️" title="Error al cargar movimientos" description={txError} action={<Button size="sm" variant="secondary" onClick={() => setSelected({ ...selected! })}>Reintentar</Button>} />
                  : <DataTable columns={txColumns} rows={visibleTxs} rowKey={(t) => t.id} emptyTitle="Sin movimientos" emptyDescription="No hay transacciones registradas para esta cuenta." />
              }
            </Section>
          )}
        </>
      )}

      <Modal
        open={showTxForm && !!selected}
        onClose={() => setShowTxForm(false)}
        title={selected ? `Registrar movimiento · ${selected.name}` : "Registrar movimiento"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowTxForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void importTransaction()} disabled={savingTx || !txForm.description.trim() || !txForm.amount}>
              {savingTx ? "Guardando…" : "Registrar"}
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 14 }}>
          <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Fecha</span>
            <input type="date" value={txForm.transactionDate} onChange={(e) => setTxForm((f) => ({ ...f, transactionDate: e.target.value }))} style={inp} /></label>
          <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Descripción</span>
            <input value={txForm.description} onChange={(e) => setTxForm((f) => ({ ...f, description: e.target.value }))} placeholder="SPEI recibido, comisión bancaria…" style={inp} /></label>
          <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Monto ($)</span>
            <input type="number" min={0} step="0.01" value={txForm.amount} onChange={(e) => setTxForm((f) => ({ ...f, amount: Number(e.target.value) }))} style={inp} /></label>
          <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Tipo</span>
            <select value={txForm.isDebit ? "debit" : "credit"} onChange={(e) => setTxForm((f) => ({ ...f, isDebit: e.target.value === "debit" }))} style={inp}>
              <option value="debit">Cargo (salida)</option>
              <option value="credit">Abono (entrada)</option>
            </select></label>
          <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Contraparte</span>
            <input value={txForm.counterpartyName} onChange={(e) => setTxForm((f) => ({ ...f, counterpartyName: e.target.value }))} style={inp} /></label>
          <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Concepto</span>
            <input value={txForm.concept} onChange={(e) => setTxForm((f) => ({ ...f, concept: e.target.value }))} style={inp} /></label>
        </div>
      </Modal>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingAccount ? "Editar cuenta bancaria" : "Nueva cuenta bancaria"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void saveAccount()} disabled={saving || !form.name || !form.bankName}>
              {saving ? "Guardando…" : editingAccount ? "Guardar cambios" : "Crear cuenta"}
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 14 }}>
          <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Nombre / alias</span>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Cuenta operativa MXN" style={inp} /></label>
          <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Banco</span>
            <input value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} placeholder="Banorte" style={inp} /></label>
          <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Número de cuenta</span>
            <input value={form.accountNumber} onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))} style={inp} /></label>
          <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>CLABE</span>
            <input value={form.clabe} onChange={(e) => setForm((f) => ({ ...f, clabe: e.target.value }))} style={inp} /></label>
          {!editingAccount && (
            <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Saldo inicial</span>
              <input type="number" value={form.currentBalance} onChange={(e) => setForm((f) => ({ ...f, currentBalance: Number(e.target.value) }))} style={inp} /></label>
          )}
        </div>
      </Modal>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
