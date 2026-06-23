"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { useRbacGuard } from "@/lib/useRbacGuard";
import { buildApiUrl } from "@/lib/api-base";

interface InvoiceRow {
  id: number;
  invoiceNumber: string;
  type: "INCOME" | "EXPENSE" | string;
  status: "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED" | string;
  issueDate: string;
  totalAmount: number | string;
  cfdiUuid?: string | null;
  receptorName?: string | null;
  emisorName?: string | null;
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

export default function InvoicingPage() {
  const { user } = useUser();
  const { canApprove, canDelete } = useRbacGuard();
  const token = user?.token ?? "";

  const [items, setItems] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"" | "INCOME" | "EXPENSE">("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const qs = filter ? `?type=${filter}` : "";
      const data = await apiFetch(`accounting/invoices${qs}`, token);
      setItems(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar facturación");
    } finally { setLoading(false); }
  }, [token, filter]);

  useEffect(() => { void load(); }, [load]);

  const facturadoMes = items.filter((f) => f.type === "INCOME" && f.status !== "CANCELLED").reduce((s, f) => s + Number(f.totalAmount), 0);
  const porTimbrar = items.filter((f) => f.status === "DRAFT").length;
  const canceladas = items.filter((f) => f.status === "CANCELLED").length;
  const vencidas = items.filter((f) => f.status === "OVERDUE").length;

  const stamp = async (inv: InvoiceRow) => {
    if (!token) return;
    try {
      await apiFetch(`accounting/invoices/${inv.id}/stamp`, token, { method: "POST" });
      void load();
    } catch (e) { alert(`Error al timbrar: ${e instanceof Error ? e.message : "desconocido"}`); }
  };

  const cancel = async (inv: InvoiceRow) => {
    if (!token || !confirm(`¿Cancelar el CFDI ${inv.invoiceNumber}?`)) return;
    try {
      await apiFetch(`accounting/invoices/${inv.id}/cancel`, token, { method: "PATCH", body: JSON.stringify({ reason: "02" }) });
      void load();
    } catch (e) { alert(`Error al cancelar: ${e instanceof Error ? e.message : "desconocido"}`); }
  };

  const statusVariant = (s: string): "positive" | "warning" | "danger" | "default" => {
    if (s === "PAID") return "positive";
    if (s === "CANCELLED" || s === "OVERDUE") return "danger";
    if (s === "DRAFT" || s === "SENT" || s === "PARTIALLY_PAID") return "warning";
    return "default";
  };

  const columns: Column<InvoiceRow>[] = [
    { key: "invoiceNumber", label: "Folio", render: (f) => <Tag variant="accent">{f.invoiceNumber}</Tag>, width: 130 },
    { key: "cfdiUuid", label: "UUID", render: (f) => <code style={{ fontSize: 11 }}>{f.cfdiUuid ? `${f.cfdiUuid.slice(0, 8)}…` : "—"}</code>, width: 110 },
    { key: "receptorName", label: "Cliente / Proveedor", accessor: (f) => f.receptorName ?? f.emisorName ?? "—" },
    { key: "type", label: "Tipo", render: (f) => <Tag variant={f.type === "INCOME" ? "positive" : "danger"}>{f.type === "INCOME" ? "Ingreso" : "Egreso"}</Tag>, width: 100 },
    { key: "totalAmount", label: "Monto", align: "right" as const, render: (f) => <Money value={Number(f.totalAmount)} />, width: 130 },
    { key: "issueDate", label: "Fecha", render: (f) => <span style={{ fontSize: 12 }}>{new Date(f.issueDate).toLocaleDateString("es-MX")}</span>, width: 100 },
    { key: "status", label: "Estado", render: (f) => <Tag variant={statusVariant(f.status)}>{f.status.replace(/_/g, " ")}</Tag>, width: 130 },
    ...(canApprove ? [{
      key: "acciones" as keyof InvoiceRow, label: "",
      render: (f: InvoiceRow) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          {f.status === "DRAFT" && <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); void stamp(f); }}>Timbrar</Button>}
          {canDelete && f.status !== "CANCELLED" && <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); void cancel(f); }}>Cancelar</Button>}
        </div>
      ),
      width: 180,
    }] : []),
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Finanzas"
        title="Facturación CFDI"
        subtitle="Timbrado, cancelaciones y complementos de pago en línea con el SAT."
        actions={
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 13 }}>
              <option value="">Todos los tipos</option>
              <option value="INCOME">Ingresos</option>
              <option value="EXPENSE">Egresos</option>
            </select>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 18 }}>
        <KpiCard label="Facturado (ingresos)" value={<Money value={facturadoMes} />} hint={`${items.filter((f) => f.type === "INCOME").length} CFDI`} variant="positive" icon="🧾" />
        <KpiCard label="Por timbrar" value={porTimbrar} hint="En borrador" variant={porTimbrar > 0 ? "warning" : "positive"} icon="⏳" />
        <KpiCard label="Canceladas" value={canceladas} variant={canceladas > 0 ? "danger" : "default"} icon="✗" />
        <KpiCard label="Vencidas" value={vencidas} variant={vencidas > 0 ? "danger" : "positive"} icon="🛡️" />
      </div>

      <Section title={loading ? "Cargando…" : `${items.length} CFDI`}>
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando facturación." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={items} rowKey={(f) => f.id} emptyTitle="Sin facturas" emptyDescription="Las facturas se generan desde un proyecto de ventas cerrado." />}
      </Section>
    </>
  );
}
