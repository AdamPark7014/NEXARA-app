"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Money, Tag, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { toast } from "@/components/Toast";

type BankAccount = { id: number; name: string; bankName?: string; currentBalance?: number | string };
type BankTx = {
  id: number;
  date: string;
  description?: string | null;
  amount: number | string;
  reference?: string | null;
  reconciliationStatus?: string | null;
  isReconciled?: boolean;
};

async function apiFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> ?? {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

export default function ConciliacionPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [txs, setTxs] = useState<BankTx[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedTx, setSelectedTx] = useState<BankTx | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    if (!token) return;
    const data = await apiFetch("accounting/banking/accounts", token);
    const list = Array.isArray(data) ? data : data?.items ?? [];
    setAccounts(list);
    if (!accountId && list[0]?.id) setAccountId(list[0].id);
  }, [token, accountId]);

  const loadTxs = useCallback(async () => {
    if (!token || !accountId) return;
    setLoading(true);
    setError(null);
    try {
      const [txData, invData] = await Promise.all([
        apiFetch(`accounting/banking/accounts/${accountId}/transactions?limit=100`, token),
        apiFetch("accounting/invoices?limit=100", token),
      ]);
      setTxs(Array.isArray(txData) ? txData : txData?.items ?? []);
      setInvoices(Array.isArray(invData) ? invData : invData?.items ?? []);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [token, accountId]);

  useEffect(() => {
    void loadAccounts().catch((e) => setError(formatApiError(e)));
  }, [loadAccounts]);

  useEffect(() => {
    void loadTxs();
  }, [loadTxs]);

  const suggestions = useMemo(() => {
    if (!selectedTx) return [];
    const amt = Math.abs(Number(selectedTx.amount || 0));
    const txDate = selectedTx.date ? new Date(selectedTx.date).getTime() : 0;
    return invoices
      .map((inv) => {
        const total = Number(inv.totalAmount || 0);
        const deltaAmt = Math.abs(total - amt);
        const invDate = inv.issueDate ? new Date(inv.issueDate).getTime() : 0;
        const deltaDays = txDate && invDate ? Math.abs(txDate - invDate) / 86_400_000 : 999;
        const score = deltaAmt < 1 ? 100 : deltaAmt < 50 ? 70 : 0;
        const dateScore = deltaDays <= 3 ? 30 : deltaDays <= 7 ? 15 : 0;
        return { inv, score: score + dateScore, deltaAmt, deltaDays };
      })
      .filter((s) => s.score >= 70)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [selectedTx, invoices]);

  async function matchManual(invoiceId: number) {
    if (!selectedTx) return;
    const matchedAmount = Math.abs(Number(selectedTx.amount || 0));
    try {
      await apiFetch(`accounting/banking/transactions/${selectedTx.id}/reconcile`, token, {
        method: "PATCH",
        body: JSON.stringify({
          matchedAmount,
          notes: `Match manual factura #${invoiceId}`,
        }),
      });
      toast.success("Conciliado");
      setSelectedTx(null);
      await loadTxs();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  }

  const columns: Column<BankTx>[] = [
    {
      key: "date",
      label: "Fecha",
      render: (r) => (r.date ? new Date(r.date).toLocaleDateString("es-MX") : "—"),
    },
    { key: "description", label: "Descripción", render: (r) => r.description || r.reference || "—" },
    {
      key: "amount",
      label: "Monto",
      align: "right",
      numeric: true,
      render: (r) => <Money value={Number(r.amount || 0)} />,
    },
    {
      key: "status",
      label: "Estado",
      render: (r) => {
        const st = r.reconciliationStatus || (r.isReconciled ? "MATCHED" : "PENDING");
        return <Tag variant={st === "MATCHED" ? "positive" : st === "PENDING" ? "warning" : "neutral"}>{st}</Tag>;
      },
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Contabilidad"
        title="Conciliación bancaria"
        subtitle="Split banco ↔ Nexara. Match sugerido por monto±fecha; conciliación manual."
        density="ops"
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select
              value={accountId ?? ""}
              onChange={(e) => setAccountId(Number(e.target.value) || null)}
              style={{ fontSize: 12, padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)" }}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} {a.bankName ? `· ${a.bankName}` : ""}
                </option>
              ))}
            </select>
            <Link
              href="/erp/banking"
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "6px 12px",
                borderRadius: 8,
                textDecoration: "none",
                color: "var(--text-secondary)",
              }}
            >
              Bancos (completo)
            </Link>
            <Button size="sm" variant="secondary" onClick={() => void loadTxs()} disabled={loading}>
              Actualizar
            </Button>
          </div>
        }
      />

      {error && <div style={{ color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(280px, 0.8fr)", gap: 14 }}>
        <Section title="Movimientos banco" dense>
          {loading ? (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Cargando…</p>
          ) : (
            <DataTable
              columns={columns}
              rows={txs}
              rowKey={(r) => r.id}
              density="compact"
              onRowClick={(r) => setSelectedTx(r)}
              emptyTitle="Sin movimientos"
              emptyDescription="Importa CSV desde Bancos o elige otra cuenta."
            />
          )}
        </Section>
        <Section title={selectedTx ? "Match Nexara" : "Selecciona un movimiento"} dense>
          {!selectedTx ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-tertiary)" }}>
              Elige un renglón a la izquierda para ver sugerencias por monto y fecha.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 13 }}>
                <div><strong>{selectedTx.description || selectedTx.reference || `#${selectedTx.id}`}</strong></div>
                <div><Money value={Number(selectedTx.amount || 0)} /></div>
              </div>
              {suggestions.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-tertiary)" }}>Sin sugerencias cercanas.</p>
              ) : (
                suggestions.map(({ inv, score }) => (
                  <div
                    key={inv.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      alignItems: "center",
                      padding: "8px 10px",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  >
                    <div>
                      <div>{inv.invoiceNumber}</div>
                      <div style={{ color: "var(--text-tertiary)" }}>
                        {inv.receptorName || "—"} · score {score}
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => void matchManual(inv.id)}>
                      Conciliar
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
        </Section>
      </div>
    </>
  );
}
