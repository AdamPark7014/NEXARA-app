"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getCrmSalesSectionConfig } from "@/lib/section-views";
import { formatQuoteStatus, listSalesQuotes, createSalesQuote, listSalesClients, type SalesQuote, type SalesClient } from "@/lib/sales-api";
import FilterToolbar from "@/components/FilterToolbar";
import { exportToExcel } from "@/lib/export-excel";
import { buildApiUrl } from "@/lib/api-base";

// ─── Inline styles ────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8,
  background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box",
};
const numInp: React.CSSProperties = { ...inp, width: "100%", textAlign: "right" };

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineItem { name: string; qty: number; unitPrice: number; discount: number; tax: number; description: string }

const emptyItem = (): LineItem => ({ name: "", qty: 1, unitPrice: 0, discount: 0, tax: 16, description: "" });

const emptyForm = {
  salesClientId: "" as string,
  clientCompany: "", clientName: "", clientEmail: "",
  projectName: "", currency: "MXN",
  validDays: 15, notes: "",
};

const toDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getCurrentMonthPeriod = () => {
  const today = new Date();
  return {
    from: toDateInput(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: toDateInput(today),
  };
};

function calcLine(it: LineItem) {
  const sub = it.qty * it.unitPrice;
  const disc = sub * (it.discount / 100);
  const tax = (sub - disc) * (it.tax / 100);
  return sub - disc + tax;
}

function formatStatus(s: string) {
  const m: Record<string, string> = { DRAFT: "Borrador", SENT: "Enviada", APPROVED: "Aprobada", REJECTED: "Rechazada", EXPIRED: "Vencida" };
  return m[s] ?? s;
}

export default function QuotesPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getCrmSalesSectionConfig(user, "quotes"), [user]);
  const token = user?.token ?? "";
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const [items, setItems] = useState<SalesQuote[]>([]);
  const [clients, setClients] = useState<SalesClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [lines, setLines] = useState<LineItem[]>([emptyItem()]);
  const [pdfBusyId, setPdfBusyId] = useState<number | null>(null);
  const [pdfErr, setPdfErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    try {
      setItems(await listSalesQuotes(token));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No se pudieron cargar las cotizaciones");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const currentMonth = getCurrentMonthPeriod();
    setPeriodFrom(currentMonth.from);
    setPeriodTo(currentMonth.to);
  }, []);

  useEffect(() => {
    if (showForm && token && !clients.length) {
      listSalesClients(token).then(setClients).catch(() => { /* ok */ });
    }
  }, [showForm, token, clients.length]);

  // When a client is selected from dropdown, autofill name/email
  const selectClient = (id: string) => {
    const c = clients.find((c) => String(c.id) === id);
    if (c) setForm((f) => ({
      ...f,
      salesClientId: String(c.id),
      clientCompany: c.legalName?.trim() || c.name,
      clientName: "",
      clientEmail: c.billingEmail ?? "",
    }));
    else setForm((f) => ({ ...f, salesClientId: "" }));
  };

  // Line items helpers
  const addLine = () => setLines((l) => [...l, emptyItem()]);
  const removeLine = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));
  const setLine = (i: number, patch: Partial<LineItem>) =>
    setLines((l) => l.map((it, idx) => idx === i ? { ...it, ...patch } : it));

  const subtotal = lines.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const discountTotal = lines.reduce((s, it) => s + it.qty * it.unitPrice * (it.discount / 100), 0);
  const taxTotal = lines.reduce((s, it) => { const base = it.qty * it.unitPrice * (1 - it.discount / 100); return s + base * (it.tax / 100); }, 0);
  const total = subtotal - discountTotal + taxTotal;

  const openForm = () => {
    setForm({ ...emptyForm });
    setLines([emptyItem()]);
    setSaveErr(null);
    setShowForm(true);
  };

  const save = async () => {
    const validLines = lines.filter((l) => l.name.trim() && l.unitPrice > 0);
    if (!token || !form.clientCompany.trim() || validLines.length === 0) return;
    setSaving(true);
    try {
      const quoteNumber = `COT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`;
      const validUntil = new Date(Date.now() + form.validDays * 86400000).toISOString().slice(0, 10);
      await createSalesQuote(token, {
        quoteNumber,
        issueDate: new Date().toISOString().slice(0, 10),
        validUntil,
        salesClientId: form.salesClientId ? Number(form.salesClientId) : undefined,
        clientCompany: form.clientCompany.trim(),
        clientName: form.clientName.trim() || undefined,
        clientEmail: form.clientEmail.trim() || undefined,
        projectName: form.projectName.trim() || undefined,
        items: validLines.map((l) => ({
          name: l.name.trim(),
          qty: l.qty,
          unitPrice: l.unitPrice,
          discount: l.discount,
          tax: l.tax,
          description: l.description.trim() || undefined,
        })),
      });
      setShowForm(false);
      void load();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "No se pudo crear la cotización");
    } finally { setSaving(false); }
  };

  const periodItems = useMemo(() => items.filter((quote) => {
    const issueDay = String(quote.issueDate ?? "").slice(0, 10);
    if (periodFrom && issueDay < periodFrom) return false;
    if (periodTo && issueDay > periodTo) return false;
    return true;
  }), [items, periodFrom, periodTo]);

  const highlighted = useMemo(() => {
    let rows = periodItems;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((qt) =>
        (qt.quoteNumber ?? "").toLowerCase().includes(q) ||
        (qt.clientCompany ?? "").toLowerCase().includes(q) ||
        (qt.clientName ?? "").toLowerCase().includes(q) ||
        (qt.projectName ?? "").toLowerCase().includes(q)
      );
    }
    if (filterStatus) rows = rows.filter((qt) => qt.status === filterStatus);
    if (highlightId) {
      const id = Number(highlightId);
      rows = [...rows].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
    }
    return rows;
  }, [periodItems, highlightId, searchQ, filterStatus]);

  const fmtMXN = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Descarga el PDF dinámico de la cotización (mismo endpoint que el detalle)
  const downloadQuotePdf = async (q: SalesQuote) => {
    if (!token || pdfBusyId !== null) return;
    setPdfBusyId(q.id);
    setPdfErr(null);
    try {
      const res = await fetch(buildApiUrl(`cotizaciones/${q.id}/pdf`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cotizacion-${q.quoteNumber ?? q.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setPdfErr(`No se pudo descargar el PDF de ${q.quoteNumber}: ${e instanceof Error ? e.message : "error desconocido"}`);
    } finally {
      setPdfBusyId(null);
    }
  };

  // Resumen Excel de todas las cotizaciones del periodo cargado
  const exportQuotesExcel = () => {
    if (periodItems.length === 0) return;
    const formatPeriodDay = (value: string) =>
      new Date(`${value}T12:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
    const periodo = periodFrom && periodTo
      ? `Periodo: ${formatPeriodDay(periodFrom)} — ${formatPeriodDay(periodTo)}`
      : undefined;

    const aprobadas = periodItems.filter((q) => q.status === "APPROVED");
    const valorTotal = periodItems.reduce((s, q) => s + Number(q.total ?? 0), 0);
    const valorAprobado = aprobadas.reduce((s, q) => s + Number(q.total ?? 0), 0);
    const countBy = (s: string) => periodItems.filter((q) => q.status === s).length;

    exportToExcel(periodItems, [
      { key: "quoteNumber", label: "Folio" },
      { key: "issueDate", label: "Emisión", format: (v) => (v ? String(v).slice(0, 10) : "") },
      { key: "clientCompany", label: "Cliente" },
      { key: "clientName", label: "Contacto" },
      { key: "projectName", label: "Proyecto" },
      { key: "total", label: "Total" },
      { key: "status", label: "Estado", format: (v) => formatStatus(String(v ?? "")) },
      { key: "validUntil", label: "Vigencia", format: (v) => (v ? String(v).slice(0, 10) : "") },
    ], `cotizaciones-${new Date().toISOString().slice(0, 10)}`, {
      title: "RESUMEN DE COTIZACIONES",
      subtitle: periodo,
      summaryRows: [
        { label: "Cotizaciones en el periodo", value: periodItems.length },
        { label: "Borrador", value: countBy("DRAFT") },
        { label: "Enviadas", value: countBy("SENT") },
        { label: "Aprobadas", value: aprobadas.length },
        { label: "Rechazadas", value: countBy("REJECTED") },
        { label: "Valor total cotizado", value: valorTotal },
        { label: "Valor aprobado", value: valorAprobado },
        { label: "Tasa de aprobación", value: `${Math.round((aprobadas.length / periodItems.length) * 100)}%` },
      ],
    });
  };

  const columns: Column<SalesQuote>[] = [
    {
      key: "quoteNumber", label: "Cotización",
      render: (q) => (
        <div>
          <Link href={`/crm/quotes/${q.id}`} style={{ fontWeight: 700, fontSize: 13, color: "var(--primary)", textDecoration: "none" }}>
            {q.quoteNumber}
          </Link>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
            {new Date(q.issueDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
          </div>
        </div>
      ),
    },
    {
      key: "clientCompany", label: "Cliente",
      render: (q) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{q.clientCompany ?? "—"}</div>
          {q.clientName && <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{q.clientName}</div>}
        </div>
      ),
    },
    { key: "projectName", label: "Proyecto", render: (q) => q.projectName ?? "—", width: 160 },
    { key: "total", label: "Total", align: "right", render: (q) => <Money value={Number(q.total)} />, width: 110 },
    {
      key: "validUntil", label: "Vigencia",
      render: (q) => {
        if (!q.validUntil) return <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>—</span>;
        const daysLeft = Math.ceil((new Date(q.validUntil).getTime() - Date.now()) / 86400000);
        const isActive = q.status !== "APPROVED" && q.status !== "REJECTED";
        if (!isActive) return <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{new Date(q.validUntil).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}</span>;
        const color = daysLeft < 0 ? "var(--danger)" : daysLeft <= 5 ? "var(--danger)" : daysLeft <= 14 ? "var(--warning)" : "var(--text-secondary)";
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 12, color }}>{new Date(q.validUntil).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color }}>{daysLeft < 0 ? "EXPIRADA" : `${daysLeft}d`}</span>
          </div>
        );
      },
      width: 90,
    },
    {
      key: "status", label: "Estado",
      render: (q) => {
        const s = q.status;
        const v = s === "APPROVED" ? "positive" : s === "REJECTED" || s === "EXPIRED" ? "danger" : s === "SENT" ? "accent" : "neutral";
        return <Tag variant={v}>{formatStatus(s)}</Tag>;
      },
      width: 100,
    },
    {
      key: "id", label: "PDF", align: "center",
      render: (q) => (
        <Button
          variant="ghost"
          size="sm"
          iconLeft="📄"
          loading={pdfBusyId === q.id}
          disabled={pdfBusyId !== null && pdfBusyId !== q.id}
          onClick={() => void downloadQuotePdf(q)}
          title={`Descargar PDF de ${q.quoteNumber}`}
        >
          PDF
        </Button>
      ),
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
          <>
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate && <Button variant="primary" iconLeft="+" onClick={openForm}>Nueva cotización</Button>}
          </>
        }
      />

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      {!loading && periodItems.length > 0 && (() => {
        const aprobadas = periodItems.filter((q) => q.status === "APPROVED");
        const valorAprobado = aprobadas.reduce((s, q) => s + Number(q.total ?? 0), 0);
        const valorTotal = periodItems.reduce((s, q) => s + Number(q.total ?? 0), 0);
        const tasaAprobacion = Math.round((aprobadas.length / periodItems.length) * 100);
        const byStatus = [
          { label: "Borrador", count: periodItems.filter((q) => q.status === "DRAFT").length, color: "var(--text-tertiary)" },
          { label: "Enviada", count: periodItems.filter((q) => q.status === "SENT").length, color: "var(--primary)" },
          { label: "Aprobada", count: aprobadas.length, color: "var(--success)" },
          { label: "Rechazada", count: periodItems.filter((q) => q.status === "REJECTED").length, color: "var(--danger)" },
        ].filter((x) => x.count > 0);
        return (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 14 }}>
              <KpiCard label="Total" value={periodItems.length} icon="📋" />
              <KpiCard label="Aprobadas" value={aprobadas.length} variant="positive" icon="✅" hint={`${tasaAprobacion}% aprobación`} />
              <KpiCard label="Valor aprobado" value={<Money value={valorAprobado} compact />} variant="positive" icon="💰" hint={`de ${new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", notation: "compact" }).format(valorTotal)} total`} />
              <KpiCard label="Rechazadas" value={periodItems.filter((q) => q.status === "REJECTED").length} variant="danger" icon="❌" />
            </div>
            {byStatus.length > 0 && (
              <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Estado de cotizaciones</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {byStatus.map(({ label, count, color }) => (
                    <div key={label} style={{ display: "grid", gridTemplateColumns: "90px 1fr 36px", gap: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{label}</span>
                      <div style={{ height: 6, borderRadius: 3, background: "var(--surface)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(count / periodItems.length) * 100}%`, background: color, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", textAlign: "right" }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        );
      })()}

      {/* ── Modal: Nueva cotización ───────────────────────────────────────── */}
      {showForm && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 1000, overflowY: "auto", padding: "32px 16px" }}
          onClick={() => setShowForm(false)}
        >
          <div
            style={{ background: "var(--surface)", borderRadius: 16, padding: "28px 32px", width: 700, maxWidth: "100%", maxHeight: "min(90vh, 920px)", overflowY: "auto", boxShadow: "0 24px 56px rgba(0,0,0,0.28)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>Nueva cotización</div>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 }}>
                Completa el cliente y al menos una partida con precio.
              </div>
            </div>

            {/* ── Sección: Cliente ── */}
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              Cliente
            </div>
            {clients.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                  Seleccionar cliente existente
                </label>
                <select
                  value={form.salesClientId}
                  onChange={(e) => selectClient(e.target.value)}
                  style={inp}
                >
                  <option value="">— buscar en cartera —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.legalName?.trim() || c.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Empresa / Razón social *</label>
                <input value={form.clientCompany} onChange={(e) => setForm((f) => ({ ...f, clientCompany: e.target.value }))} placeholder="Empresa S.A. de C.V." style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Contacto</label>
                <input value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))} placeholder="Nombre del contacto" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Email</label>
                <input type="email" value={form.clientEmail} onChange={(e) => setForm((f) => ({ ...f, clientEmail: e.target.value }))} placeholder="correo@empresa.com" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Proyecto / obra</label>
                <input value={form.projectName} onChange={(e) => setForm((f) => ({ ...f, projectName: e.target.value }))} placeholder="Nombre del proyecto" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Vigencia (días)</label>
                <input type="number" min={1} max={365} value={form.validDays} onChange={(e) => setForm((f) => ({ ...f, validDays: Number(e.target.value) }))} style={inp} />
              </div>
            </div>

            {/* ── Sección: Partidas ── */}
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              Partidas
            </div>
            <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
              {/* Header row */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 60px 110px 60px 60px 32px", gap: 6, padding: "8px 10px", background: "var(--surface-2)", fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)" }}>
                <span>Descripción</span><span style={{ textAlign: "center" }}>Cant.</span><span style={{ textAlign: "right" }}>P. Unit.</span>
                <span style={{ textAlign: "center" }}>Dto%</span><span style={{ textAlign: "center" }}>IVA%</span><span />
              </div>
              {lines.map((line, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 60px 110px 60px 60px 32px", gap: 6, padding: "8px 10px", borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                  <input value={line.name} onChange={(e) => setLine(i, { name: e.target.value })} placeholder={`Artículo o servicio ${i + 1}`} style={{ ...inp, padding: "6px 8px" }} />
                  <input type="number" min={1} value={line.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} style={{ ...numInp, padding: "6px 8px" }} />
                  <input type="number" min={0} step={0.01} value={line.unitPrice} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} style={{ ...numInp, padding: "6px 8px" }} />
                  <input type="number" min={0} max={100} value={line.discount} onChange={(e) => setLine(i, { discount: Number(e.target.value) })} style={{ ...numInp, padding: "6px 8px" }} />
                  <input type="number" min={0} max={100} value={line.tax} onChange={(e) => setLine(i, { tax: Number(e.target.value) })} style={{ ...numInp, padding: "6px 8px" }} />
                  <button onClick={() => removeLine(i)} disabled={lines.length === 1}
                    style={{ background: "none", border: "none", cursor: lines.length > 1 ? "pointer" : "default", color: "var(--text-tertiary)", fontSize: 16, opacity: lines.length > 1 ? 1 : 0.3 }}>✕</button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="secondary" onClick={addLine} iconLeft="+">Agregar partida</Button>

            {/* ── Totals ── */}
            <div style={{ marginTop: 16, padding: "14px 16px", background: "var(--surface-2)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { label: "Subtotal", value: fmtMXN(subtotal) },
                ...(discountTotal > 0 ? [{ label: "Descuentos", value: `− ${fmtMXN(discountTotal)}`, color: "#dc2626" }] : []),
                { label: "IVA", value: fmtMXN(taxTotal) },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: color ?? "var(--text-secondary)" }}>
                  <span>{label}</span><span>{value}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15, borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 4 }}>
                <span>Total</span><span style={{ color: "var(--primary)" }}>{fmtMXN(total)} {form.currency}</span>
              </div>
            </div>

            {/* ── Notes ── */}
            <div style={{ marginTop: 14 }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Notas / condiciones</label>
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} placeholder="Condiciones de pago, tiempo de entrega, garantía…" />
            </div>

            {saveErr && <p style={{ marginBottom: 8, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 12 }}>{saveErr}</p>}
            <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void save()} disabled={saving || !form.clientCompany.trim() || lines.filter((l) => l.name.trim() && l.unitPrice > 0).length === 0}>
                {saving ? "Creando…" : "Crear cotización"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por folio, cliente o proyecto…" }}
        dates={[
          { label: "Desde", value: periodFrom, onChange: setPeriodFrom },
          { label: "Hasta", value: periodTo, onChange: setPeriodTo },
        ]}
        selects={[{
          label: "Estado",
          value: filterStatus,
          onChange: setFilterStatus,
          options: [
            { value: "DRAFT", label: "Borrador" },
            { value: "SENT", label: "Enviada" },
            { value: "APPROVED", label: "Aprobada" },
            { value: "REJECTED", label: "Rechazada" },
            { value: "EXPIRED", label: "Vencida" },
          ],
          allowAll: true,
        }]}
        onClear={() => {
          const currentMonth = getCurrentMonthPeriod();
          setSearchQ("");
          setFilterStatus("");
          setPeriodFrom(currentMonth.from);
          setPeriodTo(currentMonth.to);
        }}
        resultCount={loading ? null : highlighted.length}
        rightActions={periodItems.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={exportQuotesExcel}>Excel</Button>
        ) : undefined}
      />

      {pdfErr && (
        <p style={{ margin: "10px 0", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--danger)", color: "var(--danger)", fontSize: 12 }}>
          {pdfErr}
        </p>
      )}

      <Section title={loading ? "Cargando…" : `${highlighted.length} cotización${highlighted.length === 1 ? "" : "es"}`}>
        {loading && <EmptyState icon="⏳" title="Cargando cotizaciones…" description="Consultando documentos." />}
        {!loading && loadError && (
          <EmptyState icon="⚠️" title="No se pudo cargar" description={loadError} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />
        )}
        {!loading && !loadError && (
          <DataTable columns={columns} rows={highlighted} rowKey={(q) => q.id}
            emptyTitle="Sin cotizaciones" emptyDescription="Genera la primera cotización con el botón de arriba." />
        )}
      </Section>
    </>
  );
}
