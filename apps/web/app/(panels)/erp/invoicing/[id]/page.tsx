"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import MetricStrip, { type Metric } from "@/components/ui/MetricStrip";
import StatusDot, { type StatusTone } from "@/components/ui/StatusDot";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import { Money } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { toast } from "@/components/Toast";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import Modal from "@/components/ui/Modal";
import {
  FinanceField,
  FinanceFormGrid,
  financeInputStyle,
} from "@/components/finance/FinanceModuleShell";

interface InvoiceLine {
  id: number;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal?: number;
  taxRate?: number;
}

interface PaymentRecord {
  id: number;
  amount: number;
  paymentDate: string;
  method?: string;
  reference?: string;
  notes?: string;
  cfdiPaymentUuid?: string | null;
}

interface InvoiceDetail {
  id: number;
  invoiceNumber: string;
  type: string;
  status: string;
  issueDate: string;
  dueDate?: string | null;
  totalAmount: number;
  paidAmount?: number;
  cfdiUuid?: string | null;
  satPaymentMethod?: string | null;
  isCancelled?: boolean;
  cfdiRelationType?: string | null;
  pdfUrl?: string | null;
  receptorName?: string | null;
  receptorRfc?: string | null;
  emisorName?: string | null;
  description?: string | null;
  notes?: string | null;
  matchStatus?: string | null;
  matchNotes?: string | null;
  purchaseOrderId?: number | null;
  goodsReceiptId?: number | null;
  items?: InvoiceLine[];
  payments?: PaymentRecord[];
  createdAt?: string;
}

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...((init.headers ?? {}) as Record<string, string>) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  return res.json();
}

/**
 * Tono del estado comercial. Neutro mientras el flujo va como debe; el color
 * se reserva para lo que pide acción (vencida) o para lo que ya se liquidó.
 */
const STATUS_TONE: Record<string, StatusTone> = {
  PAID: "success",
  PARTIALLY_PAID: "neutral",
  OVERDUE: "danger",
  SENT: "neutral",
  DRAFT: "neutral",
  CANCELLED: "danger",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador", SENT: "Enviada", PARTIALLY_PAID: "Pago parcial",
  PAID: "Pagada", OVERDUE: "Vencida", CANCELLED: "Cancelada",
};

const MATCH_LABELS: Record<string, string> = {
  NOT_REQUIRED: "No aplica",
  PENDING: "Pendiente",
  MATCHED: "OK",
  VARIANCE: "Variación",
  WAIVED: "Eximido",
};

const MATCH_TONE: Record<string, StatusTone> = {
  NOT_REQUIRED: "neutral",
  PENDING: "warning",
  MATCHED: "neutral",
  VARIANCE: "danger",
  WAIVED: "neutral",
};

const inp = financeInputStyle;

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const { user } = useUser();
  const token = user?.token ?? "";
  const canEdit = user?.isSuperAdmin || ["ceo", "super_admin", "dir_admin", "contabilidad", "administrativo"].includes(user?.roleKey ?? "");

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pacInfo, setPacInfo] = useState<{ provider?: string; configured?: boolean; productionWarning?: string | null; env?: string; csd?: { configured?: boolean } } | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [payForm, setPayForm] = useState({
    amount: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    method: "SPEI",
    reference: "",
    notes: "",
    stampComplement: true,
  });
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);
  const [stamping, setStamping] = useState(false);
  const [satStatus, setSatStatus] = useState<{ estado?: string; esCancelable?: string } | null>(null);
  const [checkingSat, setCheckingSat] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("02");
  const [substitutionUuid, setSubstitutionUuid] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [matching, setMatching] = useState(false);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`accounting/invoices/${id}`, token);
      setInvoice(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la factura");
    } finally { setLoading(false); }
  }, [token, id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!token) return;
    void apiFetch("accounting/invoices/pac-info", token)
      .then((data) => setPacInfo(data))
      .catch(() => setPacInfo(null));
  }, [token]);

  const downloadXml = async () => {
    if (!token || !id) return;
    try {
      const res = await fetch(buildApiUrl(`accounting/invoices/${id}/xml`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice?.invoiceNumber ?? id}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo descargar XML");
    }
  };

  const submitPayment = async () => {
    if (!token || !id) return;
    const amt = parseFloat(payForm.amount);
    if (!amt || amt <= 0) { setPayErr("Ingresa un monto válido."); return; }
    setPaying(true);
    setPayErr(null);
    try {
      const result = await apiFetch(`accounting/invoices/${id}/payments`, token, {
        method: "POST",
        body: JSON.stringify({
          amount: amt,
          paymentDate: payForm.paymentDate,
          method: payForm.method,
          reference: payForm.reference || undefined,
          notes: payForm.notes || undefined,
          stampComplement: invoice?.satPaymentMethod === "PPD" ? payForm.stampComplement : undefined,
        }),
      });
      setShowPayment(false);
      if (result?.complement?.cfdiPaymentUuid) {
        toast.success(`Pago y complemento timbrados (${result.complement.cfdiPaymentUuid.slice(0, 8)}…)`);
      } else if (result?.complementStampWarning) {
        toast.warning(`Pago registrado; complemento no timbrado: ${result.complementStampWarning}`);
      } else {
        toast.success("Pago registrado");
      }
      void load();
    } catch (e) {
      setPayErr(e instanceof Error ? e.message : "Error al registrar pago");
    } finally { setPaying(false); }
  };

  const stampInvoice = () => {
    if (!token || !id || !invoice) return;
    setConfirmState({
      title: "Timbrar CFDI",
      message: `¿Timbrar la factura ${invoice.invoiceNumber} ante el PAC? Se generará el UUID fiscal.`,
      confirmLabel: "Timbrar",
      danger: false,
      fn: async () => {
        setStamping(true);
        try {
          await apiFetch(`accounting/invoices/${id}/stamp`, token, { method: "POST" });
          toast.success("Factura timbrada ante el PAC");
          void load();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Error al timbrar");
        } finally {
          setStamping(false);
        }
      },
    });
  };

  const checkSatStatus = async () => {
    if (!token || !id) return;
    setCheckingSat(true);
    try {
      const data = await apiFetch(`accounting/invoices/${id}/sat-status`, token);
      setSatStatus(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al consultar SAT");
    } finally { setCheckingSat(false); }
  };

  const cancelInvoice = async () => {
    if (!token || !id) return;
    if (cancelReason === "01" && !substitutionUuid.trim()) {
      toast.error("Motivo 01 requiere UUID del CFDI sustituto");
      return;
    }
    setCancelling(true);
    try {
      await apiFetch(`accounting/invoices/${id}/cancel`, token, {
        method: "PATCH",
        body: JSON.stringify({
          cancelReason,
          substitutionUuid: cancelReason === "01" ? substitutionUuid.trim() : undefined,
        }),
      });
      toast.success("Factura cancelada ante el SAT");
      setShowCancel(false);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cancelar");
    } finally { setCancelling(false); }
  };

  const createCreditNote = async () => {
    if (!token || !id) return;
    try {
      const nc = await apiFetch(`accounting/invoices/${id}/credit-note`, token, { method: "POST", body: JSON.stringify({}) });
      toast.success(`Nota de crédito ${nc.invoiceNumber} creada en borrador`);
      router.push(`/erp/invoicing/${nc.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear nota de crédito");
    }
  };

  const stampComplement = async (paymentId: number) => {
    if (!token) return;
    try {
      const data = await apiFetch(`accounting/invoices/payments/${paymentId}/stamp-complement`, token, { method: "POST" });
      toast.success(`Complemento timbrado: ${data.cfdiPaymentUuid}`);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al timbrar complemento");
    }
  };

  const evaluateMatch = async () => {
    if (!token || !id) return;
    setMatching(true);
    try {
      await apiFetch(`accounting/invoices/${id}/match/evaluate`, token, { method: "POST" });
      toast.success("3-way match recalculado");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al evaluar match");
    } finally {
      setMatching(false);
    }
  };

  const waiveMatch = async () => {
    if (!token || !id) return;
    setMatching(true);
    try {
      await apiFetch(`accounting/invoices/${id}/match/waive`, token, {
        method: "POST",
        body: JSON.stringify({ notes: "Eximido desde UI facturación" }),
      });
      toast.success("Match eximido — ya puedes pagar");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eximir match");
    } finally {
      setMatching(false);
    }
  };

  const pendingAmount = useMemo(() => {
    if (!invoice) return 0;
    return Math.max(0, invoice.totalAmount - (invoice.paidAmount ?? 0));
  }, [invoice]);

  const needsThreeWay =
    invoice?.type === "ACCOUNTS_PAYABLE" &&
    Boolean(invoice.purchaseOrderId || invoice.goodsReceiptId);

  const matchAllowsPay =
    !needsThreeWay ||
    invoice?.matchStatus === "MATCHED" ||
    invoice?.matchStatus === "WAIVED" ||
    invoice?.matchStatus === "NOT_REQUIRED";

  const paidPct = useMemo(() => {
    if (!invoice || !invoice.totalAmount) return 0;
    return Math.min(100, Math.round(((invoice.paidAmount ?? 0) / invoice.totalAmount) * 100));
  }, [invoice]);

  if (loading) return <EmptyState icon="⏳" title="Cargando factura…" description="Consultando datos de facturación." />;
  if (error) return <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />;
  if (!invoice) return null;

  const isIncome = invoice.type === "ACCOUNTS_RECEIVABLE" || invoice.type === "INCOME";
  const counterparty = isIncome ? invoice.receptorName : invoice.emisorName;

  // Estado fiscal: lo primero que se busca en una factura. El comercial
  // (pagada, vencida) va al lado, en segundo plano.
  const fiscal: { label: string; tone: StatusTone; title: string } =
    invoice.isCancelled || invoice.status === "CANCELLED"
      ? { label: "Cancelada", tone: "danger", title: "CFDI cancelado ante el SAT" }
      : !invoice.cfdiUuid
        ? { label: "Sin timbrar", tone: "warning", title: "Borrador: todavía no tiene UUID fiscal" }
        : invoice.satPaymentMethod === "PPD"
          ? { label: "Timbrada · PPD", tone: "neutral", title: "Timbrada. Cada pago exige complemento (Pagos 2.0)" }
          : { label: "Timbrada", tone: "neutral", title: "CFDI con UUID fiscal" };

  return (
    <>
      <PageHeader
        eyebrow={`ERP · ${isIncome ? "Cuentas por cobrar" : "Cuentas por pagar"}`}
        title={invoice.invoiceNumber}
        subtitle={counterparty ?? "—"}
        meta={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <StatusDot label={fiscal.label} tone={fiscal.tone} title={fiscal.title} />
            <StatusDot
              label={STATUS_LABELS[invoice.status] ?? invoice.status}
              tone={STATUS_TONE[invoice.status] ?? "neutral"}
            />
          </span>
        }
        actions={
          <>
            <Link href="/erp/invoicing" style={{ textDecoration: "none" }}>
              <Button size="sm" variant="ghost">← Facturación</Button>
            </Link>
            {invoice.cfdiUuid && (
              <>
                <Button size="sm" variant="ghost" onClick={() => void downloadXml()}>XML</Button>
                {invoice.pdfUrl && (
                  <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                    <Button size="sm" variant="ghost">PDF</Button>
                  </a>
                )}
              </>
            )}
            {canEdit && invoice.status === "DRAFT" && !invoice.cfdiUuid && (
              <Button size="sm" variant="primary" onClick={() => void stampInvoice()} disabled={stamping}>
                {stamping ? "Timbrando…" : "Timbrar CFDI"}
              </Button>
            )}
            {canEdit && invoice.cfdiUuid && !invoice.isCancelled && invoice.cfdiRelationType !== "01" && (
              <Button size="sm" variant="secondary" onClick={() => void createCreditNote()}>Nota de crédito</Button>
            )}
            {canEdit && invoice.cfdiUuid && !invoice.isCancelled && (
              <Button size="sm" variant="ghost" onClick={() => setShowCancel(true)}>Cancelar CFDI</Button>
            )}
            {invoice.cfdiUuid && (
              <Button size="sm" variant="ghost" onClick={() => void checkSatStatus()} disabled={checkingSat}>
                {checkingSat ? "Consultando…" : "Estatus SAT"}
              </Button>
            )}
            {canEdit && invoice.status !== "PAID" && invoice.status !== "CANCELLED" && (
              <Button
                size="sm"
                variant="secondary"
                disabled={!matchAllowsPay}
                title={!matchAllowsPay ? "Resuelve el 3-way match antes de pagar" : undefined}
                onClick={() => {
                  setShowPayment(true);
                  setPayErr(null);
                  setPayForm((f) => ({
                    ...f,
                    amount: String(pendingAmount),
                    stampComplement: invoice.satPaymentMethod === "PPD",
                  }));
                }}
              >
                Registrar pago
              </Button>
            )}
          </>
        }
      />

      {needsThreeWay && (
        <div
          style={{
            marginBottom: 18,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            fontSize: 13,
            color: "var(--text-secondary)",
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ color: "var(--foreground)" }}>3-way match OC–GR–factura:</strong>
              <StatusDot
                label={MATCH_LABELS[invoice.matchStatus ?? "PENDING"] ?? invoice.matchStatus ?? "Pendiente"}
                tone={MATCH_TONE[invoice.matchStatus ?? "PENDING"] ?? "neutral"}
              />
            </span>
            {invoice.matchNotes && (
              <div style={{ marginTop: 6 }}>{invoice.matchNotes}</div>
            )}
          </div>
          {canEdit && (
            <div style={{ display: "flex", gap: 8 }}>
              <Button size="sm" variant="ghost" onClick={() => void evaluateMatch()} disabled={matching}>
                {matching ? "…" : "Reevaluar"}
              </Button>
              {invoice.matchStatus === "VARIANCE" || invoice.matchStatus === "PENDING" ? (
                <Button size="sm" variant="secondary" onClick={() => void waiveMatch()} disabled={matching}>
                  Eximir match
                </Button>
              ) : null}
            </div>
          )}
        </div>
      )}

      {pacInfo && (
        <>
          <div style={{ marginBottom: 12, fontSize: 12, color: "var(--text-tertiary)" }}>
            PAC / timbrado: {pacInfo.provider?.toUpperCase() ?? "—"}
            {pacInfo.configured ? " · credenciales OK" : " · sin credenciales"}
            {invoice.satPaymentMethod === "PPD" && " · PPD (complementos de pago requeridos)"}
          </div>
          {pacInfo.productionWarning && (
            <InlineAlert variant="danger" message={pacInfo.productionWarning} />
          )}
        </>
      )}

      {(() => {
        const metrics: Metric[] = [
          {
            label: "Total",
            value: <Money value={invoice.totalAmount} bold={false} />,
            hint: isIncome ? "por cobrar al cliente" : "por pagar al proveedor",
          },
          {
            label: "Pagado",
            value: <Money value={invoice.paidAmount ?? 0} bold={false} />,
            hint: `${paidPct}% cubierto`,
            tone: paidPct === 100 ? "success" : "default",
          },
          {
            label: "Pendiente",
            value: <Money value={pendingAmount} bold={false} />,
            hint: pendingAmount > 0 ? "saldo abierto" : "sin saldo",
            tone: pendingAmount > 0 && invoice.status === "OVERDUE" ? "danger" : pendingAmount > 0 ? "warning" : "default",
          },
          {
            label: "Pagos registrados",
            value: invoice.payments?.length ?? 0,
            hint: invoice.satPaymentMethod === "PPD" ? "cada uno exige complemento" : "pago en una exhibición",
          },
        ];
        return (
          <div style={{ marginBottom: 18 }}>
            <MetricStrip metrics={metrics} ariaLabel="Resumen de la factura" />
          </div>
        );
      })()}
      <Section title="Datos de la factura">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[
            { label: "Folio", value: invoice.invoiceNumber },
            { label: isIncome ? "Cliente / Receptor" : "Proveedor", value: counterparty },
            { label: "RFC receptor", value: invoice.receptorRfc },
            { label: "Método pago SAT", value: invoice.satPaymentMethod ?? "PUE" },
            { label: "Tipo", value: isIncome ? "Ingreso (CxC)" : "Egreso (CxP)" },
            { label: "Fecha de emisión", value: new Date(invoice.issueDate).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" }) },
            { label: "Fecha de vencimiento", value: invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" }) : null },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 13, color: value ? "var(--text-primary)" : "var(--text-tertiary)" }}>{value ?? "—"}</div>
            </div>
          ))}
          {invoice.cfdiUuid && (
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>UUID CFDI</div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <code style={{ fontSize: 11.5, color: "var(--text-secondary)", letterSpacing: "0.02em" }}>{invoice.cfdiUuid}</code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(invoice.cfdiUuid ?? "");
                    toast.success("UUID copiado");
                  }}
                  title="Copiar UUID"
                  aria-label="Copiar UUID"
                  style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, fontSize: 12, color: "var(--text-tertiary)" }}
                >
                  ⧉
                </button>
              </span>
              {satStatus && (
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-secondary)" }}>
                  Estatus SAT: <strong>{satStatus.estado}</strong>
                  {satStatus.esCancelable ? ` · Cancelable: ${satStatus.esCancelable}` : ""}
                </div>
              )}
            </div>
          )}
          {invoice.description && (
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Concepto</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{invoice.description}</div>
            </div>
          )}
        </div>
      </Section>

      {(invoice.items?.length ?? 0) > 0 && (
        <Section title="Partidas">
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 110px 110px", gap: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <span>Descripción</span><span style={{ textAlign: "right" }}>Cant.</span><span style={{ textAlign: "right" }}>P. unit.</span><span style={{ textAlign: "right" }}>Subtotal</span>
            </div>
            {invoice.items!.map((line) => (
              <div key={line.id} style={{ display: "grid", gridTemplateColumns: "1fr 80px 110px 110px", gap: 8, padding: "10px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, alignItems: "center" }}>
                <span style={{ fontSize: 13 }}>{line.description}</span>
                <span style={{ textAlign: "right", fontSize: 13 }}>{line.quantity}</span>
                <span style={{ textAlign: "right", fontSize: 13 }}><Money value={line.unitPrice} /></span>
                <span style={{ textAlign: "right", fontSize: 13, fontWeight: 600 }}><Money value={line.subtotal ?? (line.quantity * line.unitPrice)} /></span>
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 110px 110px", gap: 8, padding: "10px", fontWeight: 700, fontSize: 13 }}>
              <span style={{ gridColumn: "1 / 4", textAlign: "right", color: "var(--text-secondary)" }}>Total:</span>
              <span style={{ textAlign: "right" }}><Money value={invoice.totalAmount} /></span>
            </div>
          </div>
        </Section>
      )}

      {(invoice.payments?.length ?? 0) > 0 && (
        <Section eyebrow="Historial" title="Pagos registrados">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {invoice.payments!.map((p) => (
              <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 10, alignItems: "center", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.method ?? "Transferencia"}{p.reference ? ` · Ref: ${p.reference}` : ""}</div>
                  {p.notes && <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{p.notes}</div>}
                  {p.cfdiPaymentUuid && <code style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>Comp: {p.cfdiPaymentUuid.slice(0, 8)}…</code>}
                </div>
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{new Date(p.paymentDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}</span>
                <span style={{ fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums" }}><Money value={p.amount} /></span>
                {canEdit && invoice.satPaymentMethod === "PPD" && invoice.cfdiUuid && !p.cfdiPaymentUuid && (
                  <Button size="sm" variant="ghost" onClick={() => void stampComplement(p.id)}>Timbrar comp.</Button>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      <Modal
        open={showCancel}
        onClose={() => setShowCancel(false)}
        title="Cancelar CFDI ante el SAT"
        footer={
          <>
            <Button size="sm" variant="secondary" onClick={() => setShowCancel(false)}>Cerrar</Button>
            <Button size="sm" variant="primary" onClick={() => void cancelInvoice()} disabled={cancelling}>
              {cancelling ? "Cancelando…" : "Confirmar cancelación"}
            </Button>
          </>
        }
      >
        <FinanceFormGrid>
          <FinanceField
            label="Motivo SAT"
            fullWidth
            hint="El motivo queda asentado en el acuse; el 01 obliga a indicar la factura que sustituye."
          >
            <select value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} style={inp}>
              <option value="01">01 — Comprobante emitido con errores (con relación)</option>
              <option value="02">02 — Comprobante emitido con errores (sin relación)</option>
              <option value="03">03 — No se llevó a cabo la operación</option>
              <option value="04">04 — Operación nominativa en factura global</option>
            </select>
          </FinanceField>
          {cancelReason === "01" && (
            <FinanceField
              label="UUID sustituto"
              fullWidth
              hint="UUID completo del CFDI que reemplaza a éste."
            >
              <input value={substitutionUuid} onChange={(e) => setSubstitutionUuid(e.target.value)} placeholder="UUID del CFDI que sustituye" style={inp} />
            </FinanceField>
          )}
        </FinanceFormGrid>
      </Modal>

      <Modal
        open={showPayment}
        onClose={() => setShowPayment(false)}
        title="Registrar pago"
        footer={
          <>
            <Button size="sm" variant="secondary" onClick={() => setShowPayment(false)}>Cancelar</Button>
            <Button size="sm" variant="primary" onClick={() => void submitPayment()} disabled={paying}>
              {paying ? "Registrando…" : "Registrar pago"}
            </Button>
          </>
        }
      >
        <FinanceFormGrid>
          <FinanceField label="Monto" hint="Pesos. Puede ser menor al saldo: queda como pago parcial.">
            <input type="number" min="0.01" step="0.01" value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))} style={inp} autoFocus />
          </FinanceField>
          <FinanceField label="Fecha de pago" hint="La del estado de cuenta, no la de captura.">
            <input type="date" value={payForm.paymentDate} onChange={(e) => setPayForm((f) => ({ ...f, paymentDate: e.target.value }))} style={inp} />
          </FinanceField>
          <FinanceField label="Método">
            <select value={payForm.method} onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))} style={inp}>
              <option value="SPEI">SPEI / Transferencia</option>
              <option value="CASH">Efectivo</option>
              <option value="CHECK">Cheque</option>
              <option value="CARD">Tarjeta</option>
            </select>
          </FinanceField>
          <FinanceField label="Referencia" optional hint="Clave de rastreo del SPEI o folio del cheque.">
            <input value={payForm.reference} onChange={(e) => setPayForm((f) => ({ ...f, reference: e.target.value }))} placeholder="Número de transferencia" style={inp} />
          </FinanceField>
          {invoice?.satPaymentMethod === "PPD" && (
            <FinanceField
              label="Complemento de pago"
              fullWidth
              hint="La factura es PPD: el SAT exige un complemento por cada pago."
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)" }}>
                <input
                  type="checkbox"
                  checked={payForm.stampComplement}
                  onChange={(e) => setPayForm((f) => ({ ...f, stampComplement: e.target.checked }))}
                />
                Timbrar complemento al registrar
              </span>
            </FinanceField>
          )}
        </FinanceFormGrid>
        {payErr && <div style={{ marginTop: 14 }}><InlineAlert variant="danger" message={payErr} /></div>}
      </Modal>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
