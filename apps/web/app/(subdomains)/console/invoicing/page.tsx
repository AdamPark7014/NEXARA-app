"use client";
import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { useUser } from "@/components/UserContext";
import { PERMISSIONS } from "@/lib/permissions";
import HelpTab from '@/components/HelpTab';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador", SENT: "Enviada", PAID: "Pagada", PARTIALLY_PAID: "Pago parcial",
  OVERDUE: "Vencida", CANCELLED: "Cancelada",
};
const TYPE_LABELS: Record<string, string> = {
  ACCOUNTS_RECEIVABLE: "Emitida (CxC)", ACCOUNTS_PAYABLE: "Recibida (CxP)",
};

export default function InvoicingPage() {
  const { user } = useUser();
  const [tab, setTab] = useState<"dashboard" | "list" | "overdue">("dashboard");
  const [dashboard, setDashboard] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [overdue, setOverdue] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const headers = { Authorization: `Bearer ${user?.token}` };

  useEffect(() => {
    if (!user?.token) return;
    Promise.all([
      fetch(`${API_URL}/accounting/invoices/dashboard`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/accounting/invoices`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/accounting/invoices/overdue`, { headers }).then((r) => r.json()),
    ])
      .then(([dash, inv, ov]) => {
        setDashboard(dash);
        setInvoices(Array.isArray(inv) ? inv : inv.data || []);
        setOverdue(Array.isArray(ov) ? ov : ov.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token]);

  const loadDetail = (id: number) => {
    fetch(`${API_URL}/accounting/invoices/${id}`, { headers })
      .then((r) => r.json())
      .then(setSelected)
      .catch(() => {});
  };

  const fmt = (n: number) => Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 });

  const tabs = [
    { key: "dashboard", label: "Resumen" },
    { key: "list", label: "Facturas" },
    { key: "overdue", label: `Vencidas (${overdue.length})` },
  ] as const;

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.INVOICING_VIEW, PERMISSIONS.INVOICING_MANAGE]}>
      <div style={{ display: "grid", gap: 24 }}>
        <HelpTab module="invoicing" user={user} />
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: "var(--primary)", marginBottom: 8 }}>🧾 Facturación CFDI 4.0</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Facturación electrónica SAT, pagos SPEI, complementos de pago y seguimiento de saldos.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tabs.map((t) => (
            <button key={t.key} className={tab === t.key ? "btn-primary" : "btn-secondary"} onClick={() => { setTab(t.key); setSelected(null); }}
              style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600,
                background: tab === t.key ? "var(--primary)" : "var(--card-bg)", color: tab === t.key ? "#fff" : "var(--text-primary)" }}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "var(--text-secondary)" }}>Cargando...</p>
        ) : (
          <>
            {/* ── Dashboard ───────────────────────────────────── */}
            {tab === "dashboard" && dashboard && (
              <div style={{ display: "grid", gap: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
                  <div className="card" style={{ padding: 16 }}>
                    <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Cuentas por Cobrar</p>
                    <p style={{ fontSize: 22, fontWeight: 700, color: "var(--success)" }}>${fmt(dashboard.accountsReceivable?.pending)}</p>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{dashboard.accountsReceivable?.count} facturas pendientes</p>
                  </div>
                  <div className="card" style={{ padding: 16 }}>
                    <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Cuentas por Pagar</p>
                    <p style={{ fontSize: 22, fontWeight: 700, color: "var(--danger)" }}>${fmt(dashboard.accountsPayable?.pending)}</p>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{dashboard.accountsPayable?.count} facturas pendientes</p>
                  </div>
                  <div className="card" style={{ padding: 16 }}>
                    <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Vencidas</p>
                    <p style={{ fontSize: 22, fontWeight: 700, color: "var(--warning)" }}>{dashboard.overdueCount}</p>
                  </div>
                  <div className="card" style={{ padding: 16 }}>
                    <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Emitidas este mes</p>
                    <p style={{ fontSize: 22, fontWeight: 700 }}>{dashboard.monthInvoices}</p>
                  </div>
                </div>

                {dashboard.recentPayments?.length > 0 && (
                  <div className="card" style={{ overflow: "auto" }}>
                    <h3 style={{ padding: "12px 16px 0", color: "var(--primary)" }}>Últimos pagos recibidos</h3>
                    <table className="table">
                      <thead><tr><th>Factura</th><th>Tipo</th><th>Receptor</th><th>Monto</th><th>Fecha</th></tr></thead>
                      <tbody>
                        {dashboard.recentPayments.map((p: any) => (
                          <tr key={p.id}>
                            <td>{p.invoice?.invoiceNumber || "—"}</td>
                            <td><span className="badge">{TYPE_LABELS[p.invoice?.type] || p.invoice?.type}</span></td>
                            <td>{p.invoice?.receptorName || "—"}</td>
                            <td style={{ fontWeight: 600 }}>${fmt(p.amount)}</td>
                            <td>{new Date(p.paymentDate).toLocaleDateString("es-MX")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── List ───────────────────────────────────────── */}
            {tab === "list" && !selected && (
              invoices.length === 0 ? (
                <div className="card" style={{ padding: 24, textAlign: "center" }}>
                  <p style={{ color: "var(--text-secondary)" }}>No hay facturas registradas.</p>
                </div>
              ) : (
                <div className="card" style={{ overflow: "auto" }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Serie-Folio</th>
                        <th>Tipo</th>
                        <th>RFC Receptor</th>
                        <th>Receptor</th>
                        <th>Uso CFDI</th>
                        <th>Total</th>
                        <th>Pagado</th>
                        <th>Estado</th>
                        <th>Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv: any) => (
                        <tr key={inv.id} style={{ cursor: "pointer" }} onClick={() => loadDetail(inv.id)}>
                          <td><strong>{inv.cfdiSerie ? `${inv.cfdiSerie}-${inv.cfdiFolio || ""}` : inv.invoiceNumber}</strong></td>
                          <td><span className="badge">{TYPE_LABELS[inv.type] || inv.type}</span></td>
                          <td style={{ fontFamily: "monospace", fontSize: 13 }}>{inv.receptorRfc || "—"}</td>
                          <td>{inv.receptorName || inv.client?.name || "—"}</td>
                          <td>{inv.cfdiUsage || "G03"}</td>
                          <td><strong>${fmt(inv.totalAmount)}</strong></td>
                          <td>${fmt(inv.paidAmount)}</td>
                          <td>
                            <span className={inv.status === "PAID" ? "status-active" : inv.isCancelled ? "status-inactive" : inv.status === "OVERDUE" ? "status-inactive" : "status-pending"}>
                              {STATUS_LABELS[inv.status] || inv.status}{inv.isCancelled ? " ✕" : ""}
                            </span>
                          </td>
                          <td>{new Date(inv.issueDate || inv.createdAt).toLocaleDateString("es-MX")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* ── Detail CFDI ────────────────────────────────── */}
            {tab === "list" && selected && (
              <div style={{ display: "grid", gap: 16 }}>
                <button onClick={() => setSelected(null)} style={{ justifySelf: "start", padding: "6px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card-bg)", cursor: "pointer", color: "var(--text-primary)" }}>
                  ← Volver al listado
                </button>

                <div className="card" style={{ padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <h2 style={{ color: "var(--primary)" }}>{selected.cfdiSerie ? `${selected.cfdiSerie}-${selected.cfdiFolio || ""}` : selected.invoiceNumber}</h2>
                      <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>CFDI {selected.cfdiVersion || "4.0"} &middot; {TYPE_LABELS[selected.type] || selected.type}</p>
                    </div>
                    <span className={selected.isCancelled ? "status-inactive" : selected.status === "PAID" ? "status-active" : "status-pending"} style={{ alignSelf: "start" }}>
                      {STATUS_LABELS[selected.status] || selected.status}
                    </span>
                  </div>
                </div>

                {/* Emisor / Receptor */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div className="card" style={{ padding: 16 }}>
                    <h4 style={{ color: "var(--primary)", marginBottom: 8 }}>Emisor</h4>
                    <p><strong>RFC:</strong> {selected.emisorRfc || "—"}</p>
                    <p><strong>Nombre:</strong> {selected.emisorName || "—"}</p>
                    <p><strong>Régimen:</strong> {selected.emisorRegime || "—"}</p>
                  </div>
                  <div className="card" style={{ padding: 16 }}>
                    <h4 style={{ color: "var(--primary)", marginBottom: 8 }}>Receptor</h4>
                    <p><strong>RFC:</strong> {selected.receptorRfc || "—"}</p>
                    <p><strong>Nombre:</strong> {selected.receptorName || "—"}</p>
                    <p><strong>Régimen:</strong> {selected.receptorRegime || "—"}</p>
                    <p><strong>C.P.:</strong> {selected.receptorZipCode || "—"}</p>
                    <p><strong>Uso CFDI:</strong> {selected.cfdiUsage || "—"}</p>
                  </div>
                </div>

                {/* Datos fiscales */}
                <div className="card" style={{ padding: 16 }}>
                  <h4 style={{ color: "var(--primary)", marginBottom: 8 }}>Datos fiscales</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                    <p><strong>UUID CFDI:</strong> <span style={{ fontFamily: "monospace", fontSize: 12 }}>{selected.cfdiUuid || "Pendiente de timbrado"}</span></p>
                    <p><strong>Forma de pago:</strong> {selected.satPaymentForm || "—"}</p>
                    <p><strong>Método de pago:</strong> {selected.satPaymentMethod || "—"}</p>
                    <p><strong>Certificado SAT:</strong> {selected.satCertNumber || "—"}</p>
                    <p><strong>Fecha timbrado:</strong> {selected.cfdiStampDate ? new Date(selected.cfdiStampDate).toLocaleString("es-MX") : "—"}</p>
                    <p><strong>Tipo cambio:</strong> {selected.exchangeRate ? `$${selected.exchangeRate}` : "1.00 MXN"}</p>
                    <p><strong>Moneda:</strong> {selected.currency || "MXN"}</p>
                  </div>
                </div>

                {/* Conceptos */}
                {selected.items?.length > 0 && (
                  <div className="card" style={{ overflow: "auto" }}>
                    <h4 style={{ padding: "12px 16px 0", color: "var(--primary)" }}>Conceptos</h4>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Clave SAT</th>
                          <th>Clave Unidad</th>
                          <th>Descripción</th>
                          <th>Cantidad</th>
                          <th>P. Unitario</th>
                          <th>Descuento</th>
                          <th>IVA</th>
                          <th>IEPS</th>
                          <th>Ret ISR</th>
                          <th>Ret IVA</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.items.map((it: any, idx: number) => (
                          <tr key={it.id || idx}>
                            <td style={{ fontFamily: "monospace", fontSize: 12 }}>{it.satProductKey || "—"}</td>
                            <td style={{ fontFamily: "monospace", fontSize: 12 }}>{it.satUnitKey || "—"}</td>
                            <td>{it.description}</td>
                            <td>{Number(it.quantity)}</td>
                            <td>${fmt(it.unitPrice)}</td>
                            <td>{it.discount ? `$${fmt(it.discount)}` : "—"}</td>
                            <td>${fmt(it.ivaAmount)} ({Number(it.ivaRate || 16)}%)</td>
                            <td>{it.iepsAmount ? `$${fmt(it.iepsAmount)}` : "—"}</td>
                            <td>{it.isrRetAmount ? `$${fmt(it.isrRetAmount)}` : "—"}</td>
                            <td>{it.ivaRetAmount ? `$${fmt(it.ivaRetAmount)}` : "—"}</td>
                            <td style={{ fontWeight: 700 }}>${fmt(it.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Totals */}
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 24, flexWrap: "wrap" }}>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Subtotal</p>
                      <p style={{ fontSize: 18, fontWeight: 600 }}>${fmt(selected.subtotal)}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Impuestos</p>
                      <p style={{ fontSize: 18, fontWeight: 600 }}>${fmt(selected.taxAmount)}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Total</p>
                      <p style={{ fontSize: 22, fontWeight: 700, color: "var(--primary)" }}>${fmt(selected.totalAmount)}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Pagado</p>
                      <p style={{ fontSize: 18, fontWeight: 600, color: "var(--success)" }}>${fmt(selected.paidAmount)}</p>
                    </div>
                  </div>
                </div>

                {/* Pagos */}
                {selected.payments?.length > 0 && (
                  <div className="card" style={{ overflow: "auto" }}>
                    <h4 style={{ padding: "12px 16px 0", color: "var(--primary)" }}>Pagos registrados</h4>
                    <table className="table">
                      <thead>
                        <tr><th>Fecha</th><th>Método</th><th>Forma SAT</th><th>Clave SPEI</th><th>Monto</th><th>Referencia</th></tr>
                      </thead>
                      <tbody>
                        {selected.payments.map((p: any) => (
                          <tr key={p.id}>
                            <td>{new Date(p.paymentDate).toLocaleDateString("es-MX")}</td>
                            <td><span className="badge">{p.method}</span></td>
                            <td>{p.satPaymentForm || "—"}</td>
                            <td style={{ fontFamily: "monospace", fontSize: 12 }}>{p.speiTrackingKey || "—"}</td>
                            <td style={{ fontWeight: 600 }}>${fmt(p.amount)}</td>
                            <td>{p.reference || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Cancelación */}
                {selected.isCancelled && (
                  <div className="card" style={{ padding: 16, borderLeft: "4px solid var(--danger)" }}>
                    <h4 style={{ color: "var(--danger)", marginBottom: 8 }}>Factura cancelada</h4>
                    <p><strong>Motivo:</strong> {selected.cancelReason || "—"}</p>
                    <p><strong>UUID sustitución:</strong> {selected.substitutionUuid || "—"}</p>
                    <p><strong>Cancelada:</strong> {selected.cancelledAt ? new Date(selected.cancelledAt).toLocaleString("es-MX") : "—"}</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Overdue ────────────────────────────────────── */}
            {tab === "overdue" && (
              overdue.length === 0 ? (
                <div className="card" style={{ padding: 24, textAlign: "center" }}>
                  <p style={{ color: "var(--text-secondary)" }}>No hay facturas vencidas. ✓</p>
                </div>
              ) : (
                <div className="card" style={{ overflow: "auto" }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Folio</th>
                        <th>RFC Receptor</th>
                        <th>Cliente</th>
                        <th>Total</th>
                        <th>Pagado</th>
                        <th>Pendiente</th>
                        <th>Vencimiento</th>
                        <th>Días vencida</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overdue.map((inv: any) => {
                        const daysOverdue = Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000);
                        return (
                          <tr key={inv.id}>
                            <td><strong>{inv.invoiceNumber}</strong></td>
                            <td style={{ fontFamily: "monospace", fontSize: 13 }}>{inv.receptorRfc || "—"}</td>
                            <td>{inv.client?.name || inv.receptorName || "—"}</td>
                            <td>${fmt(inv.totalAmount)}</td>
                            <td>${fmt(inv.paidAmount)}</td>
                            <td style={{ fontWeight: 700, color: "var(--danger)" }}>
                              ${fmt(Number(inv.totalAmount) - Number(inv.paidAmount))}
                            </td>
                            <td>{new Date(inv.dueDate).toLocaleDateString("es-MX")}</td>
                            <td style={{ color: "var(--danger)", fontWeight: 700 }}>{daysOverdue}d</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </>
        )}
      </div>
    </RoleGuard>
  );
}
