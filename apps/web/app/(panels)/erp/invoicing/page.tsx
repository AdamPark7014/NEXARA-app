"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import MetricStrip, { type Metric } from "@/components/ui/MetricStrip";
import StatusDot, { type StatusTone } from "@/components/ui/StatusDot";
import Button from "@/components/ui/Button";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import FilterToolbar from "@/components/FilterToolbar";
import {
  FinanceField,
  FinanceFormGrid,
  financeInputStyle,
} from "@/components/finance/FinanceModuleShell";
import { exportToExcel } from "@/lib/export-excel";
import { useUser } from "@/components/UserContext";
import { getErpFinanceSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import Modal from "@/components/ui/Modal";
import { toast } from "@/components/Toast";
import FinanceModuleRail from "@/components/erp/FinanceModuleRail";
import { formatApiError } from "@/lib/erp-api";

interface InvoiceRow {
  id: number;
  invoiceNumber: string;
  type: "INCOME" | "EXPENSE" | string;
  status: "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED" | string;
  issueDate: string;
  totalAmount: number | string;
  paidAmount?: number | string;
  cfdiUuid?: string | null;
  satPaymentMethod?: string | null;
  receptorName?: string | null;
  emisorName?: string | null;
}

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

function displayInvoiceType(type: string): "INCOME" | "EXPENSE" {
  return type === "ACCOUNTS_RECEIVABLE" || type === "INCOME" ? "INCOME" : "EXPENSE";
}

function apiTypeParam(filter: "" | "INCOME" | "EXPENSE"): string {
  if (filter === "INCOME") return "ACCOUNTS_RECEIVABLE";
  if (filter === "EXPENSE") return "ACCOUNTS_PAYABLE";
  return "";
}

const COMMERCIAL_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  SENT: "Enviada",
  PARTIALLY_PAID: "Pago parcial",
  PAID: "Pagada",
  OVERDUE: "Vencida",
  CANCELLED: "Cancelada",
};

/**
 * Estado fiscal de la factura.
 *
 * El `status` del ERP mezcla lo comercial (pagada, vencida) con lo fiscal
 * (borrador, cancelada), y frente al SAT lo que manda es si el CFDI está
 * timbrado. Por eso el punto lleva el estado fiscal —lo que la contadora
 * busca primero— y lo comercial baja a la línea gris de abajo.
 */
function fiscalState(inv: InvoiceRow): { label: string; tone: StatusTone; title: string } {
  if (inv.status === "CANCELLED") {
    return { label: "Cancelada", tone: "danger", title: "CFDI cancelado ante el SAT" };
  }
  if (!inv.cfdiUuid) {
    return { label: "Sin timbrar", tone: "warning", title: "Borrador: todavía no tiene UUID fiscal" };
  }
  if (inv.satPaymentMethod === "PPD") {
    return {
      label: "Timbrada · PPD",
      tone: "neutral",
      title: "Timbrada. Cada pago exige complemento (Pagos 2.0)",
    };
  }
  return { label: "Timbrada", tone: "neutral", title: "CFDI con UUID fiscal" };
}

/**
 * Folio y UUID copiables sin romper la fila.
 *
 * El UUID mide 36 caracteres: pintarlo entero ensancha la tabla y obliga a
 * scroll horizontal. Se muestra el arranque —que es lo que se reconoce de un
 * vistazo— y el botón copia el valor íntegro, que es lo que se pega en el
 * portal del SAT.
 */
function CopyableRef({
  value,
  display,
  label,
}: {
  value: string;
  display?: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    void navigator.clipboard?.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
      <code style={{ fontSize: 11.5, letterSpacing: "0.01em" }}>{display ?? value}</code>
      <button
        type="button"
        onClick={copy}
        title={copied ? "Copiado" : `Copiar ${label}`}
        aria-label={copied ? "Copiado" : `Copiar ${label}`}
        style={{
          border: "none",
          background: "transparent",
          cursor: "pointer",
          padding: 0,
          fontSize: 11,
          lineHeight: 1,
          color: copied ? "var(--state-success-text, #15803d)" : "var(--text-tertiary)",
        }}
      >
        {copied ? "✓" : "⧉"}
      </button>
    </span>
  );
}

export default function InvoicingPage() {
  const { user } = useUser();
  const cfg = useMemo(() => getErpFinanceSectionConfig(user, "invoicing"), [user]);
  const token = user?.token ?? "";
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const invoiceRef = searchParams.get("invoiceRef");

  const [items, setItems] = useState<InvoiceRow[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"" | "INCOME" | "EXPENSE">("");
  const [showForm, setShowForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceRow | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<InvoiceRow | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: "", paymentDate: new Date().toISOString().slice(0, 10), method: "SPEI", reference: "", notes: "", stampComplement: true });
  const [paymentErr, setPaymentErr] = useState<string | null>(null);
  /** Errores de timbrar/cancelar que mueren con el ConfirmDialog si solo hay toast. */
  const [actionError, setActionError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [pacInfo, setPacInfo] = useState<{ provider?: string; configured?: boolean; productionWarning?: string | null; env?: string; csd?: { configured?: boolean } } | null>(null);
  const [issuerProfile, setIssuerProfile] = useState<{ emisorRfc?: string | null; emisorName?: string | null; emisorZipCode?: string | null; source?: string } | null>(null);
  const [rfcValidation, setRfcValidation] = useState<{ valid?: boolean; message?: string } | null>(null);
  const [form, setForm] = useState({
    type: "INCOME" as "INCOME" | "EXPENSE",
    receptorName: "",
    receptorRfc: "",
    receptorZipCode: "",
    receptorRegime: "601",
    cfdiUsage: "G03",
    satPaymentMethod: "PUE" as "PUE" | "PPD",
    satPaymentForm: "03",
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    description: "",
    quantity: 1,
    unitPrice: 0,
    satProductKey: "80101500",
    satUnitKey: "E48",
  });

  const inp = financeInputStyle;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const apiType = apiTypeParam(filter);
      const params = new URLSearchParams({ limit: "100" });
      if (apiType) params.set("type", apiType);
      const data = await apiFetch(`accounting/invoices?${params}`, token);
      setItems(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar facturación");
    } finally { setLoading(false); }
  }, [token, filter]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!token) return;
    void apiFetch("accounting/invoices/pac-info", token)
      .then((data) => setPacInfo(data))
      .catch(() => setPacInfo(null));
  }, [token]);

  const [searchQ, setSearchQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const visibleItems = useMemo(() => {
    let rows = items;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      rows = rows.filter((f) =>
        (f.invoiceNumber ?? "").toLowerCase().includes(q) ||
        (f.receptorName ?? "").toLowerCase().includes(q) ||
        (f.emisorName ?? "").toLowerCase().includes(q)
      );
    }
    if (filterStatus) rows = rows.filter((f) => f.status === filterStatus);
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) rows = [...rows].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
    }
    if (invoiceRef) {
      const ref = invoiceRef.toLowerCase();
      rows = rows.filter((f) => f.invoiceNumber.toLowerCase().includes(ref));
    }
    return rows;
  }, [items, highlightId, invoiceRef, searchQ, filterStatus]);

  useEffect(() => {
    if (!showForm || !token) return;
    void apiFetch("accounting/invoices/issuer-profile", token)
      .then((data) => setIssuerProfile(data))
      .catch(() => setIssuerProfile(null));
  }, [showForm, token]);

  const validateRfc = async (rfc: string) => {
    if (!token || !rfc.trim()) { setRfcValidation(null); return; }
    try {
      const data = await apiFetch(`accounting/invoices/sat/validate-rfc/${encodeURIComponent(rfc.trim())}`, token);
      setRfcValidation({ valid: data.valid, message: data.valid ? "RFC válido" : data.reason || "RFC inválido" });
    } catch {
      setRfcValidation(null);
    }
  };

  const facturadoMes = items.filter((f) => displayInvoiceType(f.type) === "INCOME" && f.status !== "CANCELLED").reduce((s, f) => s + Number(f.totalAmount), 0);
  const porTimbrar = items.filter((f) => f.status === "DRAFT").length;
  const canceladas = items.filter((f) => f.status === "CANCELLED").length;
  const vencidas = items.filter((f) => f.status === "OVERDUE").length;

  const stamp = (inv: InvoiceRow) => {
    if (!token) return;
    setConfirmState({
      title: "Timbrar CFDI",
      message: `¿Timbrar la factura ${inv.invoiceNumber} ante el PAC? Esta acción genera el UUID fiscal.`,
      confirmLabel: "Timbrar",
      danger: false,
      fn: async () => {
        setActionError(null);
        try {
          await apiFetch(`accounting/invoices/${inv.id}/stamp`, token, { method: "POST" });
          toast.success("Factura timbrada ante el PAC");
          void load();
        } catch (e) {
          const msg = formatApiError(e, "No se pudo timbrar");
          setActionError(`Error al timbrar ${inv.invoiceNumber}: ${msg}`);
          toast.error(msg);
        }
      },
    });
  };

  const cancel = async (inv: InvoiceRow) => {
    if (!token) return;
    setConfirmState({ message: `¿Cancelar el CFDI ${inv.invoiceNumber}?`, confirmLabel: "Cancelar CFDI", fn: async () => {
    setActionError(null);
    try {
      await apiFetch(`accounting/invoices/${inv.id}/cancel`, token, { method: "PATCH", body: JSON.stringify({ cancelReason: "02" }) });
      void load();
    } catch (e) {
      const msg = formatApiError(e, "No se pudo cancelar");
      setActionError(`Error al cancelar ${inv.invoiceNumber}: ${msg}`);
      toast.error(msg);
    }
  } });
  };

  const openPayment = (inv: InvoiceRow) => {
    const total = Number(inv.totalAmount);
    const paid = Number(inv.paidAmount ?? 0);
    const pending = Math.max(0, total - paid);
    setPaymentTarget(inv);
    setPaymentForm({
      amount: pending > 0 ? String(pending) : "",
      paymentDate: new Date().toISOString().slice(0, 10),
      method: "SPEI",
      reference: "",
      notes: "",
      stampComplement: inv.satPaymentMethod === "PPD",
    });
    setPaymentErr(null);
  };

  const submitPayment = async () => {
    if (!token || !paymentTarget) return;
    const amount = Number(paymentForm.amount);
    if (!amount || amount <= 0) { setPaymentErr("Indica un monto válido."); return; }
    setPaying(true);
    setPaymentErr(null);
    try {
      const result = await apiFetch(`accounting/invoices/${paymentTarget.id}/payments`, token, {
        method: "POST",
        body: JSON.stringify({
          amount,
          paymentDate: paymentForm.paymentDate,
          method: paymentForm.method,
          reference: paymentForm.reference.trim() || undefined,
          notes: paymentForm.notes.trim() || undefined,
          stampComplement: paymentTarget.satPaymentMethod === "PPD" ? paymentForm.stampComplement : undefined,
        }),
      });
      if (result?.complement?.cfdiPaymentUuid) {
        toast.success(`Complemento de pago timbrado: ${result.complement.cfdiPaymentUuid.slice(0, 8)}…`);
      } else if (result?.complementStampWarning) {
        toast.warning(`Pago registrado, pero el complemento no se timbró: ${result.complementStampWarning}`);
      } else {
        toast.success("Pago registrado");
      }
      setPaymentTarget(null);
      void load();
    } catch (e) {
      const msg = formatApiError(e, "Error al registrar pago");
      setPaymentErr(msg);
      toast.error(msg);
    } finally {
      setPaying(false);
    }
  };

  const openNew = () => {
    setEditingInvoice(null);
    setFormErr(null);
    setForm({
      type: "INCOME",
      receptorName: "",
      receptorRfc: "",
      receptorZipCode: "",
      receptorRegime: "601",
      cfdiUsage: "G03",
      satPaymentMethod: "PUE",
      satPaymentForm: "03",
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      description: "",
      quantity: 1,
      unitPrice: 0,
      satProductKey: "80101500",
      satUnitKey: "E48",
    });
    setShowForm(true);
  };

  const openEditDraft = async (inv: InvoiceRow) => {
    if (inv.status !== "DRAFT") {
      toast.warning("Solo se pueden editar facturas en borrador.");
      return;
    }
    setEditingInvoice(inv);
    setFormErr(null);
    setShowForm(true);
    try {
      const full = await apiFetch(`accounting/invoices/${inv.id}`, token) as {
        type?: string;
        issueDate?: string;
        dueDate?: string;
        receptorName?: string;
        receptorRfc?: string;
        receptorZipCode?: string;
        receptorRegime?: string;
        cfdiUsage?: string;
        satPaymentMethod?: string;
        satPaymentForm?: string;
        items?: Array<{ description?: string; quantity?: number | string; unitPrice?: number | string; satProductKey?: string; satUnitKey?: string }>;
      };
      const item = full.items?.[0];
      const satForm = full.satPaymentForm?.replace(/^FP/, "") ?? "03";
      setForm({
        type: full.type === "ACCOUNTS_PAYABLE" ? "EXPENSE" : "INCOME",
        receptorName: full.receptorName ?? "",
        receptorRfc: full.receptorRfc ?? "",
        receptorZipCode: full.receptorZipCode ?? "",
        receptorRegime: full.receptorRegime ?? "601",
        cfdiUsage: full.cfdiUsage ?? "G03",
        satPaymentMethod: full.satPaymentMethod === "PPD" ? "PPD" : "PUE",
        satPaymentForm: satForm,
        issueDate: full.issueDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        dueDate: full.dueDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        description: item?.description ?? "",
        quantity: Number(item?.quantity ?? 1),
        unitPrice: Number(item?.unitPrice ?? 0),
        satProductKey: item?.satProductKey ?? "80101500",
        satUnitKey: item?.satUnitKey ?? "E48",
      });
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "No se pudo cargar la factura");
    }
  };

  const saveInvoice = async () => {
    if (!token) {
      setFormErr("Tu sesión no tiene un token válido. Vuelve a iniciar sesión.");
      toast.error("Sesión no válida");
      return;
    }
    if (!form.receptorName.trim()) {
      setFormErr("Indica el nombre del receptor.");
      return;
    }
    if (!form.receptorZipCode.trim()) {
      setFormErr("Indica el código postal del receptor.");
      return;
    }
    if (!form.description.trim()) {
      setFormErr("Indica el concepto de la factura.");
      return;
    }
    if (!(form.unitPrice > 0)) {
      setFormErr("El precio unitario debe ser mayor a cero.");
      return;
    }
    setSaving(true);
    setFormErr(null);
    const body = {
      issueDate: form.issueDate,
      dueDate: form.dueDate,
      receptorName: form.receptorName.trim(),
      receptorRfc: form.receptorRfc.trim() || undefined,
      receptorZipCode: form.receptorZipCode.trim() || undefined,
      receptorRegime: form.receptorRegime.trim() || undefined,
      cfdiUsage: form.cfdiUsage,
      items: [{
        description: form.description.trim(),
        quantity: form.quantity,
        unitPrice: form.unitPrice,
        taxRate: 16,
        satProductKey: form.satProductKey.trim() || "80101500",
        satUnitKey: form.satUnitKey.trim() || "E48",
        unitName: "Servicio",
      }],
    };
    try {
      if (editingInvoice) {
        await apiFetch(`accounting/invoices/${editingInvoice.id}`, token, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiFetch("accounting/invoices", token, {
          method: "POST",
          body: JSON.stringify({
            type: form.type === "INCOME" ? "ACCOUNTS_RECEIVABLE" : "ACCOUNTS_PAYABLE",
            satPaymentForm: form.satPaymentForm,
            satPaymentMethod: form.satPaymentMethod,
            ...body,
          }),
        });
      }
      toast.success(editingInvoice ? "Cambios guardados" : "Borrador creado");
      setShowForm(false);
      setEditingInvoice(null);
      void load();
    } catch (e) {
      const msg = formatApiError(e, "No se pudo guardar");
      setFormErr(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<InvoiceRow>[] = [
    {
      key: "invoiceNumber",
      label: "Folio",
      width: 150,
      render: (f) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Link
            href={`/erp/invoicing/${f.id}`}
            style={{ fontSize: 12.5, fontWeight: 600, color: "var(--primary)", textDecoration: "none" }}
          >
            {f.invoiceNumber}
          </Link>
          {f.cfdiUuid ? (
            <CopyableRef value={f.cfdiUuid} display={`${f.cfdiUuid.slice(0, 8)}…`} label="el UUID" />
          ) : (
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>sin UUID</span>
          )}
        </div>
      ),
    },
    {
      key: "receptorName",
      label: "Cliente / Proveedor",
      render: (f) => {
        const t = displayInvoiceType(f.type);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 13 }}>{f.receptorName ?? f.emisorName ?? "—"}</span>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              {t === "INCOME" ? "Ingreso" : "Egreso"}
              {f.satPaymentMethod ? ` · ${f.satPaymentMethod}` : ""}
            </span>
          </div>
        );
      },
    },
    {
      key: "totalAmount",
      label: "Monto",
      numeric: true,
      width: 140,
      render: (f) => {
        const total = Number(f.totalAmount);
        const paid = Number(f.paidAmount ?? 0);
        const pending = Math.max(0, total - paid);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
            <Money value={total} />
            {paid > 0 && pending > 0 && (
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                pendiente {pending.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "issueDate", label: "Emisión",
      render: (f) => {
        const days = Math.floor((Date.now() - new Date(f.issueDate).getTime()) / 86400000);
        const isPending = f.status !== "PAID" && f.status !== "CANCELLED";
        const color = days >= 60 ? "var(--state-danger-text, #b91c1c)" : days >= 30 ? "var(--state-warning-text, #b45309)" : "var(--text-tertiary)";
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              {new Date(f.issueDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
            </span>
            {isPending && <span style={{ fontSize: 11, color }}>{days}d</span>}
          </div>
        );
      },
      width: 100,
    },
    {
      key: "status", label: "Estado", width: 150,
      render: (f) => {
        const fiscal = fiscalState(f);
        const comercial = COMMERCIAL_LABEL[f.status] ?? f.status.replace(/_/g, " ");
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <StatusDot label={fiscal.label} tone={fiscal.tone} title={fiscal.title} />
            {f.status !== "CANCELLED" && (
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", paddingLeft: 11 }}>{comercial}</span>
            )}
          </div>
        );
      },
    },
    ...(cfg.canApprove ? [{
      key: "acciones" as keyof InvoiceRow, label: "",
      render: (f: InvoiceRow) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          {f.status === "DRAFT" && cfg.canCreate && (
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); void openEditDraft(f); }}>Editar</Button>
          )}
          {f.status === "DRAFT" && <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); void stamp(f); }}>Timbrar</Button>}
          {cfg.canCreate && f.status !== "DRAFT" && f.status !== "CANCELLED" && f.status !== "PAID" && (
            <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openPayment(f); }}>Pago</Button>
          )}
          {cfg.canDelete && f.status !== "CANCELLED" && <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); void cancel(f); }}>Cancelar</Button>}
        </div>
      ),
      width: 240,
    }] : []),
  ];

  return (
    <>
      <PageHeader
        eyebrow="ERP · Finanzas"
        title={cfg.title}
        subtitle={cfg.subtitle}
        density="ops"
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => void load()}>Actualizar</Button>
            {cfg.canCreate && (
              <Button size="sm" variant="secondary" iconLeft="+" onClick={openNew}>Nueva factura</Button>
            )}
          </>
        }
      />
      <FinanceModuleRail />

      {(() => {
        const incomeInvoices = items.filter((f) => displayInvoiceType(f.type) === "INCOME" && f.status !== "CANCELLED");
        const cobrado = incomeInvoices.filter((f) => f.status === "PAID").reduce((s, f) => s + Number(f.totalAmount), 0);
        const pendiente = incomeInvoices.filter((f) => f.status !== "PAID").reduce((s, f) => s + Number(f.totalAmount), 0);
        const cobranzaPct = facturadoMes > 0 ? Math.round((cobrado / facturadoMes) * 100) : 0;
        const metrics: Metric[] = [
          {
            label: "Facturado (ingresos)",
            value: <Money value={facturadoMes} compact bold={false} />,
            hint: `${incomeInvoices.length} CFDI de ingreso`,
          },
          {
            label: "Cobrado",
            value: <Money value={cobrado} compact bold={false} />,
            hint: `${cobranzaPct}% del facturado`,
          },
          {
            label: "Por cobrar",
            value: <Money value={pendiente} compact bold={false} />,
            hint: "saldo abierto de ingresos",
            tone: pendiente > 0 ? "warning" : "default",
          },
          {
            label: "Por timbrar",
            value: porTimbrar,
            hint: "borradores sin UUID",
            tone: porTimbrar > 0 ? "warning" : "default",
            onClick: () => setFilterStatus(porTimbrar > 0 ? "DRAFT" : ""),
          },
          {
            label: "Vencidas",
            value: vencidas,
            hint: "fuera de plazo de pago",
            tone: vencidas > 0 ? "danger" : "default",
            onClick: () => setFilterStatus(vencidas > 0 ? "OVERDUE" : ""),
          },
          {
            label: "Canceladas",
            value: canceladas,
            hint: "no cuentan al facturado",
            onClick: () => setFilterStatus(canceladas > 0 ? "CANCELLED" : ""),
          },
        ];
        return (
          <div style={{ marginBottom: 14 }}>
            <MetricStrip metrics={metrics} ariaLabel="Resumen de facturación" />
          </div>
        );
      })()}

      {pacInfo && (
        <>
          <div
            style={{
              marginBottom: 12,
              fontSize: 12,
              color: "var(--text-tertiary)",
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            <span>PAC / timbrado: {pacInfo.provider?.toUpperCase() ?? "—"}</span>
            <span>·</span>
            <span>{pacInfo.configured ? "credenciales OK" : "sin credenciales"}</span>
            {pacInfo.env ? (<><span>·</span><span>{pacInfo.env}</span></>) : null}
          </div>
          {pacInfo.productionWarning && (
            <InlineAlert variant="danger" message={pacInfo.productionWarning} />
          )}
          {pacInfo.csd?.configured === false && pacInfo.provider !== "facturama" && (
            <InlineAlert
              variant="warning"
              message="CSD del emisor no configurado — requerido para sellado local (Finkok/SW)."
            />
          )}
        </>
      )}

      {showForm && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 18 }}>
          <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 14 }}>
            {editingInvoice ? `Editar borrador ${editingInvoice.invoiceNumber}` : "Nueva factura (borrador CFDI)"}
          </p>
          <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--text-tertiary)" }}>
            Se guarda como borrador; el UUID fiscal se genera al timbrar.
          </p>
          {issuerProfile && (
            <div style={{ marginBottom: 14, fontSize: 12, color: "var(--text-tertiary)" }}>
              Emisor: {issuerProfile.emisorName ?? "—"} · RFC {issuerProfile.emisorRfc ?? "—"} · CP{" "}
              {issuerProfile.emisorZipCode ?? "sin capturar"}
            </div>
          )}
          {issuerProfile && !issuerProfile.emisorZipCode && (
            <InlineAlert
              variant="warning"
              message="Configura el CP fiscal del emisor en el perfil de empresa antes de timbrar."
            />
          )}
          <FinanceFormGrid>
            <FinanceField label="Tipo" hint="Ingreso emite CFDI a un cliente; egreso registra el de un proveedor.">
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as "INCOME" | "EXPENSE" }))} style={inp}>
                <option value="INCOME">Ingreso (cliente)</option>
                <option value="EXPENSE">Egreso (proveedor)</option>
              </select>
            </FinanceField>
            <FinanceField
              label="RFC receptor"
              optional
              hint={rfcValidation?.valid ? rfcValidation.message : "Se valida contra el SAT al salir del campo."}
              error={rfcValidation && !rfcValidation.valid ? rfcValidation.message ?? "RFC inválido" : null}
            >
              <input
                value={form.receptorRfc}
                onChange={(e) => { setForm((f) => ({ ...f, receptorRfc: e.target.value })); setRfcValidation(null); }}
                onBlur={() => void validateRfc(form.receptorRfc)}
                placeholder="XAXX010101000"
                style={inp}
              />
            </FinanceField>
            <FinanceField
              label="Nombre cliente / proveedor"
              fullWidth
              hint="Razón social tal como aparece en la Constancia de Situación Fiscal."
            >
              <input value={form.receptorName} onChange={(e) => setForm((f) => ({ ...f, receptorName: e.target.value }))} style={inp} />
            </FinanceField>
            <FinanceField label="CP fiscal receptor" hint="Código postal del domicilio fiscal del receptor.">
              <input value={form.receptorZipCode} onChange={(e) => setForm((f) => ({ ...f, receptorZipCode: e.target.value }))} placeholder="64000" style={inp} />
            </FinanceField>
            <FinanceField label="Régimen receptor" hint="Clave del catálogo c_RegimenFiscal. 601 = General de ley personas morales.">
              <input value={form.receptorRegime} onChange={(e) => setForm((f) => ({ ...f, receptorRegime: e.target.value }))} placeholder="601" style={inp} />
            </FinanceField>
            <FinanceField label="Uso CFDI" hint="Lo elige quien recibe la factura; si no lo sabes, P01.">
              <select value={form.cfdiUsage} onChange={(e) => setForm((f) => ({ ...f, cfdiUsage: e.target.value }))} style={inp}>
                <option value="G03">G03 — Gastos en general</option>
                <option value="I04">I04 — Equipo de cómputo</option>
                <option value="P01">P01 — Por definir</option>
              </select>
            </FinanceField>
            <FinanceField label="Método de pago SAT" hint="PPD obliga a timbrar un complemento por cada pago recibido.">
              <select value={form.satPaymentMethod} onChange={(e) => setForm((f) => ({ ...f, satPaymentMethod: e.target.value as "PUE" | "PPD" }))} style={inp}>
                <option value="PUE">PUE — Pago en una sola exhibición</option>
                <option value="PPD">PPD — Pago en parcialidades (requiere complemento)</option>
              </select>
            </FinanceField>
            <FinanceField label="Forma de pago" hint="Con qué instrumento se cobra. Catálogo c_FormaPago.">
              <select value={form.satPaymentForm} onChange={(e) => setForm((f) => ({ ...f, satPaymentForm: e.target.value }))} style={inp}>
                <option value="03">03 — Transferencia</option>
                <option value="01">01 — Efectivo</option>
                <option value="04">04 — Tarjeta</option>
                <option value="99">99 — Por definir</option>
              </select>
            </FinanceField>
            <FinanceField label="Clave SAT producto" hint="Catálogo c_ClaveProdServ. 80101500 = servicios de consultoría.">
              <input value={form.satProductKey} onChange={(e) => setForm((f) => ({ ...f, satProductKey: e.target.value }))} placeholder="80101500" style={inp} />
            </FinanceField>
            <FinanceField label="Clave SAT unidad" hint="Catálogo c_ClaveUnidad. E48 = unidad de servicio.">
              <input value={form.satUnitKey} onChange={(e) => setForm((f) => ({ ...f, satUnitKey: e.target.value }))} placeholder="E48" style={inp} />
            </FinanceField>
            <FinanceField label="Emisión">
              <input type="date" value={form.issueDate} onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))} style={inp} />
            </FinanceField>
            <FinanceField label="Vencimiento" hint="Fecha límite de pago; con ella se calcula el vencido.">
              <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} style={inp} />
            </FinanceField>
            <FinanceField label="Concepto" fullWidth hint="Aparece tal cual en el CFDI que recibe el cliente.">
              <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Servicio de instalación CCTV" style={inp} />
            </FinanceField>
            <FinanceField label="Cantidad">
              <input type="number" min={1} value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: +e.target.value }))} style={inp} />
            </FinanceField>
            <FinanceField label="Precio unitario" hint="Pesos, antes de IVA. El 16% se agrega al timbrar.">
              <input type="number" min={0} step="0.01" value={form.unitPrice || ""} onChange={(e) => setForm((f) => ({ ...f, unitPrice: +e.target.value }))} style={inp} />
            </FinanceField>
          </FinanceFormGrid>
          {formErr && <div style={{ marginTop: 14 }}><InlineAlert variant="danger" message={formErr} /></div>}
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              marginTop: 16,
              paddingTop: 14,
              borderTop: "1px solid var(--border)",
            }}
          >
            <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setEditingInvoice(null); setFormErr(null); }}>Cancelar</Button>
            <Button size="sm" variant="primary" onClick={() => void saveInvoice()} disabled={saving}>{saving ? "Guardando…" : editingInvoice ? "Guardar cambios" : "Crear borrador"}</Button>
          </div>
        </div>
      )}

      <FilterToolbar
        search={{ value: searchQ, onChange: setSearchQ, placeholder: "Buscar por folio o cliente…" }}
        selects={[
          {
            label: "Tipo",
            value: filter,
            onChange: (v) => setFilter(v as typeof filter),
            options: [{ value: "INCOME", label: "Ingresos" }, { value: "EXPENSE", label: "Egresos" }],
            allowAll: true, allLabel: "Todos los tipos",
          },
          {
            label: "Estado",
            value: filterStatus,
            onChange: setFilterStatus,
            options: [
              { value: "DRAFT", label: "Borrador" },
              { value: "SENT", label: "Enviada" },
              { value: "PARTIALLY_PAID", label: "Pago parcial" },
              { value: "PAID", label: "Pagada" },
              { value: "OVERDUE", label: "Vencida" },
              { value: "CANCELLED", label: "Cancelada" },
            ],
            allowAll: true,
          },
        ]}
        onClear={() => { setSearchQ(""); setFilter(""); setFilterStatus(""); }}
        resultCount={loading ? null : visibleItems.length}
        rightActions={items.length > 0 ? (
          <Button variant="ghost" size="sm" iconLeft="⬇" onClick={() => exportToExcel(visibleItems, [
            { key: "invoiceNumber", label: "Folio" },
            { key: "receptorName", label: "Cliente/Receptor", format: (v) => v ? String(v) : "—" },
            { key: "totalAmount", label: "Total" },
            { key: "status", label: "Estado" },
            { key: "issueDate", label: "Fecha", format: (v) => v ? String(v).slice(0, 10) : "" },
          ], "facturas")}>Excel</Button>
        ) : undefined}
      />

      {actionError && (
        <div style={{ marginBottom: 12 }}>
          <InlineAlert
            variant="danger"
            message={actionError}
            onDismiss={() => setActionError(null)}
          />
        </div>
      )}

      <Section title={loading ? "Cargando…" : `${visibleItems.length} CFDI`}>
        {(highlightId || invoiceRef) && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
            {highlightId && <>Mostrando factura <strong>#{highlightId}</strong></>}
            {highlightId && invoiceRef && " · "}
            {invoiceRef && <>Folio <strong>{invoiceRef}</strong></>}
            {" "}desde enlace directo.
          </p>
        )}
        {loading && <EmptyState icon="⏳" title="Cargando…" description="Consultando facturación." />}
        {!loading && error && <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />}
        {!loading && !error && <DataTable columns={columns} rows={visibleItems} rowKey={(f) => f.id} emptyTitle="Sin facturas" emptyDescription="Las facturas se generan desde un proyecto de ventas cerrado." />}
      </Section>

      <Modal
        open={!!paymentTarget}
        onClose={() => setPaymentTarget(null)}
        title="Registrar pago"
        footer={
          <>
            <Button size="sm" variant="secondary" onClick={() => setPaymentTarget(null)}>Cancelar</Button>
            <Button size="sm" variant="primary" onClick={() => void submitPayment()} disabled={paying}>
              {paying ? "Registrando…" : "Registrar pago"}
            </Button>
          </>
        }
      >
        {paymentTarget && (
          <>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 14 }}>
              {paymentTarget.invoiceNumber} · saldo pendiente{" "}
              <Money value={Math.max(0, Number(paymentTarget.totalAmount) - Number(paymentTarget.paidAmount ?? 0))} />
            </div>
            <FinanceFormGrid>
              <FinanceField label="Monto" hint="Pesos. Puede ser menor al saldo: queda como pago parcial.">
                <input type="number" min={0} step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))} style={inp} />
              </FinanceField>
              <FinanceField label="Fecha de pago" hint="La que aparece en el estado de cuenta, no la de captura.">
                <input type="date" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm((f) => ({ ...f, paymentDate: e.target.value }))} style={inp} />
              </FinanceField>
              <FinanceField label="Método">
                <select value={paymentForm.method} onChange={(e) => setPaymentForm((f) => ({ ...f, method: e.target.value }))} style={inp}>
                  <option value="SPEI">SPEI</option>
                  <option value="TRANSFER">Transferencia</option>
                  <option value="CASH">Efectivo</option>
                  <option value="CHECK">Cheque</option>
                  <option value="CARD">Tarjeta</option>
                </select>
              </FinanceField>
              <FinanceField label="Referencia" optional hint="Clave de rastreo del SPEI o folio del cheque.">
                <input value={paymentForm.reference} onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))} placeholder="Clave de rastreo, folio…" style={inp} />
              </FinanceField>
              <FinanceField label="Notas" optional fullWidth>
                <input value={paymentForm.notes} onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))} style={inp} />
              </FinanceField>
              {paymentTarget.satPaymentMethod === "PPD" && (
                <FinanceField
                  label="Complemento de pago"
                  fullWidth
                  hint="La factura es PPD: el SAT exige un complemento por cada pago."
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)" }}>
                    <input
                      type="checkbox"
                      checked={paymentForm.stampComplement}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, stampComplement: e.target.checked }))}
                    />
                    Timbrar complemento (Pagos 2.0) al registrar
                  </span>
                </FinanceField>
              )}
            </FinanceFormGrid>
            {paymentErr && <div style={{ marginTop: 14 }}><InlineAlert variant="danger" message={paymentErr} /></div>}
          </>
        )}
      </Modal>

      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
