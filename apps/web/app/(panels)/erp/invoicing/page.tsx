"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import KpiCard from "@/components/ui/KpiCard";
import Button from "@/components/ui/Button";
import DataTable, { Tag, Money, type Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { getErpFinanceSectionConfig } from "@/lib/section-views";
import { buildApiUrl } from "@/lib/api-base";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";

interface InvoiceRow {
  id: number;
  invoiceNumber: string;
  type: "INCOME" | "EXPENSE" | string;
  status: "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED" | string;
  issueDate: string;
  totalAmount: number | string;
  paidAmount?: number | string;
  cfdiUuid?: string | null;
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
  const [paymentForm, setPaymentForm] = useState({ amount: "", paymentDate: new Date().toISOString().slice(0, 10), method: "SPEI", reference: "", notes: "" });
  const [paymentErr, setPaymentErr] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [form, setForm] = useState({
    type: "INCOME" as "INCOME" | "EXPENSE",
    receptorName: "",
    receptorRfc: "",
    receptorZipCode: "",
    receptorRegime: "601",
    cfdiUsage: "G03",
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    description: "",
    quantity: 1,
    unitPrice: 0,
    satProductKey: "80101500",
    satUnitKey: "E48",
  });

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--foreground)", fontSize: 13, boxSizing: "border-box" };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const apiType = apiTypeParam(filter);
      const qs = apiType ? `?type=${apiType}` : "";
      const data = await apiFetch(`accounting/invoices${qs}`, token);
      setItems(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar facturación");
    } finally { setLoading(false); }
  }, [token, filter]);

  useEffect(() => { void load(); }, [load]);

  const visibleItems = useMemo(() => {
    let rows = items;
    if (highlightId) {
      const id = Number(highlightId);
      if (!Number.isNaN(id)) rows = [...rows].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0));
    }
    if (invoiceRef) {
      const ref = invoiceRef.toLowerCase();
      rows = rows.filter((f) => f.invoiceNumber.toLowerCase().includes(ref));
    }
    return rows;
  }, [items, highlightId, invoiceRef]);

  useEffect(() => {
    if (!showForm || !token) return;
    apiFetch("accounting/invoices/issuer-profile", token).catch(() => null);
  }, [showForm, token]);

  const facturadoMes = items.filter((f) => displayInvoiceType(f.type) === "INCOME" && f.status !== "CANCELLED").reduce((s, f) => s + Number(f.totalAmount), 0);
  const porTimbrar = items.filter((f) => f.status === "DRAFT").length;
  const canceladas = items.filter((f) => f.status === "CANCELLED").length;
  const vencidas = items.filter((f) => f.status === "OVERDUE").length;

  const stamp = async (inv: InvoiceRow) => {
    if (!token) return;
    try {
      await apiFetch(`accounting/invoices/${inv.id}/stamp`, token, { method: "POST" });
      void load();
    } catch (e) { alert(`Error al timbrar: ${e instanceof Error ? e.message : "desconocido"}`); }
  };

  const cancel = async (inv: InvoiceRow) => {
    if (!token) return;
    setConfirmState({ message: `¿Cancelar el CFDI ${inv.invoiceNumber}?`, confirmLabel: "Cancelar CFDI", fn: async () => {
    try {
      await apiFetch(`accounting/invoices/${inv.id}/cancel`, token, { method: "PATCH", body: JSON.stringify({ cancelReason: "02" }) });
      void load();
    } catch (e) { alert(`Error al cancelar: ${e instanceof Error ? e.message : "desconocido"}`); }
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
      await apiFetch(`accounting/invoices/${paymentTarget.id}/payments`, token, {
        method: "POST",
        body: JSON.stringify({
          amount,
          paymentDate: paymentForm.paymentDate,
          method: paymentForm.method,
          reference: paymentForm.reference.trim() || undefined,
          notes: paymentForm.notes.trim() || undefined,
        }),
      });
      setPaymentTarget(null);
      void load();
    } catch (e) {
      setPaymentErr(e instanceof Error ? e.message : "Error al registrar pago");
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
      window.alert("Solo se pueden editar facturas en borrador.");
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
        items?: Array<{ description?: string; quantity?: number | string; unitPrice?: number | string; satProductKey?: string; satUnitKey?: string }>;
      };
      const item = full.items?.[0];
      setForm({
        type: full.type === "ACCOUNTS_PAYABLE" ? "EXPENSE" : "INCOME",
        receptorName: full.receptorName ?? "",
        receptorRfc: full.receptorRfc ?? "",
        receptorZipCode: full.receptorZipCode ?? "",
        receptorRegime: full.receptorRegime ?? "601",
        cfdiUsage: full.cfdiUsage ?? "G03",
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
    if (!token || !form.receptorName.trim() || !form.description.trim() || form.unitPrice <= 0 || !form.receptorZipCode.trim()) return;
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
            satPaymentForm: "03",
            satPaymentMethod: "PUE",
            ...body,
          }),
        });
      }
      setShowForm(false);
      setEditingInvoice(null);
      void load();
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const statusVariant = (s: string): "positive" | "warning" | "danger" | "default" => {
    if (s === "PAID") return "positive";
    if (s === "CANCELLED" || s === "OVERDUE") return "danger";
    if (s === "DRAFT" || s === "SENT" || s === "PARTIALLY_PAID") return "warning";
    return "default";
  };

  const columns: Column<InvoiceRow>[] = [
    { key: "invoiceNumber", label: "Folio", render: (f) => <Tag variant="accent">{f.invoiceNumber}</Tag>, width: 130 },
    { key: "cfdiUuid", label: "UUID", render: (f) => <code style={{ fontSize: 11 }}>{f.cfdiUuid ? `${f.cfdiUuid.slice(0, 8)}…` : "—"}</code>, width: 110 },
    { key: "receptorName", label: "Cliente / Proveedor", accessor: (f) => f.receptorName ?? f.emisorName ?? "—" },
    { key: "type", label: "Tipo", render: (f) => {
      const t = displayInvoiceType(f.type);
      return <Tag variant={t === "INCOME" ? "positive" : "danger"}>{t === "INCOME" ? "Ingreso" : "Egreso"}</Tag>;
    }, width: 100 },
    { key: "totalAmount", label: "Monto", align: "right" as const, render: (f) => <Money value={Number(f.totalAmount)} />, width: 130 },
    { key: "issueDate", label: "Fecha", render: (f) => <span style={{ fontSize: 12 }}>{new Date(f.issueDate).toLocaleDateString("es-MX")}</span>, width: 100 },
    { key: "status", label: "Estado", render: (f) => <Tag variant={statusVariant(f.status)}>{f.status.replace(/_/g, " ")}</Tag>, width: 130 },
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
          {cfg.canDelete && f.status !== "CANCELLED" && <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); void cancel(f); }}>Cancelar</Button>}
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
        actions={
          <>
            {cfg.canCreate && (
              <Button variant="primary" iconLeft="+" onClick={openNew}>Nueva factura</Button>
            )}
            <Button variant="ghost" iconLeft="🔄" onClick={() => void load()}>Actualizar</Button>
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--foreground)", fontSize: 13 }}>
              <option value="">Todos los tipos</option>
              <option value="INCOME">Ingresos</option>
              <option value="EXPENSE">Egresos</option>
            </select>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 18 }}>
        <KpiCard label="Facturado (ingresos)" value={<Money value={facturadoMes} />} hint={`${items.filter((f) => displayInvoiceType(f.type) === "INCOME").length} CFDI`} variant="positive" icon="🧾" />
        <KpiCard label="Por timbrar" value={porTimbrar} hint="En borrador" variant={porTimbrar > 0 ? "warning" : "positive"} icon="⏳" />
        <KpiCard label="Canceladas" value={canceladas} variant={canceladas > 0 ? "danger" : "default"} icon="✗" />
        <KpiCard label="Vencidas" value={vencidas} variant={vencidas > 0 ? "danger" : "positive"} icon="🛡️" />
      </div>

      {showForm && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 18 }}>
          <p style={{ margin: "0 0 12px", fontWeight: 700, fontSize: 13 }}>{editingInvoice ? `Editar borrador ${editingInvoice.invoiceNumber}` : "Nueva factura (borrador CFDI)"}</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Tipo</span>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as "INCOME" | "EXPENSE" }))} style={inp}>
                <option value="INCOME">Ingreso (cliente)</option>
                <option value="EXPENSE">Egreso (proveedor)</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>RFC receptor</span>
              <input value={form.receptorRfc} onChange={(e) => setForm((f) => ({ ...f, receptorRfc: e.target.value }))} placeholder="XAXX010101000" style={inp} />
            </label>
            <label style={{ gridColumn: "1 / -1", display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Nombre cliente / proveedor *</span>
              <input value={form.receptorName} onChange={(e) => setForm((f) => ({ ...f, receptorName: e.target.value }))} style={inp} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>CP fiscal receptor *</span>
              <input value={form.receptorZipCode} onChange={(e) => setForm((f) => ({ ...f, receptorZipCode: e.target.value }))} placeholder="64000" style={inp} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Régimen receptor</span>
              <input value={form.receptorRegime} onChange={(e) => setForm((f) => ({ ...f, receptorRegime: e.target.value }))} placeholder="601" style={inp} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Uso CFDI</span>
              <select value={form.cfdiUsage} onChange={(e) => setForm((f) => ({ ...f, cfdiUsage: e.target.value }))} style={inp}>
                <option value="G03">G03 — Gastos en general</option>
                <option value="I04">I04 — Equipo de cómputo</option>
                <option value="P01">P01 — Por definir</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Clave SAT producto</span>
              <input value={form.satProductKey} onChange={(e) => setForm((f) => ({ ...f, satProductKey: e.target.value }))} placeholder="80101500" style={inp} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Clave SAT unidad</span>
              <input value={form.satUnitKey} onChange={(e) => setForm((f) => ({ ...f, satUnitKey: e.target.value }))} placeholder="E48" style={inp} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Emisión</span>
              <input type="date" value={form.issueDate} onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))} style={inp} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Vencimiento</span>
              <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} style={inp} />
            </label>
            <label style={{ gridColumn: "1 / -1", display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Concepto *</span>
              <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Servicio de instalación CCTV" style={inp} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Cantidad</span>
              <input type="number" min={1} value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: +e.target.value }))} style={inp} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Precio unitario *</span>
              <input type="number" min={0} step="0.01" value={form.unitPrice || ""} onChange={(e) => setForm((f) => ({ ...f, unitPrice: +e.target.value }))} style={inp} />
            </label>
          </div>
          {formErr && (
            <div role="alert" style={{ marginTop: 12, padding: "8px 12px", background: "var(--state-danger-bg, #fef2f2)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "var(--danger)" }}>
              {formErr}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <Button variant="ghost" onClick={() => { setShowForm(false); setEditingInvoice(null); setFormErr(null); }}>Cancelar</Button>
            <Button variant="primary" onClick={() => void saveInvoice()} disabled={saving}>{saving ? "Guardando…" : editingInvoice ? "Guardar cambios" : "Crear borrador"}</Button>
          </div>
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

      {paymentTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setPaymentTarget(null)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px 28px", width: 440, maxWidth: "calc(100vw - 32px)", boxShadow: "0 24px 56px rgba(0,0,0,0.28)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Registrar pago</div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 18 }}>
              {paymentTarget.invoiceNumber} · saldo pendiente{" "}
              <Money value={Math.max(0, Number(paymentTarget.totalAmount) - Number(paymentTarget.paidAmount ?? 0))} />
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Monto *</span>
                <input type="number" min={0} step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))} style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Fecha de pago</span>
                <input type="date" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm((f) => ({ ...f, paymentDate: e.target.value }))} style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Método</span>
                <select value={paymentForm.method} onChange={(e) => setPaymentForm((f) => ({ ...f, method: e.target.value }))} style={inp}>
                  <option value="SPEI">SPEI</option>
                  <option value="TRANSFER">Transferencia</option>
                  <option value="CASH">Efectivo</option>
                  <option value="CHECK">Cheque</option>
                  <option value="CARD">Tarjeta</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Referencia</span>
                <input value={paymentForm.reference} onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))} placeholder="Clave de rastreo, folio…" style={inp} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>Notas</span>
                <input value={paymentForm.notes} onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))} style={inp} />
              </label>
            </div>
            {paymentErr && (
              <div role="alert" style={{ marginTop: 12, padding: "8px 12px", background: "var(--state-danger-bg,#fef2f2)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "var(--danger)" }}>
                {paymentErr}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <Button variant="secondary" onClick={() => setPaymentTarget(null)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void submitPayment()} disabled={paying}>{paying ? "Registrando…" : "Registrar pago"}</Button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
    </>
  );
}
