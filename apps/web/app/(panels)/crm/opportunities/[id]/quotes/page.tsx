"use client";

import Link from "next/link";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { Tag } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { createSalesQuote, linkSalesQuoteToOpportunity } from "@/lib/sales-api";
import { DetailError, DetailSection, formatDateTime } from "@/components/detail/DetailFrame";
import { useOpportunityDetail } from "@/components/crm/OpportunityDetailShell";
import { toast } from "@/components/Toast";

interface LineItem { name: string; qty: number; unitPrice: number; discount: number; tax: number }
const emptyItem = (): LineItem => ({ name: "", qty: 1, unitPrice: 0, discount: 0, tax: 16 });

const EMPTY_FORM = { projectName: "", validDays: 15, notes: "" };

const inp: React.CSSProperties = {
  width: "100%", padding: "7px 9px", border: "1px solid var(--border)", borderRadius: 7,
  background: "var(--surface-2)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box",
};
const numInp: React.CSSProperties = { ...inp, textAlign: "right" };

function fmtMXN(n: number) {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function OpportunityQuotesPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const { opportunity, error, reload } = useOpportunityDetail();

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [lines, setLines] = useState<LineItem[]>([emptyItem()]);

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!opportunity) return null;

  const addLine = () => setLines((l) => [...l, emptyItem()]);
  const removeLine = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));
  const setLine = (i: number, patch: Partial<LineItem>) =>
    setLines((l) => l.map((it, idx) => idx === i ? { ...it, ...patch } : it));

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const discTotal = lines.reduce((s, l) => s + l.qty * l.unitPrice * (l.discount / 100), 0);
  const taxTotal = lines.reduce((s, l) => { const b = l.qty * l.unitPrice * (1 - l.discount / 100); return s + b * (l.tax / 100); }, 0);
  const total = subtotal - discTotal + taxTotal;

  const createQuote = async () => {
    const validLines = lines.filter((l) => l.name.trim() && l.unitPrice > 0);
    if (!token || validLines.length === 0) return;
    setSaving(true);
    try {
      const clientName = opportunity.client?.name ?? opportunity.clientName ?? "";
      const quoteNumber = `COT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`;
      const created = await createSalesQuote(token, {
        quoteNumber,
        issueDate: new Date().toISOString().slice(0, 10),
        validUntil: new Date(Date.now() + form.validDays * 86400000).toISOString().slice(0, 10),
        clientCompany: clientName,
        projectName: form.projectName.trim() || opportunity.title,
        items: validLines.map((l) => ({ name: l.name.trim(), qty: l.qty, unitPrice: l.unitPrice, discount: l.discount, tax: l.tax })),
      }) as { id: number };
      if (created?.id) {
        await linkSalesQuoteToOpportunity(token, created.id, opportunity.id, `v${(opportunity.quotes?.length ?? 0) + 1}`);
      }
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      setLines([emptyItem()]);
      reload();
    } catch (e) {
      toast.error("Error: " + (e instanceof Error ? e.message : "desconocido"));
    } finally { setSaving(false); }
  };

  const quotes = opportunity.quotes ?? [];
  const clientName = opportunity.client?.name ?? opportunity.clientName ?? "—";

  return (
    <DetailSection title="Cotizaciones vinculadas">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Cliente: <strong>{clientName}</strong>
        </div>
        <Button variant="primary" size="sm" iconLeft="+" onClick={() => setShowForm(true)}>Nueva cotización</Button>
      </div>

      {quotes.length === 0 && !showForm ? (
        <EmptyState
          icon="📝"
          title="Sin cotizaciones"
          description="Crea la primera cotización para esta oportunidad."
          action={<Button variant="primary" onClick={() => setShowForm(true)}>Nueva cotización</Button>}
        />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10, marginBottom: showForm ? 20 : 0 }}>
          {quotes.map((q) => (
            <li key={q.id} style={{ padding: 14, borderRadius: 10, border: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: "var(--surface)" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{q.versionLabel?.trim() || `Cotización #${q.id}`}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                  {formatDateTime(q.createdAt)}
                  {q.cotizacionId && <span style={{ marginLeft: 8 }}><Tag variant="neutral">Doc #{q.cotizacionId}</Tag></span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {q.pdfUrl && (
                  <a href={buildApiUrl(q.pdfUrl.replace(/^\//, ""))} target="_blank" rel="noreferrer"
                    style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)", textDecoration: "none" }}>
                    📄 PDF
                  </a>
                )}
                {q.cotizacionId && (
                  <Link href={`/crm/quotes/${q.cotizacionId}`}
                    style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)", textDecoration: "none" }}>
                    Ver detalle →
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ── Inline create form ──────────────────────────────────────────────── */}
      {showForm && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 20, background: "var(--surface-2)" }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Nueva cotización para: {opportunity.title}</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 10, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Nombre del proyecto</label>
              <input value={form.projectName} onChange={(e) => setForm((f) => ({ ...f, projectName: e.target.value }))} placeholder={opportunity.title} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Vigencia (días)</label>
              <input type="number" min={1} value={form.validDays} onChange={(e) => setForm((f) => ({ ...f, validDays: Number(e.target.value) }))} style={numInp} />
            </div>
          </div>

          {/* Line items */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Partidas</div>
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 55px 100px 55px 55px 28px", gap: 4, padding: "6px 8px", background: "var(--surface-2)", fontSize: 10.5, fontWeight: 700, color: "var(--text-tertiary)" }}>
              <span>Descripción</span><span style={{ textAlign: "center" }}>Cant.</span><span style={{ textAlign: "right" }}>P. Unit.</span>
              <span style={{ textAlign: "center" }}>Dto%</span><span style={{ textAlign: "center" }}>IVA%</span><span />
            </div>
            {lines.map((line, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 55px 100px 55px 55px 28px", gap: 4, padding: "6px 8px", borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                <input value={line.name} onChange={(e) => setLine(i, { name: e.target.value })} placeholder={`Partida ${i + 1}`} style={{ ...inp, padding: "5px 7px", fontSize: 12.5 }} />
                <input type="number" min={1} value={line.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} style={{ ...numInp, padding: "5px 7px", fontSize: 12.5 }} />
                <input type="number" min={0} step={0.01} value={line.unitPrice} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} style={{ ...numInp, padding: "5px 7px", fontSize: 12.5 }} />
                <input type="number" min={0} max={100} value={line.discount} onChange={(e) => setLine(i, { discount: Number(e.target.value) })} style={{ ...numInp, padding: "5px 7px", fontSize: 12.5 }} />
                <input type="number" min={0} max={100} value={line.tax} onChange={(e) => setLine(i, { tax: Number(e.target.value) })} style={{ ...numInp, padding: "5px 7px", fontSize: 12.5 }} />
                <button onClick={() => removeLine(i)} disabled={lines.length === 1}
                  style={{ background: "none", border: "none", cursor: lines.length > 1 ? "pointer" : "default", color: "var(--text-tertiary)", fontSize: 14, opacity: lines.length > 1 ? 1 : 0.3 }}>✕</button>
              </div>
            ))}
          </div>
          <Button size="sm" variant="secondary" onClick={addLine} iconLeft="+">Agregar partida</Button>

          {/* Totals */}
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end", fontSize: 13, color: "var(--text-secondary)" }}>
            <div>Subtotal: {fmtMXN(subtotal)}</div>
            {discTotal > 0 && <div style={{ color: "#dc2626" }}>Descuento: −{fmtMXN(discTotal)}</div>}
            <div>IVA: {fmtMXN(taxTotal)}</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--foreground)" }}>Total: {fmtMXN(total)}</div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <Button variant="secondary" onClick={() => { setShowForm(false); setLines([emptyItem()]); setForm({ ...EMPTY_FORM }); }}>Cancelar</Button>
            <Button variant="primary" onClick={() => void createQuote()} disabled={saving || lines.filter((l) => l.name.trim() && l.unitPrice > 0).length === 0}>
              {saving ? "Creando…" : "Crear y vincular cotización"}
            </Button>
          </div>
        </div>
      )}
    </DetailSection>
  );
}
