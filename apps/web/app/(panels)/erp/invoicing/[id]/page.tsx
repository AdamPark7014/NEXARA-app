"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import EmptyState from "@/components/ui/EmptyState";
import { Tag, Money } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { toast } from "@/components/Toast";

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

const STATUS_VARIANT: Record<string, "positive" | "warning" | "danger" | "accent" | "neutral"> = {
  PAID: "positive",
  PARTIALLY_PAID: "warning",
  OVERDUE: "danger",
  SENT: "accent",
  DRAFT: "neutral",
  CANCELLED: "neutral",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador", SENT: "Enviada", PARTIALLY_PAID: "Pago parcial",
  PAID: "Pagada", OVERDUE: "Vencida", CANCELLED: "Cancelada",
};

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--foreground)", fontSize: 13, boxSizing: "border-box",
};

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

  const stampInvoice = async () => {
    if (!token || !id) return;
    setStamping(true);
    try {
      await apiFetch(`accounting/invoices/${id}/stamp`, token, { method: "POST" });
      toast.success("Factura timbrada ante el PAC");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al timbrar");
    } finally { setStamping(false); }
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

  const pendingAmount = useMemo(() => {
    if (!invoice) return 0;
    return Math.max(0, invoice.totalAmount - (invoice.paidAmount ?? 0));
  }, [invoice]);

  const paidPct = useMemo(() => {
    if (!invoice || !invoice.totalAmount) return 0;
    return Math.min(100, Math.round(((invoice.paidAmount ?? 0) / invoice.totalAmount) * 100));
  }, [invoice]);

  if (loading) return <EmptyState icon="⏳" title="Cargando factura…" description="Consultando datos de facturación." />;
  if (error) return <EmptyState icon="⚠️" title="No se pudo cargar" description={error} action={<Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button>} />;
  if (!invoice) return null;

  const isIncome = invoice.type === "ACCOUNTS_RECEIVABLE" || invoice.type === "INCOME";
  const counterparty = isIncome ? invoice.receptorName : invoice.emisorName;

  return (
    <>
      <PageHeader
        eyebrow={`ERP · ${isIncome ? "Cuentas por cobrar" : "Cuentas por pagar"}`}
        title={invoice.invoiceNumber}
        subtitle={counterparty ?? "—"}
        meta={<Tag variant={STATUS_VARIANT[invoice.status] ?? "neutral"} dot>{STATUS_LABELS[invoice.status] ?? invoice.status}</Tag>}
        actions={
          <>
            <Link href="/erp/invoicing" style={{ textDecoration: "none" }}>
              <Button variant="ghost">← Facturación</Button>
            </Link>
            {invoice.cfdiUuid && (
              <>
                <Button variant="ghost" onClick={() => void downloadXml()}>⬇ XML</Button>
                {invoice.pdfUrl && (
                  <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                    <Button variant="ghost">📄 PDF</Button>
                  </a>
                )}
              </>
            )}
            {canEdit && invoice.status === "DRAFT" && !invoice.cfdiUuid && (
              <Button variant="primary" onClick={() => void stampInvoice()} disabled={stamping}>
                {stamping ? "Timbrando…" : "🧾 Timbrar CFDI"}
              </Button>
            )}
            {canEdit && invoice.cfdiUuid && !invoice.isCancelled && invoice.cfdiRelationType !== "01" && (
              <Button variant="secondary" onClick={() => void createCreditNote()}>📋 Nota de crédito</Button>
            )}
            {canEdit && invoice.cfdiUuid && !invoice.isCancelled && (
              <Button variant="ghost" onClick={() => setShowCancel(true)}>✕ Cancelar CFDI</Button>
            )}
            {invoice.cfdiUuid && (
              <Button variant="ghost" onClick={() => void checkSatStatus()} disabled={checkingSat}>
                {checkingSat ? "Consultando…" : "🔍 Estatus SAT"}
              </Button>
            )}
            {canEdit && invoice.status !== "PAID" && invoice.status !== "CANCELLED" && (
              <Button variant="secondary" onClick={() => {
                setShowPayment(true);
                setPayErr(null);
                setPayForm((f) => ({
                  ...f,
                  amount: String(pendingAmount),
                  stampComplement: invoice.satPaymentMethod === "PPD",
                }));
              }}>
                💳 Registrar pago
              </Button>
            )}
          </>
        }
      />

      {pacInfo && (
        <div
          style={{
            marginBottom: 18,
            padding: "12px 14px",
            borderRadius: 10,
            border: `1px solid ${pacInfo.productionWarning ? "color-mix(in srgb, var(--danger) 35%, var(--border))" : "var(--border)"}`,
            background: pacInfo.productionWarning ? "color-mix(in srgb, var(--danger) 8%, var(--surface))" : "var(--surface-2)",
            fontSize: 13,
            color: "var(--text-secondary)",
          }}
        >
          <strong style={{ color: "var(--foreground)" }}>PAC / timbrado:</strong>{" "}
          {pacInfo.provider?.toUpperCase() ?? "—"}
          {pacInfo.configured ? " · credenciales OK" : " · sin credenciales"}
          {invoice.satPaymentMethod === "PPD" && " · PPD (complementos de pago requeridos)"}
          {pacInfo.productionWarning && (
            <div style={{ marginTop: 6, color: "var(--danger)" }}>{pacInfo.productionWarning}</div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 14 }}>
        <KpiCard label="Total" value={<Money value={invoice.totalAmount} />} icon="💰" variant="accent" />
        <KpiCard label="Pagado" value={<Money value={invoice.paidAmount ?? 0} />} icon="✅" variant={paidPct === 100 ? "positive" : "default"} hint={`${paidPct}% cubierto`} />
        <KpiCard label="Pendiente" value={<Money value={pendingAmount} />} icon="⏳" variant={pendingAmount > 0 ? "warning" : "positive"} />
        <KpiCard label="Estado" value={STATUS_LABELS[invoice.status] ?? invoice.status} variant={STATUS_VARIANT[invoice.status] ?? "default"} icon="📋" />
      </div>
      {/* Invoice lifecycle stepper */}
      {(() => {
        const isCancelled = invoice.status === "CANCELLED";
        const isOverdue = invoice.status === "OVERDUE";
        const MAIN = [
          { key: "DRAFT", label: "Borrador", icon: "📝" },
          { key: "SENT", label: "Enviada", icon: "📤" },
          { key: "PARTIALLY_PAID", label: "Pago parcial", icon: "💳" },
          { key: "PAID", label: "Pagada", icon: "✅" },
        ];
        const CANCELLED_FLOW = [
          { key: "DRAFT", label: "Borrador", icon: "📝" },
          { key: "CANCELLED", label: "Cancelada", icon: "✕" },
        ];
        const OVERDUE_FLOW = [
          { key: "DRAFT", label: "Borrador", icon: "📝" },
          { key: "SENT", label: "Enviada", icon: "📤" },
          { key: "OVERDUE", label: "Vencida", icon: "⚠️" },
        ];
        const flow = isCancelled ? CANCELLED_FLOW : isOverdue ? OVERDUE_FLOW : MAIN;
        const activeIdx = flow.findIndex((s) => s.key === invoice.status);
        return (
          <div style={{ marginBottom: 14, padding: "12px 16px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Ciclo de cobro</div>
            <div style={{ display: "flex", alignItems: "center" }}>
              {flow.map((step, idx) => {
                const done = idx < activeIdx;
                const active = idx === activeIdx;
                const isBad = (step.key === "CANCELLED" || step.key === "OVERDUE") && active;
                const color = isBad ? "var(--danger)" : done || active ? "var(--success)" : "var(--text-tertiary)";
                const bg = isBad ? "color-mix(in srgb, var(--danger) 15%, var(--surface-2))" : (done || active) ? "color-mix(in srgb, var(--success) 15%, var(--surface-2))" : "var(--surface)";
                return (
                  <div key={step.key} style={{ display: "flex", alignItems: "center", flex: idx < flow.length - 1 ? 1 : undefined }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 60 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: bg, border: `2px solid ${active ? color : done ? "color-mix(in srgb, var(--success) 40%, var(--border))" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: done ? 12 : 14, fontWeight: 700, color }}>
                        {done ? "✓" : step.icon}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? color : done ? "var(--text-secondary)" : "var(--text-tertiary)", textAlign: "center", whiteSpace: "nowrap" }}>{step.label}</span>
                    </div>
                    {idx < flow.length - 1 && <div style={{ flex: 1, height: 2, background: done ? "color-mix(in srgb, var(--success) 35%, var(--border))" : "var(--border)", margin: "0 4px", marginBottom: 18 }} />}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {invoice.totalAmount > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            Progreso de pago · {paidPct}%
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "var(--surface-2)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${paidPct}%`, background: paidPct === 100 ? "var(--success)" : paidPct >= 50 ? "var(--primary)" : "var(--warning)", borderRadius: 4, transition: "width .4s" }} />
          </div>
        </div>
      )}

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
              <code style={{ fontSize: 11.5, color: "var(--text-secondary)", letterSpacing: "0.02em" }}>{invoice.cfdiUuid}</code>
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
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{new Date(p.paymentDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: "var(--success)" }}>+<Money value={p.amount} /></span>
                {canEdit && invoice.satPaymentMethod === "PPD" && invoice.cfdiUuid && !p.cfdiPaymentUuid && (
                  <Button size="sm" variant="ghost" onClick={() => void stampComplement(p.id)}>Timbrar comp.</Button>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {showCancel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowCancel(false)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px 28px", width: 420, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Cancelar CFDI ante el SAT</div>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Motivo SAT</span>
              <select value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} style={inp}>
                <option value="01">01 — Comprobante emitido con errores (con relación)</option>
                <option value="02">02 — Comprobante emitido con errores (sin relación)</option>
                <option value="03">03 — No se llevó a cabo la operación</option>
                <option value="04">04 — Operación nominativa en factura global</option>
              </select>
            </label>
            {cancelReason === "01" && (
              <label style={{ display: "grid", gap: 4, marginTop: 12 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>UUID sustituto *</span>
                <input value={substitutionUuid} onChange={(e) => setSubstitutionUuid(e.target.value)} placeholder="UUID del CFDI que sustituye" style={inp} />
              </label>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setShowCancel(false)}>Cerrar</Button>
              <Button variant="primary" onClick={() => void cancelInvoice()} disabled={cancelling}>
                {cancelling ? "Cancelando…" : "Confirmar cancelación"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showPayment && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowPayment(false)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px 28px", width: 420, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.24)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Registrar pago</div>
            <div style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Monto (MXN) *</span>
                <input type="number" min="0.01" step="0.01" value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))} style={inp} autoFocus />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Fecha de pago</span>
                <input type="date" value={payForm.paymentDate} onChange={(e) => setPayForm((f) => ({ ...f, paymentDate: e.target.value }))} style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Método</span>
                <select value={payForm.method} onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))} style={inp}>
                  <option value="SPEI">SPEI / Transferencia</option>
                  <option value="CASH">Efectivo</option>
                  <option value="CHECK">Cheque</option>
                  <option value="CARD">Tarjeta</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Referencia</span>
                <input value={payForm.reference} onChange={(e) => setPayForm((f) => ({ ...f, reference: e.target.value }))} placeholder="Número de transferencia" style={inp} />
              </label>
              {invoice.satPaymentMethod === "PPD" && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)" }}>
                  <input
                    type="checkbox"
                    checked={payForm.stampComplement}
                    onChange={(e) => setPayForm((f) => ({ ...f, stampComplement: e.target.checked }))}
                  />
                  Timbrar complemento de pago al registrar
                </label>
              )}
              {payErr && <p style={{ color: "var(--danger)", fontSize: 12, margin: 0 }}>{payErr}</p>}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <Button variant="secondary" onClick={() => setShowPayment(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submitPayment()} disabled={paying}>
                {paying ? "Registrando…" : "Registrar pago"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
