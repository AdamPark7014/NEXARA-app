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

export default function BankingPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpFinanceSectionConfig(user, "banking"), [user]);
  const token = user?.token ?? "";

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selected, setSelected] = useState<BankAccount | null>(null);
  const [txs, setTxs] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTx, setLoadingTx] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

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
    apiFetch(`accounting/banking/accounts/${selected.id}/transactions`, token)
      .then((data) => setTxs(Array.isArray(data) ? data : []))
      .catch(() => setTxs([]))
      .finally(() => setLoadingTx(false));
  }, [token, selected]);

  const totalBalance = accounts.reduce((s, a) => s + Number(a.currentBalance), 0);

  const createAccount = async () => {
    if (!token || !form.name || !form.bankName || !form.accountNumber) return;
    setSaving(true);
    try {
      await apiFetch("accounting/banking/accounts", token, { method: "POST", body: JSON.stringify(form) });
      setShowForm(false); setForm({ ...emptyForm });
      void load();
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally { setSaving(false); }
  };

  const reconcile = async (tx: BankTransaction) => {
    if (!token) return;
    try {
      await apiFetch(`accounting/banking/transactions/${tx.id}/reconcile`, token, { method: "PATCH", body: JSON.stringify({ status: "MATCHED" }) });
      setTxs((prev) => prev.map((t) => (t.id === tx.id ? { ...t, reconciled: true, reconciliationStatus: "MATCHED" } : t)));
    } catch (e) { alert(`Error: ${e instanceof Error ? e.message : "desconocido"}`); }
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
            {cfg.canCreate && <Button variant="primary" iconLeft="+" onClick={() => setShowForm(true)}>Nueva cuenta</Button>}
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Saldo total" value={`$${(totalBalance / 1000000).toFixed(2)}M`} icon="🏦" />
        <KpiCard label="Cuentas activas" value={accounts.filter((a) => a.isActive).length} icon="💳" />
      </div>

      {loading && <EmptyState icon="⏳" title="Cargando cuentas…" description="Consultando cuentas bancarias." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}

      {!loading && !error && (
        <>
          <Section title="Cuentas">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              {accounts.map((a) => (
                <button key={a.id} onClick={() => setSelected(a)} style={{
                  textAlign: "left", padding: 16, borderRadius: 12, cursor: "pointer",
                  border: `1px solid ${selected?.id === a.id ? "var(--primary)" : "var(--border)"}`,
                  background: selected?.id === a.id ? "color-mix(in srgb, var(--primary) 6%, var(--surface))" : "var(--surface)",
                }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{a.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginBottom: 8 }}>{a.bankName} · {a.clabe ?? a.accountNumber}</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}><Money value={Number(a.currentBalance)} /></div>
                </button>
              ))}
            </div>
          </Section>

          {selected && (
            <Section title={loadingTx ? "Cargando movimientos…" : `Movimientos · ${selected.name}`}>
              {loadingTx
                ? <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
                : <DataTable columns={txColumns} rows={txs} rowKey={(t) => t.id} emptyTitle="Sin movimientos" emptyDescription="No hay transacciones registradas para esta cuenta." />
              }
            </Section>
          )}
        </>
      )}

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowForm(false)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 28, width: 440, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Nueva cuenta bancaria</div>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Nombre / alias</span>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Cuenta operativa MXN" style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Banco</span>
                <input value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} placeholder="Banorte" style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Número de cuenta</span>
                <input value={form.accountNumber} onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>CLABE</span>
                <input value={form.clabe} onChange={(e) => setForm((f) => ({ ...f, clabe: e.target.value }))} style={inp} /></label>
              <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Saldo inicial</span>
                <input type="number" value={form.currentBalance} onChange={(e) => setForm((f) => ({ ...f, currentBalance: Number(e.target.value) }))} style={inp} /></label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void createAccount()} disabled={saving || !form.name || !form.bankName}>{saving ? "Guardando…" : "Crear cuenta"}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
