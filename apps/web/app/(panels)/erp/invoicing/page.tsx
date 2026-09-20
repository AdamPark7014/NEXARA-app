"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import MetricStrip, { type Metric } from "@/components/ui/MetricStrip";
import StatusDot from "@/components/ui/StatusDot";
import Button from "@/components/ui/Button";
import DataTable, { Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
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
import {
  AlertIcon,
  BlockHeading,
  CfdiIcon,
  COMMERCIAL_LABEL,
  CopyableRef,
  Dot,
  DownloadIcon,
  FilterIcon,
  fiscalState,
  FootNote,
  InlineAction,
  LoadingIcon,
  MetricFrame,
  MetricHint,
  MetricValue,
  NoticeStack,
  PlusIcon,
  RefreshIcon,
  toolbarControl,
  WorkToolbar,
  type Notice,
} from "./_parts";

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
  const [paymentForm, setPaymentForm] = useState({ amount: "", paymentDate: new Date().toISOString().slice(0, 10), method: "SPEI", reference: "", notes: "", bankAccountId: "", stampComplement: true });
  const [paymentErr, setPaymentErr] = useState<string | null>(null);
  /**
   * Sin la cuenta de destino el pago queda colgando: el movimiento del banco
   * nunca encuentra con qué cruzarse y la conciliación lo deja pendiente para
   * siempre. Quien solo tiene permiso de facturar no ve bancos: en ese caso la
   * lista llega vacía y el campo no se pinta, en vez de reventar la pantalla.
   */
  const [bankAccounts, setBankAccounts] = useState<Array<{ id: number; name: string; bankName: string; currency: string }>>([]);
  /**
   * La contraparte de la factura. Cuentas por pagar y el expediente del
   * proveedor se agrupan por `Invoice.supplierId`, y cuentas por cobrar por
   * `clientId`: una factura capturada sin ligar no aparece en ninguno de los
   * dos, aunque el receptor esté bien escrito. Las listas se cargan aparte
   * porque viven en otros módulos; si el rol no los ve, llegan vacías y el
   * campo no estorba.
   */
  const [suppliers, setSuppliers] = useState<Array<{ id: number; name: string; rfc?: string | null }>>([]);
  const [salesClients, setSalesClients] = useState<Array<{ id: number; name: string; taxId?: string | null }>>([]);
  /** Errores de timbrar/cancelar que mueren con el ConfirmDialog si solo hay toast. */
  const [actionError, setActionError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const payingRef = useRef(false);
  const [pacInfo, setPacInfo] = useState<{ provider?: string; configured?: boolean; productionWarning?: string | null; env?: string; csd?: { configured?: boolean } } | null>(null);
  const [issuerProfile, setIssuerProfile] = useState<{ emisorRfc?: string | null; emisorName?: string | null; emisorZipCode?: string | null; source?: string } | null>(null);
  const [rfcValidation, setRfcValidation] = useState<{ valid?: boolean; message?: string } | null>(null);
  const [form, setForm] = useState({
    type: "INCOME" as "INCOME" | "EXPENSE",
    counterpartyId: "",
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
    if (!token) {
      setLoading(false);
      setError("Esperando sesión. Vuelve a entrar si esto no se resuelve.");
      return;
    }
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

  useEffect(() => {
    if (!token) return;
    void apiFetch("accounting/banking/accounts", token)
      .then((data) => setBankAccounts(Array.isArray(data) ? data : []))
      .catch(() => setBankAccounts([]));
  }, [token]);

  useEffect(() => {
    if (!showForm || !token) return;
    void apiFetch("procurement/purchase-orders/suppliers", token)
      .then((data) => setSuppliers(Array.isArray(data) ? data : (data?.data ?? [])))
      .catch(() => setSuppliers([]));
    void apiFetch("ventas/clientes?limit=200", token)
      .then((data) => setSalesClients(Array.isArray(data) ? data : (data?.data ?? [])))
      .catch(() => setSalesClients([]));
  }, [showForm, token]);

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
      bankAccountId: bankAccounts.length === 1 ? String(bankAccounts[0].id) : "",
      stampComplement: inv.satPaymentMethod === "PPD",
    });
    setPaymentErr(null);
  };

  const submitPayment = async () => {
    if (!token || !paymentTarget) return;
    if (payingRef.current) return;
    const amount = Number(paymentForm.amount);
    if (!amount || amount <= 0) { setPaymentErr("Indica un monto válido."); return; }
    payingRef.current = true;
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
          bankAccountId: paymentForm.bankAccountId ? Number(paymentForm.bankAccountId) : undefined,
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
      payingRef.current = false;
      setPaying(false);
    }
  };

  const openNew = () => {
    setEditingInvoice(null);
    setFormErr(null);
    setForm({
      type: "INCOME",
      counterpartyId: "",
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
        counterpartyId: "",
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

  const closeForm = () => {
    setShowForm(false);
    setEditingInvoice(null);
    setFormErr(null);
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
            // Ligar la factura es lo que la hace aparecer en cuentas por cobrar
            // o por pagar del expediente correcto. Sin esto quedaba suelta.
            ...(form.counterpartyId
              ? form.type === "INCOME"
                ? { clientId: Number(form.counterpartyId) }
                : { supplierId: Number(form.counterpartyId) }
              : {}),
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
    // Una sola acción con borde por fila —la que toca ahora— y el resto en
    // texto. Con cuatro botones sólidos por renglón la tabla era una botonera
    // y no se veía dónde estaba el siguiente paso.
    ...(cfg.canApprove ? [{
      key: "acciones" as keyof InvoiceRow, label: "",
      render: (f: InvoiceRow) => (
        <div style={{ display: "flex", gap: 2, justifyContent: "flex-end", alignItems: "center" }}>
          {f.status === "DRAFT" && cfg.canCreate && (
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); void openEditDraft(f); }}>Editar</Button>
          )}
          {cfg.canDelete && f.status !== "CANCELLED" && <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); void cancel(f); }}>Cancelar</Button>}
          {f.status === "DRAFT" && <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); void stamp(f); }}>Timbrar</Button>}
          {cfg.canCreate && f.status !== "DRAFT" && f.status !== "CANCELLED" && f.status !== "PAID" && (
            <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openPayment(f); }}>Pago</Button>
          )}
        </div>
      ),
      width: 210,
    }] : []),
  ];

  /* ---------------------------------------------------------------- *
   * Estado financiero: tres montos y el único conteo que pide acción.
   *
   * Eran seis celdas del mismo peso —tres montos y tres conteos—, y la vista
   * no decía cuál mirar primero. «Vencidas» pasa a ser la pista de «Por
   * cobrar», que es donde duele, y conserva su clic; «Canceladas» baja a
   * metadato de pie, que es su rango.
   * ---------------------------------------------------------------- */
  const incomeInvoices = items.filter((f) => displayInvoiceType(f.type) === "INCOME" && f.status !== "CANCELLED");
  const cobrado = incomeInvoices.filter((f) => f.status === "PAID").reduce((s, f) => s + Number(f.totalAmount), 0);
  const pendiente = incomeInvoices.filter((f) => f.status !== "PAID").reduce((s, f) => s + Number(f.totalAmount), 0);
  const cobranzaPct = facturadoMes > 0 ? Math.round((cobrado / facturadoMes) * 100) : 0;

  const metrics: Metric[] = [
    {
      label: "Facturado",
      value: <MetricValue><Money value={facturadoMes} compact bold={false} /></MetricValue>,
      hint: <MetricHint>{incomeInvoices.length} CFDI de ingreso</MetricHint>,
    },
    {
      label: "Cobrado",
      value: <MetricValue><Money value={cobrado} compact bold={false} /></MetricValue>,
      hint: <MetricHint tone={cobranzaPct === 100 && facturadoMes > 0 ? "success" : "default"}>{cobranzaPct}% del facturado</MetricHint>,
    },
    {
      label: "Por cobrar",
      value: <MetricValue><Money value={pendiente} compact bold={false} /></MetricValue>,
      hint: (
        <MetricHint tone={vencidas > 0 ? "danger" : "default"}>
          {vencidas > 0 ? `${vencidas} vencida${vencidas === 1 ? "" : "s"}` : "sin vencidas"}
        </MetricHint>
      ),
      tone: vencidas > 0 ? "danger" : pendiente > 0 ? "warning" : "default",
      onClick: vencidas > 0 ? () => setFilterStatus(filterStatus === "OVERDUE" ? "" : "OVERDUE") : undefined,
    },
    {
      label: "Por timbrar",
      value: <MetricValue>{porTimbrar}</MetricValue>,
      hint: <MetricHint tone={porTimbrar > 0 ? "warning" : "default"}>borradores sin UUID</MetricHint>,
      tone: porTimbrar > 0 ? "warning" : "default",
      onClick: () => setFilterStatus(filterStatus === "DRAFT" ? "" : porTimbrar > 0 ? "DRAFT" : ""),
    },
  ];

  /* ---------------------------------------------------------------- *
   * Avisos: un bloque, un renglón cada uno, ordenados por gravedad.
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
  if (pacInfo && pacInfo.configured === false) {
    notices.push({
      id: "pac-creds",
      level: "critical",
      text: "No se puede timbrar ninguna factura: falta conectar el servicio de timbrado.",
      action: { label: "Configuración", href: "/erp/settings" },
    });
  }
  if (pacInfo?.csd?.configured === false && pacInfo.provider !== "facturama") {
    notices.push({
      id: "csd",
      level: "warning",
      text: "Falta el certificado de sello digital. Sin él las facturas no se pueden sellar.",
      action: { label: "Configuración", href: "/erp/settings" },
    });
  }

  const hasFilters = Boolean(searchQ.trim() || filter || filterStatus || invoiceRef);
  const clearFilters = () => { setSearchQ(""); setFilter(""); setFilterStatus(""); };

  const exportRows = () => exportToExcel(visibleItems, [
    { key: "invoiceNumber", label: "Folio" },
    { key: "receptorName", label: "Cliente/Receptor", format: (v) => v ? String(v) : "—" },
    { key: "totalAmount", label: "Total" },
    { key: "status", label: "Estado" },
    { key: "issueDate", label: "Fecha", format: (v) => v ? String(v).slice(0, 10) : "" },
  ], "facturas");

  return (
    <>
      {/* 1 · Dónde estoy. 2 · La acción principal, el único botón sólido de marca. */}
      <PageHeader
        eyebrow="ERP · Finanzas"
        title={cfg.title}
        density="ops"
        actions={
          cfg.canCreate ? (
            <Button size="sm" variant="primary" iconLeft={<PlusIcon />} onClick={openNew}>
              Nueva factura
            </Button>
          ) : undefined
        }
      />
      <FinanceModuleRail />

      {/* 3 · Cómo va el dinero. */}
      <MetricFrame>
        <MetricStrip metrics={metrics} ariaLabel="Resumen de facturación" />
      </MetricFrame>

      <NoticeStack notices={notices} />

      {/* 4 · Las facturas. El título se dice con tipografía, no con tarjeta. */}
      <BlockHeading
        title="Facturas"
        meta={loading ? "cargando…" : `${visibleItems.length}${hasFilters && visibleItems.length !== items.length ? ` de ${items.length}` : ""}`}
        actions={
          <>
            <Button
              size="sm"
              variant="ghost"
              iconLeft={<RefreshIcon />}
              onClick={() => void load()}
              title="Actualizar"
              aria-label="Actualizar la lista"
            />
            {items.length > 0 && (
              <Button size="sm" variant="ghost" iconLeft={<DownloadIcon />} onClick={exportRows}>
                Excel
              </Button>
            )}
          </>
        }
      />

      {/* 5 · Los filtros: herramienta de trabajo, no formulario. */}
      <WorkToolbar
        note={
          hasFilters || highlightId ? (
            <>
              {invoiceRef && <span>folio <strong style={{ fontWeight: 600 }}>{invoiceRef}</strong> desde enlace directo</span>}
              {invoiceRef && highlightId && <Dot />}
              {highlightId && <span>factura <strong style={{ fontWeight: 600 }}>#{highlightId}</strong> al inicio</span>}
              {(invoiceRef || highlightId) && hasFilters && <Dot />}
              {hasFilters && <InlineAction onClick={clearFilters}>Limpiar filtros</InlineAction>}
            </>
          ) : undefined
        }
      >
        <input
          type="search"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder="Buscar folio o cliente…"
          aria-label="Buscar por folio o cliente"
          style={{ ...toolbarControl, flex: "1 1 240px", minWidth: 190 }}
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          aria-label="Filtrar por tipo"
          style={{ ...toolbarControl, minWidth: 140 }}
        >
          <option value="">Todos los tipos</option>
          <option value="INCOME">Ingresos</option>
          <option value="EXPENSE">Egresos</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          aria-label="Filtrar por estado"
          style={{ ...toolbarControl, minWidth: 150 }}
        >
          <option value="">Todos los estados</option>
          <option value="DRAFT">Borrador</option>
          <option value="SENT">Enviada</option>
          <option value="PARTIALLY_PAID">Pago parcial</option>
          <option value="PAID">Pagada</option>
          <option value="OVERDUE">Vencida</option>
          <option value="CANCELLED">Cancelada</option>
        </select>
      </WorkToolbar>

      {loading && (
        <EmptyState icon={<LoadingIcon />} title="Cargando facturas…" description="Consultando el libro de CFDI." />
      )}
      {!loading && error && (
        <EmptyState
          icon={<AlertIcon />}
          title="No se pudo cargar la facturación"
          description={error}
          action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>}
        />
      )}
      {!loading && !error && visibleItems.length === 0 && hasFilters && (
        <EmptyState
          icon={<FilterIcon />}
          title="Ningún CFDI con estos filtros"
          description="Hay facturas en el libro, pero ninguna coincide con la búsqueda actual."
          action={<Button size="sm" variant="secondary" onClick={clearFilters}>Limpiar filtros</Button>}
        />
      )}
      {!loading && !error && visibleItems.length === 0 && !hasFilters && (
        <EmptyState
          icon={<CfdiIcon />}
          title="Todavía no hay facturas"
          description={
            cfg.canCreate
              ? "Crea el borrador y tímbralo ante el PAC cuando el cliente esté confirmado."
              : "Las facturas se generan desde un proyecto de ventas cerrado."
          }
          action={
            cfg.canCreate ? (
              <Button size="sm" variant="primary" iconLeft={<PlusIcon />} onClick={openNew}>
                Nueva factura
              </Button>
            ) : undefined
          }
        />
      )}
      {!loading && !error && visibleItems.length > 0 && (
        <DataTable
          columns={columns}
          rows={visibleItems}
          rowKey={(f) => f.id}
          ariaLabel="Facturas CFDI"
        />
      )}

      {/* 6 y 7 · Configuración y metadatos, al final y en gris. */}
      {(pacInfo || canceladas > 0) && (
        <FootNote>
          {pacInfo && (
            <>
              <span>PAC {pacInfo.provider?.toUpperCase() ?? "—"}</span>
              <Dot />
              <span>{pacInfo.configured ? "credenciales OK" : "sin credenciales"}</span>
              {pacInfo.env ? (<><Dot /><span>{pacInfo.env}</span></>) : null}
            </>
          )}
          {pacInfo && canceladas > 0 && <Dot />}
          {canceladas > 0 && (
            <span>
              <InlineAction onClick={() => setFilterStatus(filterStatus === "CANCELLED" ? "" : "CANCELLED")}>
                {canceladas} cancelada{canceladas === 1 ? "" : "s"}
              </InlineAction>
              {canceladas === 1 ? " no cuenta al facturado" : " no cuentan al facturado"}
            </span>
          )}
        </FootNote>
      )}

      {/* El alta ya no empuja la lista hacia abajo: vive en su propia capa. */}
      <Modal
        open={showForm}
        onClose={closeForm}
        maxWidth={780}
        title={editingInvoice ? `Editar borrador ${editingInvoice.invoiceNumber}` : "Nueva factura"}
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={closeForm}>Cancelar</Button>
            <Button size="sm" variant="primary" onClick={() => void saveInvoice()} disabled={saving}>{saving ? "Guardando…" : editingInvoice ? "Guardar cambios" : "Crear borrador"}</Button>
          </>
        }
      >
        {issuerProfile && (
          <div style={{ marginBottom: 14, fontSize: 11.5, color: "var(--text-tertiary)" }}>
            Emite {issuerProfile.emisorName ?? "—"} · RFC {issuerProfile.emisorRfc ?? "—"} · CP{" "}
            {issuerProfile.emisorZipCode ?? "sin capturar"}
          </div>
        )}
        {issuerProfile && !issuerProfile.emisorZipCode && (
          <NoticeStack
            notices={[{
              id: "emisor-cp",
              level: "warning",
              text: "Falta el CP fiscal del emisor: sin él no se puede timbrar.",
              action: { label: "Empresas", href: "/erp/companies" },
            }]}
          />
        )}
        <FinanceFormGrid>
          <FinanceField label="Tipo" hint="Ingreso emite CFDI a un cliente; egreso registra el de un proveedor.">
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as "INCOME" | "EXPENSE", counterpartyId: "" }))}
              style={inp}
            >
              <option value="INCOME">Ingreso (cliente)</option>
              <option value="EXPENSE">Egreso (proveedor)</option>
            </select>
          </FinanceField>
          {!editingInvoice && (form.type === "INCOME" ? salesClients.length > 0 : suppliers.length > 0) && (
            <FinanceField
              label={form.type === "INCOME" ? "Cliente" : "Proveedor"}
              optional
              hint="Ligarla es lo que la hace aparecer en su expediente y en cuentas por cobrar o por pagar."
            >
              <select
                value={form.counterpartyId}
                onChange={(e) => {
                  const id = e.target.value;
                  const cliente = form.type === "INCOME"
                    ? salesClients.find((c) => String(c.id) === id)
                    : undefined;
                  const proveedor = form.type === "EXPENSE"
                    ? suppliers.find((s) => String(s.id) === id)
                    : undefined;
                  const nombre = cliente?.name ?? proveedor?.name ?? null;
                  const rfc = cliente?.taxId ?? proveedor?.rfc ?? null;
                  setForm((f) => ({
                    ...f,
                    counterpartyId: id,
                    // Se rellena el receptor con lo que ya está capturado en su
                    // ficha, en vez de pedir que lo vuelvan a teclear igual.
                    receptorName: nombre ?? f.receptorName,
                    receptorRfc: rfc ?? f.receptorRfc,
                  }));
                }}
                style={inp}
              >
                <option value="">Sin ligar</option>
                {(form.type === "INCOME" ? salesClients : suppliers).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </FinanceField>
          )}
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
      </Modal>

      <Modal
        open={!!paymentTarget}
        onClose={() => setPaymentTarget(null)}
        title="Registrar pago"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setPaymentTarget(null)}>Cancelar</Button>
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
              {bankAccounts.length > 0 && (
                <FinanceField
                  label="Cuenta de destino"
                  optional
                  hint="En qué cuenta entró o salió el dinero. Es lo que permite cruzarlo después con el estado de cuenta."
                >
                  <select value={paymentForm.bankAccountId} onChange={(e) => setPaymentForm((f) => ({ ...f, bankAccountId: e.target.value }))} style={inp}>
                    <option value="">Sin especificar</option>
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>{b.name} · {b.bankName} ({b.currency})</option>
                    ))}
                  </select>
                </FinanceField>
              )}
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
