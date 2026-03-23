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
  const [tab, setTab] = useState<"dashboard" | "create" | "list" | "overdue">("dashboard");
  const [dashboard, setDashboard] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [issuerProfile, setIssuerProfile] = useState<any>(null);
  const [overdue, setOverdue] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    type: 'ACCOUNTS_RECEIVABLE',
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date().toISOString().slice(0, 10),
    receptorRfc: '',
    receptorName: '',
    cfdiUsage: 'G03',
    satPaymentForm: '03',
    satPaymentMethod: 'PUE',
    emisorRfc: '',
    emisorName: '',
    emisorRegime: '601',
    emisorZipCode: '',
    notes: '',
    itemDescription: '',
    itemQuantity: '1',
    itemUnitPrice: '0',
    itemTaxRate: '16',
  });
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    method: 'SPEI',
    satPaymentForm: '03',
    bankAccountId: '',
    speiTrackingKey: '',
    operationNumber: '',
    reference: '',
    notes: '',
  });

  const headers = { Authorization: `Bearer ${user?.token}` };
  const canManageInvoicing = Boolean(
    user?.isSuperAdmin ||
      (Array.isArray((user as any)?.permissions) && (user as any).permissions.includes(PERMISSIONS.INVOICING_MANAGE)),
  );

  const loadData = () => {
    if (!user?.token) return;
    setLoading(true);
    Promise.all([
      fetch(`${API_URL}/accounting/invoices/dashboard`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/accounting/invoices`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/accounting/invoices/overdue`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/accounting/banking/accounts`, { headers }).then((r) => r.ok ? r.json() : []),
      fetch(`${API_URL}/accounting/invoices/issuer-profile`, { headers }).then((r) => r.ok ? r.json() : null),
    ])
      .then(([dash, inv, ov, accounts, issuer]) => {
        setDashboard(dash);
        setInvoices(Array.isArray(inv) ? inv : inv.data || []);
        setOverdue(Array.isArray(ov) ? ov : ov.data || []);
        setBankAccounts(Array.isArray(accounts) ? accounts : accounts.data || []);
        setIssuerProfile(issuer);
        if (issuer) {
          setInvoiceForm((prev) => ({
            ...prev,
            emisorRfc: prev.emisorRfc || issuer.emisorRfc || '',
            emisorName: prev.emisorName || issuer.emisorName || '',
            emisorRegime: prev.emisorRegime || issuer.emisorRegime || '601',
            emisorZipCode: prev.emisorZipCode || issuer.emisorZipCode || '',
          }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [user?.token]);

  const createInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.token) return;

    const quantity = Number(invoiceForm.itemQuantity || 0);
    const unitPrice = Number(invoiceForm.itemUnitPrice || 0);
    const taxRate = Number(invoiceForm.itemTaxRate || 16);
    if (!invoiceForm.itemDescription || quantity <= 0 || unitPrice <= 0) {
      alert('Completa el concepto con cantidad y precio validos.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/accounting/invoices`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: invoiceForm.type,
          issueDate: invoiceForm.issueDate,
          dueDate: invoiceForm.dueDate,
          receptorRfc: invoiceForm.receptorRfc || undefined,
          receptorName: invoiceForm.receptorName || undefined,
          cfdiUsage: invoiceForm.cfdiUsage || undefined,
          satPaymentForm: invoiceForm.satPaymentForm || undefined,
          satPaymentMethod: invoiceForm.satPaymentMethod || undefined,
          emisorRfc: invoiceForm.emisorRfc || undefined,
          emisorName: invoiceForm.emisorName || undefined,
          emisorRegime: invoiceForm.emisorRegime || undefined,
          emisorZipCode: invoiceForm.emisorZipCode || undefined,
          notes: invoiceForm.notes || undefined,
          items: [
            {
              description: invoiceForm.itemDescription,
              quantity,
              unitPrice,
              taxRate,
              ivaRate: taxRate,
            },
          ],
        }),
      });

      if (!res.ok) throw new Error(await res.text());

      setInvoiceForm((prev) => ({
        ...prev,
        receptorRfc: '',
        receptorName: '',
        notes: '',
        itemDescription: '',
        itemQuantity: '1',
        itemUnitPrice: '0',
        itemTaxRate: '16',
      }));
      setTab('list');
      loadData();
    } catch (error: any) {
      alert(error?.message || 'No se pudo crear la factura.');
    } finally {
      setSaving(false);
    }
  };

  const loadDetail = (id: number) => {
    fetch(`${API_URL}/accounting/invoices/${id}`, { headers })
      .then((r) => r.json())
      .then(setSelected)
      .catch(() => {});
  };

  const registerPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.token || !selected?.id) return;

    const amount = Number(paymentForm.amount || 0);
    if (amount <= 0) {
      alert('Ingresa un monto de pago valido.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/accounting/invoices/${selected.id}/payments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          paymentDate: paymentForm.paymentDate,
          method: paymentForm.method || undefined,
          satPaymentForm: paymentForm.satPaymentForm || undefined,
          bankAccountId: paymentForm.bankAccountId ? Number(paymentForm.bankAccountId) : undefined,
          speiTrackingKey: paymentForm.speiTrackingKey || undefined,
          operationNumber: paymentForm.operationNumber || undefined,
          reference: paymentForm.reference || undefined,
          notes: paymentForm.notes || undefined,
        }),
      });

      if (!res.ok) throw new Error(await res.text());

      setPaymentForm((prev) => ({
        ...prev,
        amount: '',
        speiTrackingKey: '',
        operationNumber: '',
        reference: '',
        notes: '',
      }));
      loadDetail(selected.id);
      loadData();
    } catch (error: any) {
      alert(error?.message || 'No se pudo registrar el pago.');
    } finally {
      setSaving(false);
    }
  };

  const applyIssuerProfileToForm = () => {
    if (!issuerProfile) return;
    setInvoiceForm((prev) => ({
      ...prev,
      emisorRfc: issuerProfile.emisorRfc || '',
      emisorName: issuerProfile.emisorName || '',
      emisorRegime: issuerProfile.emisorRegime || prev.emisorRegime || '601',
      emisorZipCode: issuerProfile.emisorZipCode || '',
    }));
  };

  const deleteInvoice = async (invoice: any) => {
    if (!user?.token) return;
    const ok = confirm(`¿Eliminar factura ${invoice.invoiceNumber}?`);
    if (!ok) return;

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/accounting/invoices/${invoice.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      if (selected?.id === invoice.id) setSelected(null);
      loadData();
    } catch (error: any) {
      alert(error?.message || 'No se pudo eliminar la factura.');
    } finally {
      setSaving(false);
    }
  };

  const fmt = (n: number) => Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 });

  const tabs = [
    { key: "dashboard", label: "Resumen" },
    { key: "create", label: "Facturar" },
    { key: "list", label: "Facturas" },
    { key: "overdue", label: `Vencidas (${overdue.length})` },
  ] as const;

  const renderCreateInvoiceForm = () => (
    <div className="card" style={{ padding: 16 }}>
      <h3 style={{ marginBottom: 10, color: 'var(--primary)' }}>Generar factura</h3>
      <div style={{ marginBottom: 10, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <h4 style={{ margin: '0 0 8px', color: 'var(--primary)' }}>Perfil fiscal de la entidad</h4>
        <div style={{ display: 'grid', gap: 4, color: 'var(--text-secondary)', fontSize: 13 }}>
          <p style={{ margin: 0 }}><strong>RFC:</strong> {issuerProfile?.emisorRfc || 'No configurado'}</p>
          <p style={{ margin: 0 }}><strong>Nombre fiscal:</strong> {issuerProfile?.emisorName || 'No configurado'}</p>
          <p style={{ margin: 0 }}><strong>Régimen:</strong> {issuerProfile?.emisorRegime || 'No configurado'}</p>
          <p style={{ margin: 0 }}><strong>C.P.:</strong> {issuerProfile?.emisorZipCode || 'No configurado'}</p>
        </div>
        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={applyIssuerProfileToForm} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', fontWeight: 600 }}>
            Usar perfil en nuestros datos
          </button>
        </div>
      </div>
      {!canManageInvoicing && (
        <p style={{ marginBottom: 10, color: 'var(--danger, #ef4444)' }}>
          Tu rol tiene permiso de consulta, pero no de facturacion.
        </p>
      )}
      <form onSubmit={createInvoice} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
        <div style={{ gridColumn: '1 / -1', padding: 12, borderRadius: 8, border: '1px dashed var(--border)', background: 'var(--card-bg)' }}>
          <h4 style={{ margin: '0 0 8px', color: 'var(--primary)' }}>1) Nuestros datos (Emisor)</h4>
          <p style={{ margin: '0 0 10px', color: 'var(--text-secondary)', fontSize: 13 }}>
            Aqui capturas los datos fiscales de tu entidad para la factura (RFC, razon social, regimen y C.P.).
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>RFC emisor</label>
              <input type="text" placeholder="AAA010101AAA" value={invoiceForm.emisorRfc} onChange={(e) => setInvoiceForm((p) => ({ ...p, emisorRfc: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Nombre fiscal emisor</label>
              <input type="text" placeholder="Razon social" value={invoiceForm.emisorName} onChange={(e) => setInvoiceForm((p) => ({ ...p, emisorName: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Regimen fiscal</label>
              <input type="text" placeholder="601" value={invoiceForm.emisorRegime} onChange={(e) => setInvoiceForm((p) => ({ ...p, emisorRegime: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Codigo postal emisor</label>
              <input type="text" placeholder="64000" value={invoiceForm.emisorZipCode} onChange={(e) => setInvoiceForm((p) => ({ ...p, emisorZipCode: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
            </div>
          </div>
        </div>

        <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
          <h4 style={{ margin: 0, color: 'var(--primary)' }}>2) Datos del receptor y concepto</h4>
        </div>

        <select value={invoiceForm.type} onChange={(e) => setInvoiceForm((p) => ({ ...p, type: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
          <option value="ACCOUNTS_RECEIVABLE">Emitida (CxC)</option>
          <option value="ACCOUNTS_PAYABLE">Recibida (CxP)</option>
        </select>
        <input type="date" value={invoiceForm.issueDate} onChange={(e) => setInvoiceForm((p) => ({ ...p, issueDate: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
        <input type="date" value={invoiceForm.dueDate} onChange={(e) => setInvoiceForm((p) => ({ ...p, dueDate: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
        <input type="text" placeholder="RFC receptor" value={invoiceForm.receptorRfc} onChange={(e) => setInvoiceForm((p) => ({ ...p, receptorRfc: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
        <input type="text" placeholder="Nombre receptor" value={invoiceForm.receptorName} onChange={(e) => setInvoiceForm((p) => ({ ...p, receptorName: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
        <input type="text" placeholder="Uso CFDI (G03)" value={invoiceForm.cfdiUsage} onChange={(e) => setInvoiceForm((p) => ({ ...p, cfdiUsage: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
        <input type="text" placeholder="Forma SAT (03)" value={invoiceForm.satPaymentForm} onChange={(e) => setInvoiceForm((p) => ({ ...p, satPaymentForm: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
        <input type="text" placeholder="Metodo SAT (PUE)" value={invoiceForm.satPaymentMethod} onChange={(e) => setInvoiceForm((p) => ({ ...p, satPaymentMethod: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
        <input type="text" placeholder="Concepto" value={invoiceForm.itemDescription} onChange={(e) => setInvoiceForm((p) => ({ ...p, itemDescription: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
        <input type="number" min={1} step="0.01" placeholder="Cantidad" value={invoiceForm.itemQuantity} onChange={(e) => setInvoiceForm((p) => ({ ...p, itemQuantity: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
        <input type="number" min={0} step="0.01" placeholder="Precio unitario" value={invoiceForm.itemUnitPrice} onChange={(e) => setInvoiceForm((p) => ({ ...p, itemUnitPrice: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
        <input type="number" min={0} step="0.01" placeholder="IVA %" value={invoiceForm.itemTaxRate} onChange={(e) => setInvoiceForm((p) => ({ ...p, itemTaxRate: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
        <input type="text" placeholder="Notas" value={invoiceForm.notes} onChange={(e) => setInvoiceForm((p) => ({ ...p, notes: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
        <button
          type="submit"
          disabled={saving || !canManageInvoicing}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--primary)',
            color: '#fff',
            cursor: saving || !canManageInvoicing ? 'not-allowed' : 'pointer',
            opacity: saving || !canManageInvoicing ? 0.6 : 1,
          }}
        >
          {saving ? 'Facturando...' : 'Crear factura'}
        </button>
      </form>
    </div>
  );

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

                <div className="card" style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <h3 style={{ color: 'var(--primary)', marginBottom: 4 }}>Necesitas facturar ahora?</h3>
                    <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Entra al formulario rapido de emision CFDI.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab('create')}
                    style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Ir a facturar
                  </button>
                </div>
              </div>
            )}

            {tab === "create" && renderCreateInvoiceForm()}

            {/* ── List ───────────────────────────────────────── */}
            {tab === "list" && !selected && (
              <div style={{ display: 'grid', gap: 14 }}>
                {invoices.length === 0 ? (
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
                          {canManageInvoicing && <th>Acciones</th>}
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
                            {canManageInvoicing && (
                              <td onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => deleteInvoice(inv)}
                                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--danger, #ef4444)', color: 'var(--danger, #ef4444)', background: 'transparent', cursor: saving ? 'not-allowed' : 'pointer' }}
                                >
                                  Eliminar
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                </div>
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
                {canManageInvoicing && (
                  <div className="card" style={{ padding: 16 }}>
                    <h4 style={{ color: 'var(--primary)', marginBottom: 8 }}>Registrar pago / transferencia</h4>
                    <form onSubmit={registerPayment} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
                      <input type="number" min={0} step="0.01" placeholder="Monto" value={paymentForm.amount} onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
                      <input type="date" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm((p) => ({ ...p, paymentDate: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
                      <select value={paymentForm.method} onChange={(e) => setPaymentForm((p) => ({ ...p, method: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <option value="SPEI">SPEI</option>
                        <option value="BANK_TRANSFER">Transferencia</option>
                        <option value="CASH">Efectivo</option>
                        <option value="CHECK">Cheque</option>
                      </select>
                      <input type="text" placeholder="Forma SAT (03)" value={paymentForm.satPaymentForm} onChange={(e) => setPaymentForm((p) => ({ ...p, satPaymentForm: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
                      <select value={paymentForm.bankAccountId} onChange={(e) => setPaymentForm((p) => ({ ...p, bankAccountId: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <option value="">Cuenta bancaria (opcional)</option>
                        {bankAccounts.map((ba: any) => (
                          <option key={ba.id} value={ba.id}>{ba.bankName} - {ba.accountNumber}</option>
                        ))}
                      </select>
                      <input type="text" placeholder="Clave rastreo SPEI" value={paymentForm.speiTrackingKey} onChange={(e) => setPaymentForm((p) => ({ ...p, speiTrackingKey: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
                      <input type="text" placeholder="Operacion" value={paymentForm.operationNumber} onChange={(e) => setPaymentForm((p) => ({ ...p, operationNumber: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
                      <input type="text" placeholder="Referencia" value={paymentForm.reference} onChange={(e) => setPaymentForm((p) => ({ ...p, reference: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
                      <input type="text" placeholder="Notas" value={paymentForm.notes} onChange={(e) => setPaymentForm((p) => ({ ...p, notes: e.target.value }))} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }} />
                      <button type="submit" disabled={saving} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer' }}>
                        {saving ? 'Registrando...' : 'Registrar pago'}
                      </button>
                    </form>
                  </div>
                )}

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
