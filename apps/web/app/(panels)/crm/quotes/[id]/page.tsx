"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import { Tag, Money } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { getCrmSalesSectionConfig } from "@/lib/section-views";
import { DetailField, DetailFieldGrid, DetailSection, formatDate, DetailError } from "@/components/detail/DetailFrame";

// ── Types ────────────────────────────────────────────────────────────────────

interface CotizacionItem {
  id: number;
  name: string;
  description?: string | null;
  qty: number;
  unitPrice: string;
  discount: number;
  tax: number;
  ieps: number;
  retention: number;
  lineTotal: string;
  brand?: string | null;
  model?: string | null;
  unit?: string | null;
  warrantyMonths?: number;
  deliveryTime?: string | null;
  notes?: string | null;
}

interface CotizacionDetail {
  id: number;
  quoteNumber: string;
  status: "DRAFT" | "SENT" | "APPROVED";
  issueDate: string;
  validUntil?: string | null;
  clientName?: string | null;
  clientCompany?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  projectName?: string | null;
  scope?: string | null;
  paymentTerms?: string | null;
  deliveryTime?: string | null;
  currency: string;
  depositPercent: number;
  note?: string | null;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  iepsTotal: string;
  retentionTotal: string;
  total: string;
  sentAt?: string | null;
  sentToEmail?: string | null;
  signedByName?: string | null;
  signedAt?: string | null;
  preparedBy?: string | null;
  createdBy?: { nombre: string } | null;
  items: CotizacionItem[];
  salesQuotes?: Array<{
    id: number;
    opportunity?: { id: number; title: string } | null;
    versionLabel?: string | null;
  }>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...((opts?.headers as Record<string, string>) ?? {}),
    },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.headers.get("content-type")?.includes("application/json")) return res.json();
  return res;
}

const STATUS_LABEL: Record<string, string> = { DRAFT: "Borrador", SENT: "Enviada", APPROVED: "Aprobada" };
const STATUS_VARIANT: Record<string, "warning" | "accent" | "positive"> = {
  DRAFT: "warning",
  SENT: "accent",
  APPROVED: "positive",
};

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid var(--border)",
  borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box",
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function QuoteDetailPage() {
  const { user } = useUser();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = Number(params.id);
  const token = user?.token ?? "";
  const cfg = useMemo(() => getCrmSalesSectionConfig(user, "quotes"), [user]);

  const [quote, setQuote] = useState<CotizacionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  // Send modal state
  const [showSend, setShowSend] = useState(false);
  const [sendEmail, setSendEmail] = useState("");
  const [sendMsg, setSendMsg] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true); setError(null);
    try {
      const data = await apiFetch(`ventas/cotizaciones/${id}`, token);
      setQuote(data);
      setSendEmail((data as CotizacionDetail).clientEmail ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la cotizacion");
    } finally { setLoading(false); }
  }, [token, id]);

  useEffect(() => { void load(); }, [load]);

  const downloadPdf = async () => {
    if (!token) return;
    try {
      const res = await fetch(buildApiUrl(`cotizaciones/${id}/pdf`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cotizacion-${quote?.quoteNumber ?? id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setActionErr(`Error al descargar PDF: ${e instanceof Error ? e.message : "desconocido"}`);
    }
  };

  const sendQuote = async () => {
    if (!token || !sendEmail.trim()) return;
    setSending(true);
    try {
      await apiFetch(`cotizaciones/${id}/send`, token, {
        method: "POST",
        body: JSON.stringify({ email: sendEmail.trim(), message: sendMsg.trim() || undefined }),
      });
      setShowSend(false);
      void load();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Error al enviar cotización");
    } finally { setSending(false); }
  };

  if (loading) return <EmptyState icon="⏳" title="Cargando cotizacion…" description="Consultando detalle." />;
  if (error || !quote) return <DetailError message={error ?? "Cotizacion no encontrada"} onRetry={load} />;

  const linkedOpportunity = quote.salesQuotes?.[0]?.opportunity;
  const totalNum = Number(quote.total);
  const subtotalNum = Number(quote.subtotal);
  const discountNum = Number(quote.discountTotal);
  const taxNum = Number(quote.taxTotal);

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Link href="/crm/quotes" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
              Cotizaciones
            </Link>{" / "}{quote.quoteNumber}
          </>
        }
        title={quote.projectName ?? quote.quoteNumber}
        subtitle={[quote.clientCompany, quote.clientName].filter(Boolean).join(" · ")}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="ghost" iconLeft="↩" onClick={() => router.back()}>Volver</Button>
            <Button variant="secondary" iconLeft="📄" onClick={() => void downloadPdf()}>Descargar PDF</Button>
            {cfg.canEdit && quote.status === "DRAFT" && (
              <Button variant="primary" iconLeft="✉️" onClick={() => setShowSend(true)}>Enviar cotizacion</Button>
            )}
          </div>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 14 }}>
        <KpiCard label="Total" value={<Money value={Number(quote.total)} compact />} variant="accent" icon="💰" />
        <KpiCard label="Subtotal" value={<Money value={Number(quote.subtotal)} compact />} icon="📋" />
        <KpiCard label="Anticipo" value={quote.depositPercent ? `${quote.depositPercent}%` : "—"} icon="💳" hint={quote.depositPercent ? `MXN ${(Number(quote.total) * quote.depositPercent / 100).toFixed(0)}` : undefined} />
        <KpiCard label="Estado" value={STATUS_LABEL[quote.status] ?? quote.status} variant={STATUS_VARIANT[quote.status] ?? "default"} icon="📄" />
      </div>

      {/* Status bar */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18, alignItems: "center" }}>
        <Tag variant={STATUS_VARIANT[quote.status] ?? "default"}>{STATUS_LABEL[quote.status] ?? quote.status}</Tag>
        {quote.sentAt && (
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            Enviada {formatDate(quote.sentAt)} a {quote.sentToEmail}
          </span>
        )}
        {quote.signedAt && <Tag variant="positive">Firmada por {quote.signedByName}</Tag>}
        {linkedOpportunity && (
          <Link href={`/crm/opportunities/${linkedOpportunity.id}`} style={{ fontSize: 12, color: "var(--primary)", textDecoration: "none" }}>
            Oportunidad vinculada: {linkedOpportunity.title} →
          </Link>
        )}
      </div>

      {/* Header info */}
      <DetailSection title="Informacion general">
        <DetailFieldGrid>
          <DetailField label="No. Cotizacion" value={quote.quoteNumber} />
          <DetailField label="Fecha de emision" value={formatDate(quote.issueDate)} />
          <DetailField label="Valida hasta" value={formatDate(quote.validUntil)} />
          <DetailField label="Moneda" value={quote.currency} />
          <DetailField label="Empresa" value={quote.clientCompany} />
          <DetailField label="Contacto" value={quote.clientName} />
          <DetailField label="Email" value={quote.clientEmail} />
          <DetailField label="Telefono" value={quote.clientPhone} />
          <DetailField label="Anticipio" value={quote.depositPercent ? `${quote.depositPercent}%` : undefined} />
          <DetailField label="Condiciones de pago" value={quote.paymentTerms} />
          <DetailField label="Tiempo de entrega" value={quote.deliveryTime} />
          <DetailField label="Elaboro" value={quote.preparedBy ?? quote.createdBy?.nombre} />
        </DetailFieldGrid>
        {quote.scope && (
          <div style={{ marginTop: 12 }}>
            <DetailField label="Alcance del proyecto" value={quote.scope} />
          </div>
        )}
        {quote.note && (
          <div style={{ marginTop: 8 }}>
            <DetailField label="Notas" value={quote.note} />
          </div>
        )}
      </DetailSection>

      {/* Line items */}
      <Section title={`Partidas (${quote.items.length})`}>
        {quote.items.length === 0 ? (
          <EmptyState icon="📋" title="Sin partidas" description="Esta cotizacion no tiene articulos registrados." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  {["#", "Descripcion", "Marca / Modelo", "Cant.", "P. Unitario", "Desc.", "IVA", "Total"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 10px",
                        textAlign: ["#", "Cant.", "Desc.", "IVA"].includes(h) ? "center" : "left",
                        fontWeight: 700,
                        color: "var(--text-secondary)",
                        fontSize: 11.5,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quote.items.map((item, idx) => (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: idx % 2 === 0 ? "transparent" : "color-mix(in srgb, var(--surface-2) 30%, transparent)",
                    }}
                  >
                    <td style={{ padding: "10px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>{idx + 1}</td>
                    <td style={{ padding: "10px" }}>
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      {item.description && (
                        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>{item.description}</div>
                      )}
                      {item.notes && (
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontStyle: "italic" }}>{item.notes}</div>
                      )}
                      {item.warrantyMonths ? (
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Garantia: {item.warrantyMonths} meses</div>
                      ) : null}
                    </td>
                    <td style={{ padding: "10px" }}>
                      {item.brand && <div style={{ fontSize: 12, fontWeight: 600 }}>{item.brand}</div>}
                      {item.model && <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{item.model}</div>}
                      {item.unit && <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{item.unit}</div>}
                    </td>
                    <td style={{ padding: "10px", textAlign: "center", fontWeight: 700 }}>{item.qty}</td>
                    <td style={{ padding: "10px", textAlign: "right" }}>
                      <Money value={Number(item.unitPrice)} />
                    </td>
                    <td style={{ padding: "10px", textAlign: "center", color: item.discount > 0 ? "var(--warning)" : "var(--text-tertiary)", fontSize: 12 }}>
                      {item.discount > 0 ? `-${item.discount}%` : "—"}
                    </td>
                    <td style={{ padding: "10px", textAlign: "center", fontSize: 12, color: "var(--text-secondary)" }}>
                      {item.tax > 0 ? `${item.tax}%` : "—"}
                    </td>
                    <td style={{ padding: "10px", textAlign: "right", fontWeight: 700 }}>
                      <Money value={Number(item.lineTotal)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Totals */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8, marginBottom: 32 }}>
        <div style={{ minWidth: 300, padding: 20, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
            <span style={{ color: "var(--text-secondary)" }}>Subtotal</span>
            <Money value={subtotalNum} />
          </div>
          {discountNum > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: "var(--warning)" }}>Descuentos</span>
              <span style={{ color: "var(--warning)" }}>− <Money value={discountNum} /></span>
            </div>
          )}
          {taxNum > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: "var(--text-secondary)" }}>IVA</span>
              <Money value={taxNum} />
            </div>
          )}
          {Number(quote.iepsTotal) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: "var(--text-secondary)" }}>IEPS</span>
              <Money value={Number(quote.iepsTotal)} />
            </div>
          )}
          {Number(quote.retentionTotal) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: "var(--text-secondary)" }}>Retenciones</span>
              <span style={{ color: "var(--danger)" }}>− <Money value={Number(quote.retentionTotal)} /></span>
            </div>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              paddingTop: 10,
              borderTop: "2px solid var(--border)",
              fontWeight: 700,
              fontSize: 17,
            }}
          >
            <span>Total {quote.currency}</span>
            <Money value={totalNum} />
          </div>
          {quote.depositPercent > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: "var(--text-tertiary)" }}>
              <span>Anticipo ({quote.depositPercent}%)</span>
              <Money value={(totalNum * quote.depositPercent) / 100} />
            </div>
          )}
        </div>
      </div>

      {/* Send modal */}
      {showSend && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "var(--background)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: 28,
              width: "min(460px, 92vw)",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 18 }}>Enviar cotizacion por email</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={{ fontSize: 13 }}>
                Email del destinatario *
                <input
                  value={sendEmail}
                  onChange={(e) => setSendEmail(e.target.value)}
                  type="email"
                  placeholder="cliente@empresa.com"
                  style={{ ...inp, marginTop: 6 }}
                />
              </label>
              <label style={{ fontSize: 13 }}>
                Mensaje (opcional)
                <textarea
                  value={sendMsg}
                  onChange={(e) => setSendMsg(e.target.value)}
                  rows={3}
                  placeholder="Adjunto la cotizacion solicitada…"
                  style={{ ...inp, marginTop: 6, resize: "vertical" }}
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <Button variant="ghost" onClick={() => setShowSend(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void sendQuote()} disabled={sending || !sendEmail.trim()}>
                {sending ? "Enviando…" : "Enviar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
