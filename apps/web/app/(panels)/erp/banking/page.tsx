"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import MetricStrip, { type Metric } from "@/components/ui/MetricStrip";
import StatusDot from "@/components/ui/StatusDot";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import {
  FinanceField,
  FinanceFormGrid,
  financeInputStyle,
} from "@/components/finance/FinanceModuleShell";
import { useUser } from "@/components/UserContext";
import { getErpFinanceSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { toast } from "@/components/Toast";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import Modal from "@/components/ui/Modal";
import FinanceModuleRail from "@/components/erp/FinanceModuleRail";

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
    apiFetch(`accounting/banking/accounts/${selected.id}/transactions?limit=100`, token)
      .then((data) => setTxs(Array.isArray(data) ? data : (data?.data ?? [])))
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
      const data = await apiFetch(`accounting/banking/accounts/${selected.id}/transactions?limit=100`, token);
      setTxs(Array.isArray(data) ? data : (data?.data ?? []));
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

  const inp = financeInputStyle;

  const txColumns: Column<BankTransaction>[] = [
    {
      key: "transactionDate", label: "Fecha", width: 100,
      render: (t) => (
        <span style={{ fontSize: 12, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
          {new Date(t.transactionDate).toLocaleDateString("es-MX")}
        </span>
      ),
    },
    {
      key: "description", label: "Concepto",
      render: (t) => {
        const contexto = [t.counterpartyName, t.concept].filter(Boolean).join(" · ");
        return (
          <div>
            <div style={{ fontSize: 13 }}>{t.description}</div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              {t.isDebit ? "Cargo" : "Abono"}
              {contexto ? ` · ${contexto}` : ""}
            </div>
          </div>
        );
      },
    },
    {
      // El signo distingue cargo de abono sin pintar media tabla de rojo: con
      // cien movimientos, el color por tipo deja de señalar nada.
      key: "amount", label: "Monto", numeric: true, width: 140,
      render: (t) => (
        <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {t.isDebit ? "−" : ""}
          <Money value={Number(t.amount)} bold={false} />
        </span>
      ),
    },
    {
      key: "reconciliationStatus", label: "Estado", width: 120,
      render: (t) => (
        t.reconciliationStatus === "MATCHED"
          ? <StatusDot label="Conciliado" tone="neutral" title="Cruzado contra un movimiento contable" />
          : <StatusDot label="Por conciliar" tone="warning" title="Todavía no se cruza con la contabilidad" />
      ),
    },
    ...(cfg.canApprove ? [{
      key: "acciones" as keyof BankTransaction, label: "",
      render: (t: BankTransaction) => t.reconciliationStatus !== "MATCHED" ? <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); void reconcile(t); }}>Conciliar</Button> : null,
      width: 110,
    }] : []),
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Finanzas"
        title={cfg.title}
        subtitle={cfg.subtitle}
        density="ops"
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate && <Button size="sm" variant="secondary" iconLeft="+" onClick={openNewAccount}>Nueva cuenta</Button>}
          </>
        }
      />
      <FinanceModuleRail />

      {(() => {
        const activas = accounts.filter((a) => a.isActive).length;
        const inactivas = accounts.length - activas;
        const negativas = accounts.filter((a) => Number(a.currentBalance) < 0).length;
        const masLiquida = accounts.length > 0
          ? accounts.reduce((max, a) => (Number(a.currentBalance) > Number(max.currentBalance) ? a : max), accounts[0])
          : null;
        const porConciliar = txs.filter((t) => t.reconciliationStatus !== "MATCHED").length;
        const metrics: Metric[] = [
          {
            label: "Saldo total",
            value: <Money value={totalBalance} compact bold={false} />,
            hint: `${accounts.length} cuenta${accounts.length === 1 ? "" : "s"} registrada${accounts.length === 1 ? "" : "s"}`,
            tone: totalBalance < 0 ? "danger" : "default",
          },
          {
            label: "Cuentas activas",
            value: activas,
            hint: inactivas > 0 ? `${inactivas} inactiva${inactivas === 1 ? "" : "s"}` : "ninguna inactiva",
          },
          {
            label: "En negativo",
            value: negativas,
            hint: negativas > 0 ? "saldo por debajo de cero" : "sin cuentas sobregiradas",
            tone: negativas > 0 ? "danger" : "default",
          },
          {
            label: "Más líquida",
            value: <span style={{ fontSize: 15 }}>{masLiquida?.name ?? "—"}</span>,
            hint: masLiquida ? masLiquida.bankName : "sin cuentas",
          },
          {
            label: "Por conciliar",
            value: porConciliar,
            hint: selected ? `movimientos de ${selected.name}` : "selecciona una cuenta",
            tone: porConciliar > 0 ? "warning" : "default",
          },
        ];
        return (
          <div style={{ marginBottom: 18 }}>
            <MetricStrip metrics={metrics} ariaLabel="Resumen de bancos" />
          </div>
        );
      })()}

      {loading && <EmptyState icon="⏳" title="Cargando cuentas…" description="Consultando cuentas bancarias." />}
      {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}

      {!loading && !error && (
        <>
          <Section title="Cuentas" subtitle="El saldo manda; elige una cuenta para ver sus movimientos.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10 }}>
              {accounts.map((a) => {
                const saldo = Number(a.currentBalance);
                const share = totalBalance > 0 ? (saldo / totalBalance) * 100 : null;
                const isSelected = selected?.id === a.id;
                return (
                  <div key={a.id} style={{ position: "relative" }}>
                    <button
                      onClick={() => setSelected(a)}
                      aria-pressed={isSelected}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "12px 14px",
                        borderRadius: 10,
                        cursor: "pointer",
                        font: "inherit",
                        border: "1px solid var(--nx-panel-hairline, var(--border))",
                        borderLeft: `3px solid ${isSelected ? "var(--primary)" : "transparent"}`,
                        background: isSelected ? "var(--surface-2, var(--surface))" : "var(--surface)",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{a.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 8 }}>
                        {a.bankName} · {a.clabe ?? a.accountNumber} · {a.currency}
                      </div>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 600,
                          fontVariantNumeric: "tabular-nums",
                          lineHeight: 1.15,
                          color: saldo < 0 ? "var(--state-danger-text, #b91c1c)" : "var(--text-primary)",
                        }}
                      >
                        <Money value={saldo} bold={false} />
                      </div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
                        {share !== null && (
                          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{share.toFixed(0)}% del total</span>
                        )}
                        {!a.isActive && <StatusDot label="Inactiva" tone="neutral" />}
                      </div>
                    </button>
                    {cfg.canCreate && (
                      <button
                        onClick={() => openEditAccount(a)}
                        title="Editar cuenta"
                        aria-label={`Editar ${a.name}`}
                        style={{ position: "absolute", top: 10, right: 10, background: "transparent", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text-tertiary)", padding: 2 }}
                      >
                        ✎
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>

          {selected && (
            <Section
              title={loadingTx ? "Cargando movimientos…" : `Movimientos · ${selected.name}`}
              actions={cfg.canCreate ? (
                <Button variant="secondary" size="sm" iconLeft="+" onClick={() => setShowTxForm(true)}>Registrar movimiento</Button>
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
                  <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleTxs, [
                    { key: "transactionDate", label: "Fecha", format: (v) => v ? String(v).slice(0, 10) : "" },
                    { key: "description", label: "Descripción" },
                    { key: "counterpartyName", label: "Contraparte" },
                    { key: "amount", label: "Monto" },
                    { key: "isDebit", label: "Tipo", format: (v) => v ? "Cargo" : "Abono" },
                    { key: "reconciliationStatus", label: "Estado" },
                  ], `movimientos-${selected.name.toLowerCase().replace(/\s+/g, "-")}`)}>Excel</Button>
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
            <Button size="sm" variant="secondary" onClick={() => setShowTxForm(false)}>Cancelar</Button>
            <Button size="sm" variant="primary" onClick={() => void importTransaction()} disabled={savingTx || !txForm.description.trim() || !txForm.amount}>
              {savingTx ? "Guardando…" : "Registrar"}
            </Button>
          </>
        }
      >
        <FinanceFormGrid>
          <FinanceField label="Fecha" hint="La del estado de cuenta, no la de captura.">
            <input type="date" value={txForm.transactionDate} onChange={(e) => setTxForm((f) => ({ ...f, transactionDate: e.target.value }))} style={inp} />
          </FinanceField>
          <FinanceField label="Tipo" hint="Cargo resta del saldo; abono lo suma.">
            <select value={txForm.isDebit ? "debit" : "credit"} onChange={(e) => setTxForm((f) => ({ ...f, isDebit: e.target.value === "debit" }))} style={inp}>
              <option value="debit">Cargo (salida)</option>
              <option value="credit">Abono (entrada)</option>
            </select>
          </FinanceField>
          <FinanceField label="Descripción" fullWidth hint="Cópiala del estado de cuenta: así se reconoce al conciliar.">
            <input value={txForm.description} onChange={(e) => setTxForm((f) => ({ ...f, description: e.target.value }))} placeholder="SPEI recibido, comisión bancaria…" style={inp} />
          </FinanceField>
          <FinanceField label="Monto" hint="Pesos, siempre en positivo. El tipo decide el signo.">
            <input type="number" min={0} step="0.01" value={txForm.amount} onChange={(e) => setTxForm((f) => ({ ...f, amount: Number(e.target.value) }))} style={inp} />
          </FinanceField>
          <FinanceField label="Contraparte" optional hint="Quién envía o recibe el dinero.">
            <input value={txForm.counterpartyName} onChange={(e) => setTxForm((f) => ({ ...f, counterpartyName: e.target.value }))} style={inp} />
          </FinanceField>
          <FinanceField label="Concepto" optional fullWidth hint="Referencia o clave de rastreo del movimiento.">
            <input value={txForm.concept} onChange={(e) => setTxForm((f) => ({ ...f, concept: e.target.value }))} style={inp} />
          </FinanceField>
        </FinanceFormGrid>
      </Modal>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingAccount ? "Editar cuenta bancaria" : "Nueva cuenta bancaria"}
        footer={
          <>
            <Button size="sm" variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button size="sm" variant="primary" onClick={() => void saveAccount()} disabled={saving || !form.name || !form.bankName}>
              {saving ? "Guardando…" : editingAccount ? "Guardar cambios" : "Crear cuenta"}
            </Button>
          </>
        }
      >
        <FinanceFormGrid>
          <FinanceField label="Nombre / alias" hint="Como la llaman en la operación, no como la nombra el banco.">
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Cuenta operativa MXN" style={inp} />
          </FinanceField>
          <FinanceField label="Banco">
            <input value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} placeholder="Banorte" style={inp} />
          </FinanceField>
          <FinanceField label="Número de cuenta" hint="Tal como aparece en el estado de cuenta.">
            <input value={form.accountNumber} onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))} style={inp} />
          </FinanceField>
          <FinanceField label="CLABE" optional hint="18 dígitos. Es lo que se usa para recibir transferencias.">
            <input value={form.clabe} onChange={(e) => setForm((f) => ({ ...f, clabe: e.target.value }))} style={inp} />
          </FinanceField>
          {!editingAccount && (
            <FinanceField label="Saldo inicial" fullWidth hint="Pesos. Solo se captura al dar de alta la cuenta; después lo mueven los movimientos.">
              <input type="number" value={form.currentBalance} onChange={(e) => setForm((f) => ({ ...f, currentBalance: Number(e.target.value) }))} style={inp} />
            </FinanceField>
          )}
        </FinanceFormGrid>
      </Modal>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
