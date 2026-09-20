"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import FilterToolbar from "@/components/FilterToolbar";
import Modal from "@/components/ui/Modal";
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

/** Estado para humanos — nunca enums crudos. */
function statusLabel(row: InvoiceRow): { text: string; tone: "ok" | "warn" | "bad" | "mute" } {
  const pend = pendingOf(row);
  const od = daysOverdue(row.dueDate);
  if (row.status === "CANCELLED" || row.status === "DRAFT") return { text: row.status === "DRAFT" ? "Borrador" : "Cancelada", tone: "mute" };
  if (pend <= 0.01 || row.status === "PAID") return { text: "Pagada", tone: "ok" };
  if (od != null && od > 0) return { text: `Vencida · ${od}d`, tone: "bad" };
  if (Number(row.paidAmount || 0) > 0) return { text: "Parcial", tone: "warn" };
  return { text: "Pendiente", tone: "mute" };
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
  const [selected, setSelected] = useState<InvoiceRow | null>(null);
  const [paying, setPaying] = useState(false);

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
      [r.invoiceNumber, r.receptorName, r.emisorName, r.cfdiUuid]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [items, q, mode]);

  const calendar = useMemo(() => {
    if (mode !== "cxp") return null;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const buckets = { today: 0, d7: 0, overdue: 0 };
    for (const r of filtered) {
      const due = r.dueDate ? new Date(r.dueDate) : null;
      const pend = pendingOf(r);
      if (!due) continue;
      const diff = Math.floor((due.getTime() - start.getTime()) / 86_400_000);
      if (diff < 0) buckets.overdue += pend;
      else if (diff === 0) buckets.today += pend;
      else if (diff <= 7) buckets.d7 += pend;
    }
    return buckets;
  }, [filtered, mode]);

  async function registerPayment(row: InvoiceRow) {
    const pend = pendingOf(row);
    if (pend <= 0) return;
    const amountStr = window.prompt(
      `Monto a registrar (saldo ${pend.toFixed(2)})`,
      String(pend.toFixed(2)),
    );
    if (!amountStr) return;
    const amount = Number(amountStr);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Indica un monto válido");
      return;
    }
    setPaying(true);
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
      setSelected(null);
      await load();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setPaying(false);
    }
  }

  const partyLabel = mode === "cxp" ? "Proveedor" : mode === "cxc" ? "Cliente" : "Contraparte";

  const columns: Column<InvoiceRow>[] = [
    {
      key: "party",
      label: partyLabel,
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.receptorName || r.emisorName || "Sin nombre"}</div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{r.invoiceNumber}</div>
        </div>
      ),
    },
    {
      key: "due",
      label: "Vence",
      render: (r) => {
        const od = daysOverdue(r.dueDate);
        return (
          <span style={{ color: od != null && od > 0 ? "var(--danger)" : undefined }}>
            {r.dueDate ? new Date(r.dueDate).toLocaleDateString("es-MX") : "—"}
          </span>
        );
      },
    },
    {
      key: "saldo",
      label: "Saldo",
      align: "right",
      numeric: true,
      render: (r) => <Money value={pendingOf(r)} />,
    },
    {
      key: "estado",
      label: "Estado",
      render: (r) => {
        const s = statusLabel(r);
        const color =
          s.tone === "bad"
            ? "var(--danger)"
            : s.tone === "warn"
              ? "var(--warning)"
              : s.tone === "ok"
                ? "var(--success)"
                : "var(--text-secondary)";
        return <span style={{ fontSize: 12.5, fontWeight: 600, color }}>{s.text}</span>;
      },
    },
  ];

  const pageTitle =
    title ??
    (mode === "cxc" ? "Por cobrar" : mode === "cxp" ? "Por pagar" : "Facturas");

  const pageSubtitle =
    subtitle ??
    (mode === "cxc"
      ? "Quién te debe y qué urge cobrar."
      : mode === "cxp"
        ? "Qué debes pagar y cuándo."
        : "Documentos emitidos y recibidos.");

  const emptyTitle =
    mode === "cxc"
      ? "Nada por cobrar"
      : mode === "cxp"
        ? "Nada por pagar"
        : "Sin facturas";
  const emptyDesc =
    mode === "all"
      ? "Cuando registres o recibas una factura, aparecerá aquí."
      : "No hay saldos abiertos con estos filtros.";

  return (
    <>
      <PageHeader
        eyebrow="Contabilidad"
        title={pageTitle}
        subtitle={pageSubtitle}
        density="ops"
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {mode === "all" && (
              <Link
                href="/erp/invoicing"
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "6px 12px",
                  borderRadius: 8,
                  background: "var(--primary)",
                  color: "#fff",
                  textDecoration: "none",
                }}
              >
                Nueva factura
              </Link>
            )}
            <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
              Actualizar
            </Button>
          </div>
        }
      />

      {calendar && (calendar.overdue > 0 || calendar.today > 0 || calendar.d7 > 0) && (
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-secondary)" }}>
          {calendar.overdue > 0 && (
            <span style={{ color: "var(--danger)", fontWeight: 600, marginRight: 12 }}>
              Vencido <Money value={calendar.overdue} />
            </span>
          )}
          {calendar.today > 0 && (
            <span style={{ marginRight: 12 }}>
              Hoy <strong><Money value={calendar.today} /></strong>
            </span>
          )}
          {calendar.d7 > 0 && (
            <span>
              Próx. 7 días <strong><Money value={calendar.d7} /></strong>
            </span>
          )}
        </p>
      )}

      <div style={{ marginBottom: 12 }}>
        <FilterToolbar
          search={{
            value: q,
            onChange: setQ,
            placeholder: `Buscar ${partyLabel.toLowerCase()} o folio…`,
          }}
          resultCount={filtered.length}
        />
      </div>

      {error && (
        <div role="alert" style={{ marginBottom: 12, fontSize: 13, color: "var(--danger)" }}>
          No se pudo cargar la lista.{" "}
          <button type="button" onClick={() => void load()} style={{ fontWeight: 700, textDecoration: "underline", background: "none", border: "none", color: "inherit", cursor: "pointer" }}>
            Reintentar
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Cargando…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDesc}
          action={
            mode === "all" ? (
              <Link href="/erp/invoicing" style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)" }}>
                Ir a facturación →
              </Link>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.id}
          density="compact"
          onRowClick={(r) => setSelected(r)}
        />
      )}

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.invoiceNumber || "Factura"}
        footer={
          selected && pendingOf(selected) > 0.01 ? (
            <Button
              variant="primary"
              loading={paying}
              onClick={() => selected && void registerPayment(selected)}
            >
              Registrar pago
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Cerrar
            </Button>
          )
        }
      >
        {selected && (
          <div style={{ display: "grid", gap: 12, fontSize: 13 }}>
            <div>
              <div style={{ color: "var(--text-tertiary)", fontSize: 11, marginBottom: 2 }}>{partyLabel}</div>
              <div style={{ fontWeight: 600 }}>{selected.receptorName || selected.emisorName || "—"}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ color: "var(--text-tertiary)", fontSize: 11 }}>Emisión</div>
                <div>{selected.issueDate ? new Date(selected.issueDate).toLocaleDateString("es-MX") : "—"}</div>
              </div>
              <div>
                <div style={{ color: "var(--text-tertiary)", fontSize: 11 }}>Vence</div>
                <div>{selected.dueDate ? new Date(selected.dueDate).toLocaleDateString("es-MX") : "—"}</div>
              </div>
              <div>
                <div style={{ color: "var(--text-tertiary)", fontSize: 11 }}>Total</div>
                <div style={{ fontWeight: 600 }}><Money value={Number(selected.totalAmount || 0)} /></div>
              </div>
              <div>
                <div style={{ color: "var(--text-tertiary)", fontSize: 11 }}>Saldo</div>
                <div style={{ fontWeight: 700 }}><Money value={pendingOf(selected)} /></div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              CFDI:{" "}
              {selected.cfdiXml || selected.cfdiUuid ? (
                <span style={{ color: "var(--success)", fontWeight: 600 }}>Con XML</span>
              ) : (
                <span style={{ color: "var(--warning)", fontWeight: 600 }}>Sin XML — completar cuando exista</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              Estado: {statusLabel(selected).text}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
