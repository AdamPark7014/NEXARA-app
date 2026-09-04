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
import CtOrderPanel from "../components/CtOrderPanel";
import chrome from "@/components/crm/crm-chrome.module.css";
import styles from "../quotes.module.css";

// ── Types ────────────────────────────────────────────────────────────────────

interface CotizacionItem {
  id: number;
  name: string;
  description?: string | null;
  qty: number;
  unitPrice: string;
  unitCost?: string | number | null;
  marginPercent?: number | null;
  discount: number;
  tax: number;
  ieps: number;
  retention: number;
  lineTotal: string;
  brand?: string | null;
  model?: string | null;
  sku?: string | null;
  unit?: string | null;
  laborHours?: number | null;
  laborRate?: number | string | null;
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

  const downloadPdf = async (internal = false) => {
    if (!token) return;
    try {
      const path = internal ? `cotizaciones/${id}/pdf/internal` : `cotizaciones/${id}/pdf`;
      const res = await fetch(buildApiUrl(path), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cotizacion-${quote?.quoteNumber ?? id}${internal ? "-interno" : ""}.pdf`;
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

  if (loading) return <EmptyState icon="⏳" title="Cargando cotización…" description="Consultando detalle." />;
  if (error || !quote) return <DetailError message={error ?? "Cotización no encontrada"} onRetry={load} />;

  const linkedOpportunity = quote.salesQuotes?.[0]?.opportunity;
  const totalNum = Number(quote.total);
  const subtotalNum = Number(quote.subtotal);
  const discountNum = Number(quote.discountTotal);
  const taxNum = Number(quote.taxTotal);

  const economics = (() => {
    if (!quote) return { costTotal: 0, sellNet: 0, marginAmt: 0, marginPct: 0 };
    let costTotal = 0;
    let sellNet = 0;
    for (const item of quote.items) {
      const cost = item.unitCost != null && item.unitCost !== "" ? Number(item.unitCost) : 0;
      if (cost > 0) costTotal += cost * Number(item.qty);
      sellNet +=
        Number(item.qty) * Number(item.unitPrice) +
        Number(item.laborHours || 0) * Number(item.laborRate || 0);
    }
    costTotal = Math.round(costTotal * 100) / 100;
    sellNet = Math.round(sellNet * 100) / 100;
    const marginAmt = Math.round((sellNet - costTotal) * 100) / 100;
    const marginPct = sellNet > 0 ? Math.round((marginAmt / sellNet) * 1000) / 10 : 0;
    return { costTotal, sellNet, marginAmt, marginPct };
  })();

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
            <Button variant="ghost" iconLeft="↩" onClick={() => router.back()}>
              Volver
            </Button>
            {cfg.canEdit && quote.status === "DRAFT" && (
              <Link href={`/crm/quotes/${quote.id}/edit`}>
                <Button variant="secondary" iconLeft="✏️">
                  Editar borrador
                </Button>
              </Link>
            )}
            <Link href="/crm/quotes/builder">
              <Button variant="secondary" iconLeft="⚡">
                Nueva rápida
              </Button>
            </Link>
            <Button variant="secondary" iconLeft="📄" onClick={() => void downloadPdf()}>
              PDF cliente
            </Button>
            <Button variant="ghost" iconLeft="📊" onClick={() => void downloadPdf(true)}>
              PDF interno
            </Button>
            {cfg.canEdit && quote.status === "DRAFT" && (
              <Button variant="primary" iconLeft="✉️" onClick={() => setShowSend(true)}>
                Enviar cotización
              </Button>
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

      {quote.status === "DRAFT" && (
        <div
          style={{
            marginBottom: 14,
            padding: "14px 16px",
            borderRadius: 14,
            border: "1px solid color-mix(in srgb, var(--primary) 30%, var(--border))",
            background: "color-mix(in srgb, var(--primary) 6%, var(--surface))",
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ fontWeight: 750, fontSize: 14 }}>Borrador listo para enviar</div>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.45 }}>
            Revisa partidas y condiciones. Puedes <strong>editar el borrador</strong>, descargar el PDF
            profesional o enviarlo al cliente. Si necesitas otra con el mayorista, usa{" "}
            <strong>Nueva rápida</strong>.
          </p>
          {cfg.canEdit && (
            <div style={{ marginTop: 4 }}>
              <Link href={`/crm/quotes/${quote.id}/edit`}>
                <Button size="sm" variant="primary" iconLeft="✏️">
                  Editar borrador
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Quote lifecycle stepper */}
      {(() => {
        const FLOW = [
          { key: "DRAFT", label: "Borrador", icon: "📝" },
          { key: "SENT", label: "Enviada", icon: "📤" },
          { key: "APPROVED", label: "Aprobada", icon: "✅" },
        ];
        const activeIdx = FLOW.findIndex((s) => s.key === quote.status);
        return (
          <div style={{ marginBottom: 14, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Ciclo de la cotización</div>
            <div style={{ display: "flex", alignItems: "center" }}>
              {FLOW.map((step, idx) => {
                const done = idx < activeIdx;
                const active = idx === activeIdx;
                const isWon = step.key === "APPROVED" && active;
                const color = (isWon || done || active) ? "var(--success)" : "var(--text-tertiary)";
                const bg = (isWon || done || active) ? "color-mix(in srgb, var(--success) 15%, var(--surface-2))" : "var(--surface)";
                return (
                  <div key={step.key} style={{ display: "flex", alignItems: "center", flex: idx < FLOW.length - 1 ? 1 : undefined }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 64 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: bg, border: `2px solid ${active ? color : done ? "color-mix(in srgb, var(--success) 40%, var(--border))" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: done ? 12 : 14, fontWeight: 700, color }}>
                        {done ? "✓" : step.icon}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? color : done ? "var(--text-secondary)" : "var(--text-tertiary)", textAlign: "center", whiteSpace: "nowrap" }}>{step.label}</span>
                    </div>
                    {idx < FLOW.length - 1 && <div style={{ flex: 1, height: 2, background: done ? "color-mix(in srgb, var(--success) 35%, var(--border))" : "var(--border)", margin: "0 4px", marginBottom: 18 }} />}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

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

      <CtOrderPanel
        token={token}
        cotizacionId={id}
        quoteStatus={quote.status}
        canManage={cfg.canEdit}
      />

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
                  {["#", "Descripción", "Marca / Modelo", "Cant.", "P. venta neto", "Costo prov.", "Margen", "MO", "Desc.", "IVA", "Total"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 10px",
                        textAlign: ["#", "Cant.", "Desc.", "IVA", "MO", "Margen"].includes(h) ? "center" : h === "P. venta neto" || h === "Costo prov." || h === "Total" ? "right" : "left",
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
                {quote.items.map((item, idx) => {
                  const cost = item.unitCost != null && item.unitCost !== "" ? Number(item.unitCost) : null;
                  const laborH = Number(item.laborHours || 0);
                  const laborR = Number(item.laborRate || 0);
                  return (
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
                      {item.sku && (
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>SKU {item.sku}</div>
                      )}
                      {item.description && (
                        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>{item.description}</div>
                      )}
                      {item.notes && (
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontStyle: "italic" }}>{item.notes}</div>
                      )}
                      {item.warrantyMonths ? (
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Garantía: {item.warrantyMonths} meses</div>
                      ) : null}
                      {item.marginPercent != null ? (
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                          Margen {item.marginPercent}%
                        </div>
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
                    <td style={{ padding: "10px", textAlign: "right", fontSize: 12, color: "var(--text-secondary)" }}>
                      {cost != null && !Number.isNaN(cost) ? <Money value={cost} /> : "—"}
                    </td>
                    <td style={{ padding: "10px", textAlign: "center", fontSize: 11.5, color: "var(--text-secondary)" }}>
                      {cost != null && cost > 0 ? (
                        <>
                          {item.marginPercent != null ? `${item.marginPercent}%` : "—"}
                          <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                            <Money value={(Number(item.unitPrice) - cost) * Number(item.qty)} />
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ padding: "10px", textAlign: "center", fontSize: 11.5, color: "var(--text-secondary)" }}>
                      {laborH > 0 ? `${laborH}h${laborR > 0 ? ` × $${laborR}` : ""}` : "—"}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Totals */}
      {economics.costTotal > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 14 }}>
          <KpiCard label="Costo proveedor" value={<Money value={economics.costTotal} />} />
          <KpiCard label="Venta neta" value={<Money value={economics.sellNet} />} />
          <KpiCard label="Margen bruto" value={`${economics.marginPct}%`} hint={<Money value={economics.marginAmt} />} />
          <KpiCard label="IVA trasladado" value={<Money value={taxNum} />} />
        </div>
      )}
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
