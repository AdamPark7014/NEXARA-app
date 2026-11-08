"use client";

import { conRegreso, useRegreso } from "@/lib/regreso";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import CloudOffOutlinedIcon from "@mui/icons-material/CloudOffOutlined";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHead,
  Checkbox,
  DataTable,
  DateInput,
  EmptyState,
  Field,
  FieldGrid,
  Input,
  PageHead,
  Select,
  Stat,
  StatRow,
  type Column,
  type Tone,
} from "@/components/base";
import { Money } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { toast } from "@/components/Toast";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import Modal from "@/components/ui/Modal";
import { formatApiError } from "@/lib/erp-api";
import { saveBlob, todayStamp } from "@/components/finance/download";
import {
  COMMERCIAL_LABEL,
  CopyableRef,
  Dot,
  fiscalState,
  FootNote,
  NoticeStack,
  type Notice,
} from "../_parts";
import s from "./ficha.module.css";
import { formatoFechaLocal } from "@/lib/fecha-calendario";


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
const STATUS_TONE: Record<string, Tone> = {
  PAID: "success",
  PARTIALLY_PAID: "neutral",
  OVERDUE: "danger",
  SENT: "neutral",
  DRAFT: "neutral",
  CANCELLED: "danger",
};

/** Partidas de la factura: las mismas cuatro columnas de siempre, ahora en la tabla de la base. */
const COLUMNAS_CONCEPTOS: Column<InvoiceLine>[] = [
  { key: "description", label: "Descripción", render: (l) => l.description },
  { key: "quantity", label: "Cant.", numeric: true, width: 90, render: (l) => l.quantity },
  { key: "unitPrice", label: "P. unit.", numeric: true, width: 130, render: (l) => <Money value={l.unitPrice} bold={false} /> },
  { key: "subtotal", label: "Subtotal", numeric: true, width: 140, render: (l) => <Money value={l.subtotal ?? (l.quantity * l.unitPrice)} /> },
];

const MATCH_LABELS: Record<string, string> = {
  NOT_REQUIRED: "No aplica",
  PENDING: "Pendiente",
  MATCHED: "Coincide",
  VARIANCE: "Variación",
  WAIVED: "Eximido",
};

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const { user } = useUser();
  const regreso = useRegreso({ href: "/erp/invoicing", label: "Facturación" });
  const token = user?.token ?? "";
  const canEdit = user?.isSuperAdmin || ["ceo", "super_admin", "dir_admin", "contabilidad", "administrativo"].includes(user?.roleKey ?? "");

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pacInfo, setPacInfo] = useState<{ provider?: string; configured?: boolean; productionWarning?: string | null; env?: string; csd?: { configured?: boolean } } | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [payForm, setPayForm] = useState({
    amount: "",
    paymentDate: todayStamp(),
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
  const [cancelErr, setCancelErr] = useState<string | null>(null);
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
      setError(formatApiError(e, "No se pudo cargar la factura"));
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
      saveBlob(await res.blob(), `${invoice?.invoiceNumber ?? id}.xml`);
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo descargar el XML"));
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
      toast.error(formatApiError(e, "No se pudo consultar el estado en el SAT"));
    } finally { setCheckingSat(false); }
  };

  const cancelInvoice = async () => {
    if (!token || !id) return;
    if (cancelReason === "01" && !substitutionUuid.trim()) {
      setCancelErr("Con el motivo 01 hay que indicar el UUID del CFDI que sustituye a éste.");
      return;
    }
    setCancelErr(null);
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
      const msg = formatApiError(e, "No se pudo cancelar la factura");
      setCancelErr(msg);
      toast.error(msg);
    } finally { setCancelling(false); }
  };

  const createCreditNote = async () => {
    if (!token || !id) return;
    try {
      const nc = await apiFetch(`accounting/invoices/${id}/credit-note`, token, { method: "POST", body: JSON.stringify({}) });
      toast.success(`Nota de crédito ${nc.invoiceNumber} creada en borrador`);
      router.push(conRegreso(`/erp/invoicing/${nc.id}`, `/erp/invoicing/${id}`));
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo crear la nota de crédito"));
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
      toast.success("Cotejo con orden de compra y recepción recalculado");
      void load();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo reevaluar el cotejo"));
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
      toast.success("Cotejo eximido: ya puedes registrar el pago");
      void load();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo eximir el cotejo"));
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

  if (loading && !invoice) {
    return (
      <div className={s.pagina}>
        <Card>
          <EmptyState tone="neutral" icon={<HourglassEmptyOutlinedIcon />} title="Cargando factura…" description="Consultando el CFDI." />
        </Card>
      </div>
    );
  }
  if (error && !invoice) {
    return (
      <div className={s.pagina}>
        <Card>
          <EmptyState
            tone="danger"
            icon={<CloudOffOutlinedIcon />}
            title="No se pudo cargar la factura"
            description={error}
            action={<Button onClick={() => void load()}>Reintentar</Button>}
          />
        </Card>
      </div>
    );
  }
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
  const botonPago = canPay ? (
    <Button
      variant={canStamp ? "secondary" : "primary"}
      disabled={!matchAllowsPay}
      title={!matchAllowsPay ? "Resuelve el cotejo con la orden de compra antes de pagar" : undefined}
      onClick={openPayment}
    >
      Registrar pago
    </Button>
  ) : null;
  // Sin servicio de timbrado conectado el botón no se ofrece como si fuera a funcionar (07-11).
  const pacBloqueado = Boolean(pacInfo && (pacInfo.configured === false || pacInfo.productionWarning));
  const botonTimbrar = canStamp ? (
    <Button
      variant="primary"
      onClick={() => void stampInvoice()}
      disabled={stamping || pacBloqueado}
      title={pacBloqueado ? "Todavía no se puede timbrar: falta conectar el servicio de timbrado." : undefined}
    >
      {stamping ? "Timbrando…" : "Timbrar CFDI"}
    </Button>
  ) : null;

  /* ---------------------------------------------------------------- *
   * Avisos: el 3-way match dejó de ser una tarjeta propia y entra en la
   * misma pila que el PAC. Lo que bloquea el pago se lee como lo que es.
   * ---------------------------------------------------------------- */
  const notices: Notice[] = [];
  if (actionError) {
    notices.push({ id: "action", level: "critical", text: actionError, onDismiss: () => setActionError(null) });
  }
  if (error) {
    notices.push({
      id: "reload",
      level: "warning",
      text: `No se pudo actualizar la factura; se muestran los datos anteriores. ${error}`,
      onDismiss: () => setError(null),
    });
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
      text: `Cotejo orden de compra – recepción – factura: ${MATCH_LABELS[match] ?? match}.${
        invoice.matchNotes ? ` ${invoice.matchNotes}` : blocked ? " Resuélvelo para poder pagar." : ""
      }`,
      secondaryAction: canEdit ? { label: "Reevaluar", onClick: () => void evaluateMatch(), busy: matching } : undefined,
      action:
        canEdit && (match === "VARIANCE" || match === "PENDING")
          ? {
              label: "Eximir cotejo",
              busy: matching,
              onClick: () =>
                setConfirmState({
                  title: "Eximir cotejo",
                  message:
                    "La factura quedará lista para pagarse aunque no coincida con la orden de compra o la recepción. La excepción queda registrada.",
                  confirmLabel: "Eximir y permitir pago",
                  danger: true,
                  fn: waiveMatch,
                }),
            }
          : undefined,
    });
  }

  const payments = invoice.payments ?? [];
  const lines = invoice.items ?? [];

  return (
    <>
      <div className={s.pagina}>
        {/* Cabeza: folio, contraparte y los dos estados que importan. Un solo primario: el siguiente paso fiscal de ESTA
            factura. Lo demás (XML, PDF, estatus, nota de crédito, cancelación) actúa sobre el documento timbrado y vive
            en la tarjeta del CFDI. */}
        <PageHead
          className={s.cabeza}
          back={regreso}
          eyebrow={`Finanzas · ${isIncome ? "Cuentas por cobrar" : "Cuentas por pagar"}`}
          title={invoice.invoiceNumber}
          description={counterparty ?? "—"}
          meta={
            <>
              <Badge dot tone={fiscal.tone} title={fiscal.title}>{fiscal.label}</Badge>
              <Badge dot tone={STATUS_TONE[invoice.status] ?? "neutral"}>
                {COMMERCIAL_LABEL[invoice.status] ?? invoice.status}
              </Badge>
            </>
          }
          secondaryActions={canStamp ? botonPago : undefined}
          primaryAction={canStamp ? botonTimbrar : botonPago}
        />

        <NoticeStack notices={notices} />

        {/* Cómo va el dinero de esta factura. */}
        <StatRow variant="strip" ariaLabel="Resumen de la factura">
          <Stat
            label="Total"
            value={<Money value={invoice.totalAmount} />}
            hint={isIncome ? "por cobrar al cliente" : "por pagar al proveedor"}
            icon={<ReceiptLongOutlinedIcon />}
            iconTone="neutral"
          />
          <Stat
            label="Pagado"
            value={<Money value={invoice.paidAmount ?? 0} />}
            hint={`${paidPct}% cubierto`}
            tone={paidPct === 100 ? "success" : "default"}
            icon={<CheckCircleOutlineRoundedIcon />}
            iconTone="neutral"
          />
          <Stat
            label="Pendiente"
            value={<Money value={pendingAmount} />}
            hint={
              pendingAmount > 0
                ? invoice.status === "OVERDUE"
                  ? "fuera de plazo"
                  : invoice.dueDate
                    ? `vence ${formatoFechaLocal(invoice.dueDate, { day: "2-digit", month: "short" })}`
                    : "saldo abierto"
                : "sin saldo"
            }
            tone={pendingAmount > 0 && invoice.status === "OVERDUE" ? "danger" : pendingAmount > 0 ? "warning" : "default"}
            icon={<PendingActionsOutlinedIcon />}
            iconTone="neutral"
          />
        </StatRow>

        {/* Lo facturado. */}
        <Card className={s.tarjetaTabla}>
          <CardHead
            title="Conceptos"
            subtitle={lines.length > 0 ? `${lines.length} partida${lines.length === 1 ? "" : "s"}` : undefined}
          />
          {lines.length > 0 ? (
            <>
              <DataTable
                flush
                ariaLabel="Conceptos de la factura"
                columns={COLUMNAS_CONCEPTOS}
                rows={lines}
                rowKey={(l) => l.id}
              />
              <div className={s.total}>
                <span className={s.totalEtiqueta}>Total</span>
                <span className={s.totalMonto}><Money value={invoice.totalAmount} /></span>
              </div>
            </>
          ) : (
            <EmptyState
              size="compact"
              tone="neutral"
              icon={<ReceiptLongOutlinedIcon />}
              title="Sin partidas capturadas"
              description={invoice.description ?? "Esta factura no tiene conceptos desglosados."}
            />
          )}
        </Card>

        {/* Pagos: solo aparece cuando hay historial que leer. */}
        {payments.length > 0 && (
          <Card>
            <CardHead
              title="Pagos"
              subtitle={`${payments.length} registrado${payments.length === 1 ? "" : "s"}${invoice.satPaymentMethod === "PPD" ? " · cada uno exige complemento" : ""}`}
            />
            <ul className={s.pagos}>
              {payments.map((p) => (
                <li key={p.id} className={s.pago}>
                  <div className={s.pagoInfo}>
                    <span className={s.pagoMetodo}>{p.method ?? "Transferencia"}{p.reference ? ` · Ref: ${p.reference}` : ""}</span>
                    {p.notes && <span className={s.pagoNotas}>{p.notes}</span>}
                    {p.cfdiPaymentUuid && (
                      <CopyableRef value={p.cfdiPaymentUuid} display={`comp. ${p.cfdiPaymentUuid.slice(0, 8)}…`} label="el UUID del complemento" />
                    )}
                  </div>
                  <span className={s.pagoFecha}>{formatoFechaLocal(p.paymentDate, { day: "2-digit", month: "short" })}</span>
                  <span className={s.pagoMonto}><Money value={p.amount} /></span>
                  <div className={s.pagoAccion}>
                    {canEdit && invoice.satPaymentMethod === "PPD" && invoice.cfdiUuid && !p.cfdiPaymentUuid ? (
                      <Button size="sm" variant="secondary" onClick={() => void stampComplement(p.id)}>Timbrar comp.</Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* El documento fiscal: los datos del CFDI y todo lo que actúa sobre él. */}
        <Card>
          <CardHead
            title="CFDI"
            actions={
              <>
                {invoice.cfdiUuid && (
                  <Button size="sm" variant="ghost" onClick={() => void downloadXml()}>XML</Button>
                )}
                {invoice.cfdiUuid && invoice.pdfUrl && (
                  <ButtonLink size="sm" variant="ghost" href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer">PDF</ButtonLink>
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
                  <Button size="sm" onClick={() => { setCancelErr(null); setShowCancel(true); }}>Cancelar CFDI</Button>
                )}
              </>
            }
          />
          <dl className={s.datos}>
            {[
              { label: isIncome ? "Cliente / Receptor" : "Proveedor", value: counterparty },
              { label: "RFC receptor", value: invoice.receptorRfc },
              { label: "Método pago SAT", value: invoice.satPaymentMethod ?? "PUE" },
              { label: "Emisión", value: formatoFechaLocal(invoice.issueDate, { day: "2-digit", month: "long", year: "numeric" }) },
              { label: "Vencimiento", value: invoice.dueDate ? formatoFechaLocal(invoice.dueDate, { day: "2-digit", month: "long", year: "numeric" }) : null },
            ].map(({ label, value }) => (
              <div key={label} className={s.dato}>
                <dt>{label}</dt>
                <dd className={value ? undefined : s.datoVacio}>{value ?? "—"}</dd>
              </div>
            ))}
            {invoice.cfdiUuid && (
              <div className={`${s.dato} ${s.datoAncho}`}>
                <dt>UUID fiscal</dt>
                <dd>
                  <CopyableRef value={invoice.cfdiUuid} label="el UUID" />
                  {satStatus && (
                    <div className={s.satEstado}>
                      SAT: <strong>{satStatus.estado}</strong>
                      {satStatus.esCancelable ? ` · cancelable: ${satStatus.esCancelable}` : ""}
                    </div>
                  )}
                </dd>
              </div>
            )}
            {invoice.description && lines.length > 0 && (
              <div className={`${s.dato} ${s.datoAncho}`}>
                <dt>Concepto</dt>
                <dd className={s.datoSec}>{invoice.description}</dd>
              </div>
            )}
          </dl>
        </Card>

        {/* Metadatos de configuración, al final y en gris. */}
        {pacInfo && (
          <FootNote>
            <span>PAC {pacInfo.provider?.toUpperCase() ?? "—"}</span>
            <Dot />
            <span>{pacInfo.configured ? "credenciales OK" : "sin credenciales"}</span>
            {pacInfo.env ? (<><Dot /><span>{pacInfo.env}</span></>) : null}
            {invoice.satPaymentMethod === "PPD" ? (<><Dot /><span>PPD: complemento por cada pago</span></>) : null}
          </FootNote>
        )}
      </div>

      <Modal
        open={showCancel}
        onClose={() => setShowCancel(false)}
        title="Cancelar CFDI ante el SAT"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setShowCancel(false)}>Cerrar</Button>
            <Button size="sm" variant="danger" onClick={() => void cancelInvoice()} disabled={cancelling}>
              {cancelling ? "Cancelando…" : "Confirmar cancelación"}
            </Button>
          </>
        }
      >
        <FieldGrid>
          <Field
            label="Motivo SAT"
            fullWidth
            hint="El motivo queda asentado en el acuse; el 01 obliga a indicar la factura que sustituye."
          >
            <Select value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}>
              <option value="01">01 — Comprobante emitido con errores (con relación)</option>
              <option value="02">02 — Comprobante emitido con errores (sin relación)</option>
              <option value="03">03 — No se llevó a cabo la operación</option>
              <option value="04">04 — Operación nominativa en factura global</option>
            </Select>
          </Field>
          {cancelReason === "01" && (
            <Field
              label="UUID sustituto"
              fullWidth
              hint="UUID completo del CFDI que reemplaza a éste."
            >
              <Input
                value={substitutionUuid}
                onChange={(e) => { setSubstitutionUuid(e.target.value); setCancelErr(null); }}
                placeholder="UUID del CFDI que sustituye"
                aria-invalid={cancelErr && !substitutionUuid.trim() ? true : undefined}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
          )}
        </FieldGrid>
        <p className={s.aviso}>
          La cancelación se envía al SAT y no se puede deshacer.
        </p>
        {cancelErr && (
          <div className={s.errorModal}>
            <Alert tone="danger" role="alert">{cancelErr}</Alert>
          </div>
        )}
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
        <FieldGrid>
          <Field label="Monto" hint="Pesos. Puede ser menor al saldo: queda como pago parcial.">
            <Input type="number" inputMode="decimal" min="0.01" step="0.01" value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))} autoFocus />
          </Field>
          <Field label="Fecha de pago" hint="La del estado de cuenta, no la de captura.">
            <DateInput value={payForm.paymentDate} onChange={(e) => setPayForm((f) => ({ ...f, paymentDate: e.target.value }))} />
          </Field>
          <Field label="Método">
            <Select value={payForm.method} onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}>
              <option value="SPEI">SPEI / Transferencia</option>
              <option value="CASH">Efectivo</option>
              <option value="CHECK">Cheque</option>
              <option value="CARD">Tarjeta</option>
            </Select>
          </Field>
          <Field label="Referencia" optional hint="Clave de rastreo del SPEI o folio del cheque.">
            <Input value={payForm.reference} onChange={(e) => setPayForm((f) => ({ ...f, reference: e.target.value }))} placeholder="Número de transferencia" />
          </Field>
          {invoice?.satPaymentMethod === "PPD" && (
            <Field
              label="Complemento de pago"
              fullWidth
              hint="La factura es PPD: el SAT exige un complemento por cada pago."
            >
              <span className={s.casilla}>
                <Checkbox
                  checked={payForm.stampComplement}
                  onChange={(e) => setPayForm((f) => ({ ...f, stampComplement: e.target.checked }))}
                />
                Timbrar complemento al registrar
              </span>
            </Field>
          )}
        </FieldGrid>
        {payErr && (
          <div className={s.errorModal}>
            <Alert tone="danger" role="alert">{payErr}</Alert>
          </div>
        )}
      </Modal>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
