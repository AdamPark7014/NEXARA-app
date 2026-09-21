"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import MetricStrip, { type Metric } from "@/components/ui/MetricStrip";
import StatusDot, { type StatusTone } from "@/components/ui/StatusDot";
import InlineAlert from "@/components/ui/InlineAlert";
import { Money } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { getCrmSalesSectionConfig } from "@/lib/section-views";
import { exportToExcel } from "@/lib/export-excel";
import { DetailField, DetailFieldGrid, formatDate } from "@/components/detail/DetailFrame";
import CtOrderPanel from "../components/CtOrderPanel";

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

/** Color solo cuando el renglón pide algo o ya se cerró (contrato, regla 3). */
const STATUS_TONE: Record<string, StatusTone> = {
  DRAFT: "neutral",
  SENT: "warning",
  APPROVED: "success",
};

const pesos = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n);

const META: React.CSSProperties = { fontSize: 11.5, color: "var(--text-tertiary)", lineHeight: 1.45 };

/**
 * Once columnas no caben en un teléfono y la tabla acababa arrastrándose en
 * horizontal para leer un importe. Por debajo de 720px cada partida se lee
 * como un renglón apilado, separado por una línea, sin tarjeta.
 */
function useIsNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 720px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return narrow;
}

/** El contexto de una partida vive bajo su nombre, no en columnas extra. */
function itemMeta(item: CotizacionItem): string[] {
  const laborH = Number(item.laborHours || 0);
  const laborR = Number(item.laborRate || 0);
  return [
    item.sku ? `SKU ${item.sku}` : null,
    [item.brand, item.model].filter(Boolean).join(" ") || null,
    item.unit || null,
    laborH > 0 ? `mano de obra ${laborH}h${laborR > 0 ? ` × ${pesos(laborR)}` : ""}` : null,
    item.discount > 0 ? `descuento ${item.discount}%` : null,
    item.tax > 0 ? `IVA ${item.tax}%` : null,
    item.warrantyMonths ? `garantía ${item.warrantyMonths} meses` : null,
  ].filter((x): x is string => Boolean(x));
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function QuoteDetailPage() {
  const { user } = useUser();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = Number(params.id);
  const token = user?.token ?? "";
  const cfg = useMemo(() => getCrmSalesSectionConfig(user, "quotes"), [user]);
  const narrow = useIsNarrow();

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
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`ventas/cotizaciones/${id}`, token);
      setQuote(data);
      setSendEmail((data as CotizacionDetail).clientEmail ?? "");
    } catch (e) {
      // Un fallo al refrescar no borra la cotización que ya está en pantalla.
      setError(formatApiError(e, "No se pudo cargar la cotización"));
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadPdf = async (internal = false) => {
    if (!token) return;
    setActionErr(null);
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
      setActionErr(`No se pudo descargar el PDF. ${formatApiError(e)}`);
    }
  };

  const sendQuote = async () => {
    if (!token || !sendEmail.trim()) return;
    setSending(true);
    setActionErr(null);
    try {
      await apiFetch(`cotizaciones/${id}/send`, token, {
        method: "POST",
        body: JSON.stringify({ email: sendEmail.trim(), message: sendMsg.trim() || undefined }),
      });
      setShowSend(false);
      void load();
    } catch (e) {
      setActionErr(formatApiError(e, "No se pudo enviar la cotización"));
    } finally {
      setSending(false);
    }
  };

  const exportItemsExcel = () => {
    if (!quote) return;
    exportToExcel(
      quote.items.map((it, idx) => ({
        num: idx + 1,
        name: it.name,
        sku: it.sku ?? "",
        qty: it.qty,
        unit: it.unit ?? "PZA",
        unitPrice: Number(it.unitPrice),
        tax: it.tax,
        lineTotal: Number(it.lineTotal),
      })),
      [
        { key: "num", label: "#" },
        { key: "name", label: "Descripción" },
        { key: "sku", label: "SKU" },
        { key: "qty", label: "Cant." },
        { key: "unit", label: "UdM" },
        { key: "unitPrice", label: "P. unitario" },
        { key: "tax", label: "IVA %" },
        { key: "lineTotal", label: "Importe" },
      ],
      `cotizacion-${quote.quoteNumber}-partidas`,
      {
        title: `PARTIDAS · ${quote.quoteNumber}`,
        subtitle: [quote.clientCompany, quote.projectName].filter(Boolean).join(" · ") || undefined,
        summaryRows: [
          { label: "Subtotal", value: Number(quote.subtotal) },
          { label: "IVA", value: Number(quote.taxTotal) },
          { label: "Total", value: Number(quote.total) },
        ],
      },
    );
  };

  if (loading) {
    return (
      <p style={{ fontSize: 13, color: "var(--text-tertiary)" }} aria-busy="true">
        Cargando cotización…
      </p>
    );
  }

  if (error && !quote) {
    return (
      <InlineAlert
        message={error}
        action={
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            Reintentar
          </Button>
        }
      />
    );
  }

  if (!quote) {
    return (
      <EmptyState
        variant="page"
        title="Cotización no encontrada"
        description="El folio no existe o ya no pertenece a esta empresa."
        action={
          <Link href="/crm/quotes">
            <Button size="sm" variant="secondary">
              Ver todas las cotizaciones
            </Button>
          </Link>
        }
      />
    );
  }

  const linkedOpportunity = quote.salesQuotes?.[0]?.opportunity;
  const totalNum = Number(quote.total);
  const subtotalNum = Number(quote.subtotal);
  const discountNum = Number(quote.discountTotal);
  const taxNum = Number(quote.taxTotal);
  const iepsNum = Number(quote.iepsTotal);
  const retentionNum = Number(quote.retentionTotal);
  const isDraft = quote.status === "DRAFT";

  const economics = (() => {
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

  const anticipo = (totalNum * quote.depositPercent) / 100;

  // Sin una sola partida, la tira serían ceros encima de un «sin partidas»: le
  // quita el sitio a lo que ayuda, que es decir de dónde salen (regla 7).
  const metrics: Metric[] = [
    {
      label: "total",
      value: pesos(totalNum),
      hint: `${quote.items.length} partida${quote.items.length === 1 ? "" : "s"} · ${quote.currency}`,
    },
    {
      label: "anticipo",
      value: quote.depositPercent > 0 ? `${quote.depositPercent}%` : "—",
      hint: quote.depositPercent > 0 ? pesos(anticipo) : "se cobra todo al final",
    },
    ...(economics.costTotal > 0
      ? ([
          {
            label: "margen bruto",
            value: `${economics.marginPct}%`,
            hint: `${pesos(economics.marginAmt)} sobre ${pesos(economics.costTotal)} de costo`,
            tone:
              economics.marginPct <= 0 ? "danger" : economics.marginPct < 10 ? "warning" : "success",
          },
          {
            label: "venta neta",
            value: pesos(economics.sellNet),
            hint: "antes de IVA",
          },
        ] as Metric[])
      : []),
  ];

  const totalRow = (
    label: React.ReactNode,
    value: React.ReactNode,
    opts?: { strong?: boolean; color?: string; hairline?: boolean },
  ) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 24,
        paddingTop: opts?.hairline ? 10 : 0,
        marginTop: opts?.hairline ? 4 : 0,
        borderTop: opts?.hairline ? "1px solid var(--border)" : undefined,
        marginBottom: 8,
        fontSize: opts?.strong ? 15 : 13,
        fontWeight: opts?.strong ? 650 : 400,
        color: opts?.color ?? "var(--text-secondary)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span>{label}</span>
      <span style={{ color: opts?.color ?? (opts?.strong ? "var(--text-primary)" : undefined) }}>
        {value}
      </span>
    </div>
  );

  return (
    <>
      <PageHeader
        density="ops"
        eyebrow={
          <>
            <Link href="/crm/quotes" style={{ color: "inherit", textDecoration: "none" }}>
              Cotizaciones
            </Link>
            {" / "}
            {quote.quoteNumber}
          </>
        }
        title={quote.projectName ?? quote.quoteNumber}
        subtitle={[quote.clientCompany, quote.clientName].filter(Boolean).join(" · ")}
        meta={
          <>
            <StatusDot label={STATUS_LABEL[quote.status] ?? quote.status} tone={STATUS_TONE[quote.status] ?? "neutral"} />
            {quote.sentAt && (
              <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                Enviada {formatDate(quote.sentAt)} a {quote.sentToEmail}
              </span>
            )}
            {quote.signedAt && (
              <StatusDot label={`Firmada por ${quote.signedByName}`} tone="success" />
            )}
            {linkedOpportunity && (
              <Link
                href={`/crm/opportunities/${linkedOpportunity.id}`}
                style={{ fontSize: 12, color: "var(--primary)", textDecoration: "none" }}
              >
                Oportunidad: {linkedOpportunity.title} →
              </Link>
            )}
          </>
        }
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => router.back()}>
              Volver
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void downloadPdf(true)}>
              PDF interno
            </Button>
            {/* Un borrador se viene a enviar; una ya emitida, a bajar su PDF.
                Siempre hay exactamente un primario (contrato, regla 4). */}
            <Button
              size="sm"
              variant={isDraft && cfg.canEdit ? "secondary" : "primary"}
              onClick={() => void downloadPdf()}
            >
              PDF del cliente
            </Button>
            {cfg.canEdit && isDraft && (
              <Link href={`/crm/quotes/${quote.id}/edit`}>
                <Button size="sm" variant="secondary">
                  Editar
                </Button>
              </Link>
            )}
            {cfg.canEdit && isDraft && (
              <Button size="sm" variant="primary" onClick={() => setShowSend(true)}>
                Enviar al cliente
              </Button>
            )}
          </>
        }
      />

      {error && quote && (
        <InlineAlert
          message={`No se pudo refrescar la cotización, sigues viendo la última carga. ${error}`}
          onDismiss={() => setError(null)}
          action={
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              Reintentar
            </Button>
          }
        />
      )}

      {actionErr && <InlineAlert message={actionErr} onDismiss={() => setActionErr(null)} />}

      {quote.items.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <MetricStrip metrics={metrics} ariaLabel="Cifras de la cotización" />
        </div>
      )}

      <CtOrderPanel token={token} cotizacionId={id} quoteStatus={quote.status} canManage={cfg.canEdit} />

      <Section title="Información general">
        <DetailFieldGrid>
          <DetailField label="No. Cotización" value={quote.quoteNumber} />
          <DetailField label="Fecha de emisión" value={formatDate(quote.issueDate)} />
          <DetailField label="Válida hasta" value={formatDate(quote.validUntil)} />
          <DetailField label="Moneda" value={quote.currency} />
          <DetailField label="Empresa" value={quote.clientCompany} />
          <DetailField label="Contacto" value={quote.clientName} />
          <DetailField label="Email" value={quote.clientEmail} />
          <DetailField label="Teléfono" value={quote.clientPhone} />
          <DetailField label="Condiciones de pago" value={quote.paymentTerms} />
          <DetailField label="Tiempo de entrega" value={quote.deliveryTime} />
          <DetailField label="Elaboró" value={quote.preparedBy ?? quote.createdBy?.nombre} />
        </DetailFieldGrid>
        {quote.scope && (
          <div style={{ marginTop: 14 }}>
            <DetailField label="Alcance del proyecto" value={quote.scope} />
          </div>
        )}
        {quote.note && (
          <div style={{ marginTop: 14 }}>
            <DetailField label="Notas" value={quote.note} />
          </div>
        )}
      </Section>

      <Section
        title={`Partidas (${quote.items.length})`}
        actions={
          quote.items.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={exportItemsExcel}>
              Descargar Excel
            </Button>
          ) : undefined
        }
      >
        {quote.items.length === 0 ? (
          <EmptyState
            variant="compact"
            title="Sin partidas"
            description={
              cfg.canEdit && isDraft
                ? "Las partidas se agregan desde el editor del borrador, buscando el equipo en el catálogo CT o capturándolo a mano."
                : "Esta cotización se emitió sin artículos registrados."
            }
            action={
              cfg.canEdit && isDraft ? (
                <Link href={`/crm/quotes/${quote.id}/edit`}>
                  <Button size="sm" variant="secondary">
                    Editar borrador
                  </Button>
                </Link>
              ) : undefined
            }
          />
        ) : narrow ? (
          <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {quote.items.map((item, idx) => {
              const cost = item.unitCost != null && item.unitCost !== "" ? Number(item.unitCost) : null;
              const meta = itemMeta(item);
              return (
                <li
                  key={item.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    padding: "12px 0",
                    borderTop: idx === 0 ? undefined : "1px solid var(--border)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, minWidth: 0 }}>
                      {idx + 1}. {item.name}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 650, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      <Money value={Number(item.lineTotal)} />
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                    {item.qty} × <Money value={Number(item.unitPrice)} />
                    {cost != null && cost > 0 && item.marginPercent != null
                      ? ` · margen ${item.marginPercent}%`
                      : ""}
                  </span>
                  {meta.length > 0 && <span style={META}>{meta.join(" · ")}</span>}
                  {item.description && <span style={META}>{item.description}</span>}
                  {item.notes && <span style={{ ...META, fontStyle: "italic" }}>{item.notes}</span>}
                </li>
              );
            })}
          </ol>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {[
                  { h: "#", align: "center" as const, w: 34 },
                  { h: "Descripción", align: "left" as const },
                  { h: "Cant.", align: "center" as const, w: 60 },
                  { h: "P. unitario", align: "right" as const, w: 110 },
                  { h: "Margen", align: "right" as const, w: 120 },
                  { h: "Importe", align: "right" as const, w: 120 },
                ].map((c) => (
                  <th
                    key={c.h}
                    scope="col"
                    style={{
                      padding: "8px 10px",
                      textAlign: c.align,
                      width: c.w,
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      fontSize: 11.5,
                      whiteSpace: "nowrap",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    {c.h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quote.items.map((item, idx) => {
                const cost = item.unitCost != null && item.unitCost !== "" ? Number(item.unitCost) : null;
                const meta = itemMeta(item);
                return (
                  <tr key={item.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "9px 10px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12, verticalAlign: "top" }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: "9px 10px", verticalAlign: "top" }}>
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      {meta.length > 0 && <div style={META}>{meta.join(" · ")}</div>}
                      {item.description && <div style={META}>{item.description}</div>}
                      {item.notes && <div style={{ ...META, fontStyle: "italic" }}>{item.notes}</div>}
                    </td>
                    <td style={{ padding: "9px 10px", textAlign: "center", fontVariantNumeric: "tabular-nums", verticalAlign: "top" }}>
                      {item.qty}
                    </td>
                    <td style={{ padding: "9px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", verticalAlign: "top" }}>
                      <Money value={Number(item.unitPrice)} />
                    </td>
                    <td style={{ padding: "9px 10px", textAlign: "right", verticalAlign: "top", color: "var(--text-secondary)" }}>
                      {cost != null && cost > 0 ? (
                        <>
                          <div style={{ fontVariantNumeric: "tabular-nums" }}>
                            {item.marginPercent != null ? `${item.marginPercent}%` : "—"}
                          </div>
                          <div style={META}>
                            costo <Money value={cost} />
                          </div>
                        </>
                      ) : (
                        <span style={{ color: "var(--text-tertiary)" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 650, fontVariantNumeric: "tabular-nums", verticalAlign: "top" }}>
                      <Money value={Number(item.lineTotal)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      {quote.items.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 32 }}>
          <div style={{ minWidth: 260, maxWidth: "100%" }}>
            {totalRow("Subtotal", <Money value={subtotalNum} />)}
            {discountNum > 0 &&
              totalRow("Descuentos", <>− <Money value={discountNum} /></>, {
                color: "var(--state-warning-text)",
              })}
            {taxNum > 0 && totalRow("IVA", <Money value={taxNum} />)}
            {iepsNum > 0 && totalRow("IEPS", <Money value={iepsNum} />)}
            {retentionNum > 0 &&
              totalRow("Retenciones", <>− <Money value={retentionNum} /></>, {
                color: "var(--state-danger-text)",
              })}
            {totalRow(`Total ${quote.currency}`, <Money value={totalNum} />, {
              strong: true,
              hairline: true,
            })}
            {quote.depositPercent > 0 &&
              totalRow(`Anticipo (${quote.depositPercent}%)`, <Money value={anticipo} />, {
                color: "var(--text-tertiary)",
              })}
          </div>
        </div>
      )}

      <Modal
        open={showSend}
        onClose={() => setShowSend(false)}
        title="Enviar al cliente"
        maxWidth={460}
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setShowSend(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => void sendQuote()}
              loading={sending}
              disabled={sending || !sendEmail.trim()}
            >
              Enviar
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 550, marginBottom: 6 }}>
              Correo del destinatario
            </span>
            <input
              value={sendEmail}
              onChange={(e) => setSendEmail(e.target.value)}
              type="email"
              placeholder="cliente@empresa.com"
              style={{
                width: "100%",
                height: 32,
                padding: "0 10px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--surface)",
                color: "var(--text-primary)",
                fontSize: 13,
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
            <span style={{ display: "block", fontSize: 12, color: "var(--text-tertiary)", marginTop: 5 }}>
              Recibe el PDF del cliente, sin costos de proveedor ni márgenes.
            </span>
          </label>
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 550, marginBottom: 6 }}>
              Mensaje <span style={{ fontWeight: 400, color: "var(--text-tertiary)" }}>(opcional)</span>
            </span>
            <textarea
              value={sendMsg}
              onChange={(e) => setSendMsg(e.target.value)}
              rows={3}
              placeholder="Adjunto la cotización solicitada…"
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--surface)",
                color: "var(--text-primary)",
                fontSize: 13,
                fontFamily: "inherit",
                boxSizing: "border-box",
                resize: "vertical",
              }}
            />
          </label>
        </div>
      </Modal>
    </>
  );
}
