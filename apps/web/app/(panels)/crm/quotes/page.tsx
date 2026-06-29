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
  clientCompany: "", clientName: "", clientEmail: "",
  projectName: "", currency: "MXN",
  validDays: 15, notes: "",
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [lines, setLines] = useState<LineItem[]>([emptyItem()]);

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
    if (showForm && token && !clients.length) {
      listSalesClients(token).then(setClients).catch(() => { /* ok */ });
    }
  }, [showForm, token, clients.length]);

  // When a client is selected from dropdown, autofill name/email
  const selectClient = (id: string) => {
    const c = clients.find((c) => String(c.id) === id);
    if (c) setForm((f) => ({
      ...f,
      clientCompany: c.legalName?.trim() || c.name,
      clientName: "",
      clientEmail: c.billingEmail ?? "",
    }));
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

  const highlighted = useMemo(() => {
    if (!highlightId) return items;
    const id = Number(highlightId);
    return [...items].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
  }, [items, highlightId]);

  const fmtMXN = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
      key: "status", label: "Estado",
      render: (q) => {
        const s = q.status;
        const v = s === "APPROVED" ? "positive" : s === "REJECTED" || s === "EXPIRED" ? "danger" : s === "SENT" ? "accent" : "neutral";
        return <Tag variant={v}>{formatStatus(s)}</Tag>;
      },
      width: 100,
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
      {!loading && items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
          <KpiCard label="Total" value={items.length} icon="📋" />
          <KpiCard label="Aprobadas" value={items.filter((q) => q.status === "APPROVED").length} variant="positive" icon="✅" />
          <KpiCard label="Pendientes" value={items.filter((q) => ["DRAFT", "SENT"].includes(q.status)).length} icon="⏳" />
          <KpiCard label="Rechazadas" value={items.filter((q) => q.status === "REJECTED").length} variant="danger" icon="❌" />
        </div>
      )}

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
                <select onChange={(e) => selectClient(e.target.value)} style={inp} defaultValue="">
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

      <Section title={loading ? "Cargando…" : `${items.length} cotización${items.length === 1 ? "" : "es"}`}>
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
