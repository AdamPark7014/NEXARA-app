"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
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
  const id = params.id;
  const { user } = useUser();
  const token = user?.token ?? "";
  const canEdit = user?.isSuperAdmin || ["ceo", "super_admin", "dir_admin", "contabilidad", "administrativo"].includes(user?.roleKey ?? "");

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", paymentDate: new Date().toISOString().slice(0, 10), method: "SPEI", reference: "", notes: "" });
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);

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

  const submitPayment = async () => {
    if (!token || !id) return;
    const amt = parseFloat(payForm.amount);
    if (!amt || amt <= 0) { setPayErr("Ingresa un monto válido."); return; }
    setPaying(true);
    setPayErr(null);
    try {
      await apiFetch(`accounting/invoices/${id}/payments`, token, {
        method: "POST",
        body: JSON.stringify({ amount: amt, paymentDate: payForm.paymentDate, method: payForm.method, reference: payForm.reference || undefined, notes: payForm.notes || undefined }),
      });
      setShowPayment(false);
      toast.success("Pago registrado");
      void load();
    } catch (e) {
      setPayErr(e instanceof Error ? e.message : "Error al registrar pago");
    } finally { setPaying(false); }
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
            {canEdit && invoice.status !== "PAID" && invoice.status !== "CANCELLED" && (
              <Button variant="primary" onClick={() => { setShowPayment(true); setPayErr(null); setPayForm((f) => ({ ...f, amount: String(pendingAmount) })); }}>
                💳 Registrar pago
              </Button>
            )}
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Total" value={<Money value={invoice.totalAmount} />} icon="💰" />
        <KpiCard label="Pagado" value={<Money value={invoice.paidAmount ?? 0} />} icon="✅" variant={paidPct === 100 ? "positive" : "default"} />
        <KpiCard label="Pendiente" value={<Money value={pendingAmount} />} icon="⏳" variant={pendingAmount > 0 ? "warning" : "positive"} />
      </div>

      {/* Payment progress bar */}
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
              <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center", padding: "10px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.method ?? "Transferencia"}{p.reference ? ` · Ref: ${p.reference}` : ""}</div>
                  {p.notes && <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{p.notes}</div>}
                </div>
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{new Date(p.paymentDate).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: "var(--success)" }}>+<Money value={p.amount} /></span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Payment modal */}
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
                  {["SPEI", "Efectivo", "Cheque", "Tarjeta", "Otro"].map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Referencia</span>
                <input value={payForm.reference} onChange={(e) => setPayForm((f) => ({ ...f, reference: e.target.value }))} placeholder="Número de transferencia" style={inp} />
              </label>
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
