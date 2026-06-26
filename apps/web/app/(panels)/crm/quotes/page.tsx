"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { getCrmSalesSectionConfig } from "@/lib/section-views";
import { formatQuoteStatus, listSalesQuotes, createSalesQuote, type SalesQuote } from "@/lib/sales-api";

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid var(--border)",
  borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box",
};

export default function QuotesPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getCrmSalesSectionConfig(user, "quotes"), [user]);
  const token = user?.token ?? "";
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const [items, setItems] = useState<SalesQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    clientCompany: "",
    clientName: "",
    clientEmail: "",
    projectName: "",
    itemName: "",
    qty: 1,
    unitPrice: 0,
  });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setItems(await listSalesQuotes(token));
    } catch {
      /* skip */
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!token || !form.clientCompany.trim() || !form.itemName.trim() || form.unitPrice <= 0) return;
    setSaving(true);
    try {
      const quoteNumber = `COT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`;
      await createSalesQuote(token, {
        quoteNumber,
        issueDate: new Date().toISOString().slice(0, 10),
        validUntil: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
        clientCompany: form.clientCompany.trim(),
        clientName: form.clientName.trim() || undefined,
        clientEmail: form.clientEmail.trim() || undefined,
        projectName: form.projectName.trim() || undefined,
        items: [{ name: form.itemName.trim(), qty: form.qty, unitPrice: form.unitPrice }],
      });
      setShowForm(false);
      void load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo crear la cotización");
    } finally {
      setSaving(false);
    }
  };

  const visible = useMemo(() => {
    let rows = items;
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) {
        rows = [...rows].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
      }
    }
    return rows;
  }, [items, highlightId]);

  const total = visible.reduce((s, q) => s + Number(q.total ?? 0), 0);
  const firmadas = visible.filter((q) => q.status === "APPROVED").reduce((s, q) => s + Number(q.total ?? 0), 0);
  const pendientes = visible.filter((q) => ["DRAFT", "SENT"].includes(q.status ?? "")).length;

  const estadoVariant = (status?: string): "accent" | "warning" | "neutral" | "danger" =>
    status === "APPROVED" ? "neutral" : status === "SENT" ? "accent" : "warning";

  const columns: Column<SalesQuote>[] = [
    {
      key: "quoteNumber",
      label: "Folio",
      render: (q) => (
        <Link href={`/crm/quotes/${q.id}`} style={{ fontSize: 11.5, color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
          <code>{q.quoteNumber ?? `COT-${q.id}`}</code>
        </Link>
      ),
      width: 120,
    },
    {
      key: "clientName",
      label: "Cliente / Proyecto",
      render: (q) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{q.clientCompany ?? q.clientName ?? "—"}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{q.projectName?.slice(0, 50)}</div>
        </div>
      ),
    },
    { key: "total", label: "Monto", render: (q) => <Money value={Number(q.total ?? 0)} />, width: 120 },
    { key: "status", label: "Estado", render: (q) => <Tag variant={estadoVariant(q.status)}>{formatQuoteStatus(q.status)}</Tag>, width: 100 },
    {
      key: "issueDate",
      label: "Emitida",
      accessor: (q) => (q.issueDate ? new Date(q.issueDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : "—"),
      width: 90,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Ventas"
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            {cfg.canCreate && (
              <Button variant="primary" iconLeft="+" onClick={() => setShowForm(true)}>Nueva cotización</Button>
            )}
            <Button variant="ghost" onClick={load}>Actualizar</Button>
          </div>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Total cotizado" value={`$${(total / 1000000).toFixed(1)}M`} />
        <KpiCard label="Firmado / ganado" value={`$${(firmadas / 1000000).toFixed(1)}M`} />
        <KpiCard label="Pendientes" value={pendientes} />
      </div>

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 18 }}>
          <p style={{ margin: "0 0 12px", fontWeight: 700, fontSize: 13 }}>Nueva cotización</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Empresa / Cliente *</span>
              <input value={form.clientCompany} onChange={(e) => setForm((f) => ({ ...f, clientCompany: e.target.value }))} style={inp} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Contacto</span>
              <input value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))} style={inp} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Email</span>
              <input type="email" value={form.clientEmail} onChange={(e) => setForm((f) => ({ ...f, clientEmail: e.target.value }))} style={inp} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Proyecto</span>
              <input value={form.projectName} onChange={(e) => setForm((f) => ({ ...f, projectName: e.target.value }))} style={inp} />
            </label>
            <label style={{ gridColumn: "1 / -1", display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Concepto principal *</span>
              <input value={form.itemName} onChange={(e) => setForm((f) => ({ ...f, itemName: e.target.value }))} placeholder="Instalación y puesta en marcha" style={inp} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Cantidad</span>
              <input type="number" min={1} value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: +e.target.value }))} style={inp} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Precio unitario *</span>
              <input type="number" min={0} step="0.01" value={form.unitPrice || ""} onChange={(e) => setForm((f) => ({ ...f, unitPrice: +e.target.value }))} style={inp} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void save()} disabled={saving}>{saving ? "Guardando…" : "Crear cotización"}</Button>
          </div>
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${visible.length} cotizaciones`}>
        {highlightId && (
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
            Mostrando cotización <strong>#{highlightId}</strong> desde enlace directo.
          </p>
        )}
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Cargando…</div>
        ) : (
          <DataTable
            columns={columns}
            rows={visible}
            rowKey={(q) => q.id}
            emptyTitle="Sin cotizaciones"
            emptyDescription="Las cotizaciones se generan desde una oportunidad."
          />
        )}
      </Section>
    </>
  );
}
