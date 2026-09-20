"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import DataTable, { Money, Tag, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import FilterToolbar from "@/components/FilterToolbar";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { toast } from "@/components/Toast";

type InvoiceRow = {
  id: number;
  invoiceNumber: string;
  type: string;
  status: string;
  issueDate: string;
  dueDate?: string | null;
  totalAmount: number | string;
  paidAmount?: number | string;
  receptorName?: string | null;
  emisorName?: string | null;
  cfdiUuid?: string | null;
  cfdiXml?: string | null;
};

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> ?? {}),
    },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

function pendingOf(row: InvoiceRow) {
  return Number(row.totalAmount || 0) - Number(row.paidAmount || 0);
}

function daysOverdue(due?: string | null) {
  if (!due) return null;
  const d = new Date(due);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - d.getTime()) / 86_400_000);
}

type Mode = "cxc" | "cxp" | "all";

export default function ContabilidadInvoicesView({
  mode = "all",
  title,
  subtitle,
}: {
  mode?: Mode;
  title?: string;
  subtitle?: string;
}) {
  const { user } = useUser();
  const token = user?.token ?? "";
  const [items, setItems] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [payingId, setPayingId] = useState<number | null>(null);

  const typeParam =
    mode === "cxc" ? "ACCOUNTS_RECEIVABLE" : mode === "cxp" ? "ACCOUNTS_PAYABLE" : "";

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (typeParam) qs.set("type", typeParam);
      qs.set("limit", "200");
      const data = await apiFetch(`accounting/invoices?${qs}`, token);
      const rows = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
      setItems(rows);
    } catch (e) {
      setError(formatApiError(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, typeParam]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = items;
    if (mode !== "all") {
      rows = rows.filter(
        (r) => pendingOf(r) > 0.01 && !["PAID", "CANCELLED", "DRAFT"].includes(r.status),
      );
    }
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.invoiceNumber, r.receptorName, r.emisorName, r.status, r.cfdiUuid]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [items, q, mode]);

  const calendar = useMemo(() => {
    if (mode !== "cxp") return null;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const buckets = { today: 0, d7: 0, d30: 0, overdue: 0 };
    for (const r of filtered) {
      const due = r.dueDate ? new Date(r.dueDate) : null;
      const pend = pendingOf(r);
      if (!due) continue;
      const diff = Math.floor((due.getTime() - start.getTime()) / 86_400_000);
      if (diff < 0) buckets.overdue += pend;
      else if (diff === 0) buckets.today += pend;
      else if (diff <= 7) buckets.d7 += pend;
      else if (diff <= 30) buckets.d30 += pend;
    }
    return buckets;
  }, [filtered, mode]);

  async function registerPayment(row: InvoiceRow) {
    const pend = pendingOf(row);
    if (pend <= 0) return;
    const amountStr = window.prompt(`Monto a registrar (saldo ${pend.toFixed(2)})`, String(pend.toFixed(2)));
    if (!amountStr) return;
    const amount = Number(amountStr);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Monto inválido");
      return;
    }
    setPayingId(row.id);
    try {
      await apiFetch(`accounting/invoices/${row.id}/payments`, token, {
        method: "POST",
        body: JSON.stringify({
          amount,
          paymentDate: new Date().toISOString().slice(0, 10),
          method: "SPEI",
        }),
      });
      toast.success("Pago registrado");
      await load();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setPayingId(null);
    }
  }

  const columns: Column<InvoiceRow>[] = [
    {
      key: "invoiceNumber",
      label: "Folio",
      render: (r) => <strong style={{ fontSize: 12 }}>{r.invoiceNumber}</strong>,
    },
    {
      key: "party",
      label: mode === "cxp" ? "Proveedor" : mode === "cxc" ? "Cliente" : "Contraparte",
      render: (r) => r.receptorName || r.emisorName || "—",
    },
    {
      key: "issueDate",
      label: "Emisión",
      render: (r) => (r.issueDate ? new Date(r.issueDate).toLocaleDateString("es-MX") : "—"),
    },
    {
      key: "dueDate",
      label: "Vence",
      render: (r) => {
        const od = daysOverdue(r.dueDate);
        return (
          <span style={{ color: od != null && od > 0 ? "var(--danger)" : undefined }}>
            {r.dueDate ? new Date(r.dueDate).toLocaleDateString("es-MX") : "—"}
            {od != null && od > 0 ? ` (+${od}d)` : ""}
          </span>
        );
      },
    },
    {
      key: "total",
      label: "Total",
      align: "right",
      numeric: true,
      render: (r) => <Money value={Number(r.totalAmount || 0)} />,
    },
    {
      key: "pending",
      label: "Saldo",
      align: "right",
      numeric: true,
      render: (r) => <Money value={pendingOf(r)} />,
    },
    {
      key: "status",
      label: "Estado",
      render: (r) => (
        <Tag variant={r.status === "OVERDUE" ? "danger" : r.status === "PAID" ? "positive" : "neutral"}>
          {r.status}
        </Tag>
      ),
    },
    {
      key: "cfdi",
      label: "CFDI",
      render: (r) =>
        r.cfdiXml || r.cfdiUuid ? <Tag variant="positive">OK</Tag> : <Tag variant="warning">Sin XML</Tag>,
    },
    {
      key: "actions",
      label: "",
      render: (r) =>
        pendingOf(r) > 0.01 ? (
          <Button size="sm" variant="secondary" disabled={payingId === r.id} onClick={() => void registerPayment(r)}>
            Registrar pago
          </Button>
        ) : null,
    },
  ];

  const pageTitle =
    title ??
    (mode === "cxc" ? "Cuentas por cobrar" : mode === "cxp" ? "Cuentas por pagar" : "Facturas");

  return (
    <>
      <PageHeader
        eyebrow="ERP · Contabilidad"
        title={pageTitle}
        subtitle={subtitle ?? "Vista densa sobre facturas existentes. Sin segundo ledger."}
        density="ops"
        actions={
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
            Actualizar
          </Button>
        }
      />

      {calendar && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 12 }}>
          <Section dense title="Vencido"><Money value={calendar.overdue} /></Section>
          <Section dense title="Hoy"><Money value={calendar.today} /></Section>
          <Section dense title="7 días"><Money value={calendar.d7} /></Section>
          <Section dense title="30 días"><Money value={calendar.d30} /></Section>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <FilterToolbar
          search={{ value: q, onChange: setQ, placeholder: "Buscar folio, cliente, UUID…" }}
          resultCount={filtered.length}
        />
      </div>

      {error && (
        <div style={{ padding: 12, marginBottom: 12, color: "var(--danger)", fontSize: 13 }}>{error}</div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Cargando…</p>
      ) : filtered.length === 0 ? (
        <EmptyState title="Sin registros" description="No hay facturas con estos filtros." />
      ) : (
        <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} density="compact" />
      )}
    </>
  );
}
