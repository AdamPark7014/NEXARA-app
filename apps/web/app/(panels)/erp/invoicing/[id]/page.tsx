"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
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
import { formatApiError } from "@/lib/erp-api";
import {
  FinanceField,
  FinanceFormGrid,
  financeInputStyle,
} from "@/components/finance/FinanceModuleShell";
import {
  AlertIcon,
  BlockHeading,
  COMMERCIAL_LABEL,
  CopyableRef,
  Dot,
  fiscalState,
  FootNote,
  LoadingIcon,
  MetricFrame,
  MetricHint,
  MetricValue,
  NoticeStack,
  type Notice,
} from "../_parts";

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

const MATCH_LABELS: Record<string, string> = {
  NOT_REQUIRED: "No aplica",
  PENDING: "Pendiente",
  MATCHED: "OK",
  VARIANCE: "Variación",
  WAIVED: "Eximido",
};

const inp = financeInputStyle;

/** Etiqueta de un dato de ficha: pequeña, callada, sin competir con el valor. */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        color: "var(--text-tertiary)",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        marginBottom: 3,
      }}
    >
      {children}
    </div>
  );
}

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
  /** Timbrar/complemento: el ConfirmDialog cierra y el toast solo no basta. */
  const [actionError, setActionError] = useState<string | null>(null);
  const [satStatus, setSatStatus] = useState<{ estado?: string; esCancelable?: string } | null>(null);
  const [checkingSat, setCheckingSat] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("02");
  const [substitutionUuid, setSubstitutionUuid] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [matching, setMatching] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setError("Esperando sesión. Vuelve a entrar si esto no se resuelve.");
      return;
    }
    if (!id) return;
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
      const msg = formatApiError(e, "Error al registrar pago");
      setPayErr(msg);
      toast.error(msg);
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
        setActionError(null);
        try {
          await apiFetch(`accounting/invoices/${id}/stamp`, token, { method: "POST" });
          toast.success("Factura timbrada ante el PAC");
          void load();
        } catch (e) {
          const msg = formatApiError(e, "Error al timbrar");
          setActionError(msg);
          toast.error(msg);
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
    setActionError(null);
    try {
      const data = await apiFetch(`accounting/invoices/payments/${paymentId}/stamp-complement`, token, { method: "POST" });
      toast.success(`Complemento timbrado: ${data.cfdiPaymentUuid}`);
      void load();
    } catch (e) {
      const msg = formatApiError(e, "Error al timbrar complemento");
      setActionError(msg);
      toast.error(msg);
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

  if (loading) return <EmptyState icon={<LoadingIcon />} title="Cargando factura…" description="Consultando el CFDI." />;
  if (error) return <EmptyState icon={<AlertIcon />} title="No se pudo cargar la factura" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />;
  if (!invoice) return null;

  const isIncome = invoice.type === "ACCOUNTS_RECEIVABLE" || invoice.type === "INCOME";
  const counterparty = isIncome ? invoice.receptorName : invoice.emisorName;

  // Estado fiscal: lo primero que se busca en una factura. El comercial
  // (pagada, vencida) va al lado, en segundo plano.
  const fiscal = fiscalState(invoice);

  const openPayment = () => {
    setShowPayment(true);
    setPayErr(null);
    setPayForm((f) => ({
      ...f,
      amount: String(pendingAmount),
      stampComplement: invoice.satPaymentMethod === "PPD",
    }));
  };

  const canPay = canEdit && invoice.status !== "PAID" && invoice.status !== "CANCELLED";
  const canStamp = canEdit && invoice.status === "DRAFT" && !invoice.cfdiUuid;

  /* ---------------------------------------------------------------- *
   * Avisos: el 3-way match dejó de ser una tarjeta propia y entra en la
   * misma pila que el PAC. Lo que bloquea el pago se lee como lo que es.
   * ---------------------------------------------------------------- */
  const notices: Notice[] = [];
  if (actionError) {
    notices.push({ id: "action", level: "critical", text: actionError, onDismiss: () => setActionError(null) });
  }
  if (pacInfo?.productionWarning) {
    notices.push({
      id: "pac-prod",
      level: "critical",
      text: pacInfo.productionWarning,
      action: { label: "Configuración", href: "/erp/settings" },
    });
  }
  if (needsThreeWay) {
    const match = invoice.matchStatus ?? "PENDING";
    const blocked = !matchAllowsPay;
    notices.push({
      id: "match",
      level: blocked ? "warning" : "info",
      text: `3-way match OC–GR–factura: ${MATCH_LABELS[match] ?? match}.${
        invoice.matchNotes ? ` ${invoice.matchNotes}` : blocked ? " Resuélvelo para poder pagar." : ""
      }`,
      secondaryAction: canEdit ? { label: "Reevaluar", onClick: () => void evaluateMatch(), busy: matching } : undefined,
      action:
        canEdit && (match === "VARIANCE" || match === "PENDING")
          ? { label: "Eximir match", onClick: () => void waiveMatch(), busy: matching }
          : undefined,
    });
  }

  const metrics: Metric[] = [
    {
      label: "Total",
      value: <MetricValue><Money value={invoice.totalAmount} bold={false} /></MetricValue>,
      hint: <MetricHint>{isIncome ? "por cobrar al cliente" : "por pagar al proveedor"}</MetricHint>,
    },
    {
      label: "Pagado",
      value: <MetricValue><Money value={invoice.paidAmount ?? 0} bold={false} /></MetricValue>,
      hint: <MetricHint tone={paidPct === 100 ? "success" : "default"}>{paidPct}% cubierto</MetricHint>,
      tone: paidPct === 100 ? "success" : "default",
    },
    {
      label: "Pendiente",
      value: <MetricValue><Money value={pendingAmount} bold={false} /></MetricValue>,
      hint: (
        <MetricHint tone={pendingAmount > 0 && invoice.status === "OVERDUE" ? "danger" : "default"}>
          {pendingAmount > 0
            ? invoice.status === "OVERDUE"
              ? "fuera de plazo"
              : invoice.dueDate
                ? `vence ${new Date(invoice.dueDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}`
                : "saldo abierto"
            : "sin saldo"}
        </MetricHint>
      ),
      tone: pendingAmount > 0 && invoice.status === "OVERDUE" ? "danger" : pendingAmount > 0 ? "warning" : "default",
    },
  ];

  const payments = invoice.payments ?? [];
  const lines = invoice.items ?? [];

  return (
    <>
      {/* 1 · Dónde estoy: folio, contraparte y los dos estados que importan. */}
      <div style={{ marginBottom: 6 }}>
        <Link
          href="/erp/invoicing"
          style={{ fontSize: 12, color: "var(--text-tertiary)", textDecoration: "none" }}
        >
          ← Facturación CFDI
        </Link>
      </div>
      <PageHeader
        eyebrow={`ERP · ${isIncome ? "Cuentas por cobrar" : "Cuentas por pagar"}`}
        title={invoice.invoiceNumber}
        subtitle={counterparty ?? "—"}
        density="ops"
        meta={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <StatusDot label={fiscal.label} tone={fiscal.tone} title={fiscal.title} />
            <StatusDot
              label={COMMERCIAL_LABEL[invoice.status] ?? invoice.status}
              tone={STATUS_TONE[invoice.status] ?? "neutral"}
            />
          </span>
        }
        /* 2 · Un solo primario: el siguiente paso fiscal de ESTA factura.
           Lo demás (XML, PDF, estatus, nota de crédito, cancelación) actúa
           sobre el documento timbrado y baja al bloque del CFDI. */
        actions={
          canStamp || canPay ? (
            <>
              {canPay && (
                <Button
                  size="sm"
                  variant={canStamp ? "ghost" : "primary"}
                  disabled={!matchAllowsPay}
                  title={!matchAllowsPay ? "Resuelve el 3-way match antes de pagar" : undefined}
                  onClick={openPayment}
                >
                  Registrar pago
                </Button>
              )}
              {canStamp && (
                <Button size="sm" variant="primary" onClick={() => void stampInvoice()} disabled={stamping}>
                  {stamping ? "Timbrando…" : "Timbrar CFDI"}
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      {/* 3 · Cómo va el dinero de esta factura. */}
      <MetricFrame>
        <MetricStrip metrics={metrics} ariaLabel="Resumen de la factura" />
      </MetricFrame>

      <NoticeStack notices={notices} />

      {/* 4 · Lo facturado. */}
      <BlockHeading title="Conceptos" meta={lines.length > 0 ? `${lines.length} partida${lines.length === 1 ? "" : "s"}` : undefined} />
      {lines.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 22 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 110px 120px", gap: 10, padding: "0 12px 6px", fontSize: 10.5, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            <span>Descripción</span><span style={{ textAlign: "right" }}>Cant.</span><span style={{ textAlign: "right" }}>P. unit.</span><span style={{ textAlign: "right" }}>Subtotal</span>
          </div>
          <div style={{ border: "1px solid var(--nx-panel-hairline)", borderRadius: 10, background: "var(--surface)", overflow: "hidden" }}>
            {lines.map((line, i) => (
              <div
                key={line.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 70px 110px 120px",
                  gap: 10,
                  padding: "11px 12px",
                  alignItems: "center",
                  borderTop: i === 0 ? undefined : "1px solid var(--nx-panel-hairline-soft, var(--border))",
                }}
              >
                <span style={{ fontSize: 13 }}>{line.description}</span>
                <span style={{ textAlign: "right", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{line.quantity}</span>
                <span style={{ textAlign: "right", fontSize: 13 }}><Money value={line.unitPrice} bold={false} /></span>
                <span style={{ textAlign: "right", fontSize: 13 }}><Money value={line.subtotal ?? (line.quantity * line.unitPrice)} /></span>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 10, padding: "10px 12px 0", alignItems: "baseline" }}>
            <span style={{ textAlign: "right", fontSize: 11.5, color: "var(--text-tertiary)" }}>Total</span>
            <span style={{ textAlign: "right", fontSize: 15 }}><Money value={invoice.totalAmount} /></span>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 22 }}>
          <EmptyState
            variant="compact"
            title="Sin partidas capturadas"
            description={invoice.description ?? "Esta factura no tiene conceptos desglosados."}
          />
        </div>
      )}

      {/* Pagos: solo aparece cuando hay historial que leer. */}
      {payments.length > 0 && (
        <>
          <BlockHeading
            title="Pagos"
            meta={`${payments.length} registrado${payments.length === 1 ? "" : "s"}${invoice.satPaymentMethod === "PPD" ? " · cada uno exige complemento" : ""}`}
          />
          <div style={{ border: "1px solid var(--nx-panel-hairline)", borderRadius: 10, background: "var(--surface)", overflow: "hidden", marginBottom: 22 }}>
            {payments.map((p, i) => (
              <div
                key={p.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "11px 12px",
                  borderTop: i === 0 ? undefined : "1px solid var(--nx-panel-hairline-soft, var(--border))",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}>{p.method ?? "Transferencia"}{p.reference ? ` · Ref: ${p.reference}` : ""}</div>
                  {p.notes && <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{p.notes}</div>}
                  {p.cfdiPaymentUuid && (
                    <div style={{ marginTop: 2 }}>
                      <CopyableRef value={p.cfdiPaymentUuid} display={`comp. ${p.cfdiPaymentUuid.slice(0, 8)}…`} label="el UUID del complemento" />
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{new Date(p.paymentDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}</span>
                <span style={{ fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums" }}><Money value={p.amount} /></span>
                {canEdit && invoice.satPaymentMethod === "PPD" && invoice.cfdiUuid && !p.cfdiPaymentUuid ? (
                  <Button size="sm" variant="secondary" onClick={() => void stampComplement(p.id)}>Timbrar comp.</Button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* 6 · El documento fiscal: los datos del CFDI y todo lo que actúa sobre él. */}
      <BlockHeading
        title="CFDI"
        actions={
          <>
            {invoice.cfdiUuid && (
              <Button size="sm" variant="ghost" onClick={() => void downloadXml()}>XML</Button>
            )}
            {invoice.cfdiUuid && invoice.pdfUrl && (
              <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                <Button size="sm" variant="ghost">PDF</Button>
              </a>
            )}
            {invoice.cfdiUuid && (
              <Button size="sm" variant="ghost" onClick={() => void checkSatStatus()} disabled={checkingSat}>
                {checkingSat ? "Consultando…" : "Estatus SAT"}
              </Button>
            )}
            {canEdit && invoice.cfdiUuid && !invoice.isCancelled && invoice.cfdiRelationType !== "01" && (
              <Button size="sm" variant="ghost" onClick={() => void createCreditNote()}>Nota de crédito</Button>
            )}
            {canEdit && invoice.cfdiUuid && !invoice.isCancelled && (
              <Button size="sm" variant="secondary" onClick={() => setShowCancel(true)}>Cancelar CFDI</Button>
            )}
          </>
        }
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "16px 22px",
          marginBottom: 4,
        }}
      >
        {[
          { label: isIncome ? "Cliente / Receptor" : "Proveedor", value: counterparty },
          { label: "RFC receptor", value: invoice.receptorRfc },
          { label: "Método pago SAT", value: invoice.satPaymentMethod ?? "PUE" },
          { label: "Emisión", value: new Date(invoice.issueDate).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" }) },
          { label: "Vencimiento", value: invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" }) : null },
        ].map(({ label, value }) => (
          <div key={label}>
            <FieldLabel>{label}</FieldLabel>
            <div style={{ fontSize: 13, color: value ? "var(--text-primary)" : "var(--text-tertiary)" }}>{value ?? "—"}</div>
          </div>
        ))}
        {invoice.cfdiUuid && (
          <div style={{ gridColumn: "1 / -1" }}>
            <FieldLabel>UUID fiscal</FieldLabel>
            <CopyableRef value={invoice.cfdiUuid} label="el UUID" />
            {satStatus && (
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-secondary)" }}>
                SAT: <strong style={{ fontWeight: 600 }}>{satStatus.estado}</strong>
                {satStatus.esCancelable ? ` · cancelable: ${satStatus.esCancelable}` : ""}
              </div>
            )}
          </div>
        )}
        {invoice.description && lines.length > 0 && (
          <div style={{ gridColumn: "1 / -1" }}>
            <FieldLabel>Concepto</FieldLabel>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{invoice.description}</div>
          </div>
        )}
      </div>

      {/* 7 · Metadatos de configuración. */}
      {pacInfo && (
        <FootNote>
          <span>PAC {pacInfo.provider?.toUpperCase() ?? "—"}</span>
          <Dot />
          <span>{pacInfo.configured ? "credenciales OK" : "sin credenciales"}</span>
          {pacInfo.env ? (<><Dot /><span>{pacInfo.env}</span></>) : null}
          {invoice.satPaymentMethod === "PPD" ? (<><Dot /><span>PPD: complemento por cada pago</span></>) : null}
        </FootNote>
      )}

      <Modal
        open={showCancel}
        onClose={() => setShowCancel(false)}
        title="Cancelar CFDI ante el SAT"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setShowCancel(false)}>Cerrar</Button>
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
            <Button size="sm" variant="ghost" onClick={() => setShowPayment(false)}>Cancelar</Button>
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
