"use client";
import React, { useMemo, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { PERMISSIONS } from "@/lib/permissions";
import { useUser } from "@/components/UserContext";
import { triggerBlobDownload } from "@/lib/file-download";

type QuoteItem = {
  id: string;
  category: string;
  name: string;
  description: string;
  scope: string;
  brand: string;
  model: string;
  sku: string;
  partNumber: string;
  batchReference: string;
  unit: string;
  qty: number;
  unitPrice: number;
  discount: number;
  tax: number;
  ieps: number;
  retention: number;
  laborHours: number;
  laborRate: number;
  warrantyMonths: number;
  deliveryTime: string;
  countryOrigin: string;
  notes: string;
};

type QuoteMeta = {
  quoteNumber: string;
  issueDate: string;
  clientName: string;
  clientCompany: string;
  clientEmail: string;
  clientPhone: string;
  clientAddress: string;
  projectName: string;
  scope: string;
  validUntil: string;
  paymentTerms: string;
  deliveryTime: string;
  preparedBy: string;
  preparedRole: string;
  currency: string;
  depositPercent: number;
  note: string;
};

const seedItems: QuoteItem[] = [
  {
    id: "item-1",
    category: "Hardware",
    name: "Servicio de implementación",
    description: "Configuración inicial, onboarding y alineación de objetivos.",
    scope: "Planeacion, despliegue y handover.",
    brand: "Nexara",
    model: "Suite Pro",
    sku: "NX-SVC-001",
    partNumber: "SERV-IMP-01",
    batchReference: "",
    unit: "servicio",
    qty: 1,
    unitPrice: 18500,
    discount: 0,
    tax: 16,
    ieps: 0,
    retention: 0,
    laborHours: 24,
    laborRate: 850,
    warrantyMonths: 0,
    deliveryTime: "2 semanas",
    countryOrigin: "MX",
    notes: "Incluye capacitacion base.",
  },
  {
    id: "item-2",
    category: "Soporte",
    name: "Soporte mensual",
    description: "Mesa de ayuda, monitoreo y reportes ejecutivos.",
    scope: "Cobertura 5x9 con escalamiento.",
    brand: "Nexara",
    model: "Care Plus",
    sku: "NX-SUP-200",
    partNumber: "SUP-5X9",
    batchReference: "",
    unit: "mes",
    qty: 2,
    unitPrice: 6500,
    discount: 5,
    tax: 16,
    ieps: 0,
    retention: 0,
    laborHours: 0,
    laborRate: 0,
    warrantyMonths: 0,
    deliveryTime: "Mensual",
    countryOrigin: "MX",
    notes: "Incluye SLA trimestral.",
  },
];

const todayInput = () => new Date().toISOString().slice(0, 10);

const buildQuoteNumber = () => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `Q-${year}-${month}${day}`;
};

const emptyMeta: QuoteMeta = {
  quoteNumber: buildQuoteNumber(),
  issueDate: todayInput(),
  clientName: "",
  clientCompany: "",
  clientEmail: "",
  clientPhone: "",
  clientAddress: "",
  projectName: "",
  scope: "Implementación, capacitación y soporte operativo.",
  validUntil: "",
  paymentTerms: "50% anticipo · 50% contra entrega",
  deliveryTime: "4 semanas despues de la firma",
  preparedBy: "Equipo Nexara",
  preparedRole: "Dirección Comercial",
  currency: "MXN",
  depositPercent: 50,
  note: "Incluye SLA, onboarding y capacitacion inicial.",
};

const formatMoney = (value: number, currency: string) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);

const formatPercent = (value: number) => `${value.toFixed(0)}%`;

const categoryOptions = [
  "Hardware",
  "Software",
  "Licencias",
  "Servicios",
  "Mano de obra",
  "Soporte",
  "Logistica",
  "Otros",
];

const unitOptions = ["pieza", "lote", "hora", "mes", "servicio", "licencia", "kit"];

export default function CotizacionesPage() {
  const { user } = useUser();
  const [meta, setMeta] = useState<QuoteMeta>(emptyMeta);
  const [items, setItems] = useState<QuoteItem[]>(seedItems);
  const [status, setStatus] = useState<"draft" | "sent" | "approved">("draft");
  const [quoteId, setQuoteId] = useState<number | null>(null);
  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, "")}`;

  const updateMeta = (field: keyof QuoteMeta, value: string) => {
    setMeta((prev) => ({ ...prev, [field]: value }));
  };

  const updateMetaNumber = (field: keyof QuoteMeta, value: number) => {
    setMeta((prev) => ({ ...prev, [field]: value }));
  };

  const updateItem = (id: string, field: keyof QuoteItem, value: string | number) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}`,
        category: "Hardware",
        name: "Nuevo concepto",
        description: "Describe el servicio o producto.",
        scope: "",
        brand: "",
        model: "",
        sku: "",
        partNumber: "",
        batchReference: "",
        unit: "pieza",
        qty: 1,
        unitPrice: 0,
        discount: 0,
        tax: 16,
        ieps: 0,
        retention: 0,
        laborHours: 0,
        laborRate: 0,
        warrantyMonths: 0,
        deliveryTime: "",
        countryOrigin: "",
        notes: "",
      },
    ]);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const totals = useMemo(() => {
    const lineTotals = items.map((item) => {
      const subtotal = item.qty * item.unitPrice;
      const discount = subtotal * (item.discount / 100);
      const taxable = subtotal - discount;
      const taxAmount = taxable * (item.tax / 100);
      const iepsAmount = taxable * (item.ieps / 100);
      const retentionAmount = taxable * (item.retention / 100);
      return {
        subtotal,
        discount,
        taxAmount,
        iepsAmount,
        retentionAmount,
        total: taxable + taxAmount + iepsAmount - retentionAmount,
      };
    });
    return lineTotals.reduce(
      (acc, line) => ({
        subtotal: acc.subtotal + line.subtotal,
        discount: acc.discount + line.discount,
        tax: acc.tax + line.taxAmount,
        ieps: acc.ieps + line.iepsAmount,
        retention: acc.retention + line.retentionAmount,
        total: acc.total + line.total,
      }),
      { subtotal: 0, discount: 0, tax: 0, ieps: 0, retention: 0, total: 0 },
    );
  }, [items]);

  const categoryTotals = useMemo(() => {
    return items.reduce<Record<string, number>>((acc, item) => {
      const subtotal = item.qty * item.unitPrice;
      const discount = subtotal * (item.discount / 100);
      const taxable = subtotal - discount;
      const taxAmount = taxable * (item.tax / 100);
      const iepsAmount = taxable * (item.ieps / 100);
      const retentionAmount = taxable * (item.retention / 100);
      const total = taxable + taxAmount + iepsAmount - retentionAmount;
      const key = item.category || "Otros";
      acc[key] = (acc[key] || 0) + total;
      return acc;
    }, {});
  }, [items]);

  const depositAmount = totals.total * (meta.depositPercent / 100);
  const balanceAmount = Math.max(0, totals.total - depositAmount);

  const buildPayload = () => ({
    ...meta,
    status,
    items: items.map((item) => ({
      category: item.category,
      name: item.name,
      description: item.description,
      scope: item.scope,
      brand: item.brand,
      model: item.model,
      sku: item.sku,
      partNumber: item.partNumber,
      batchReference: item.batchReference,
      unit: item.unit,
      qty: item.qty,
      unitPrice: item.unitPrice,
      discount: item.discount,
      tax: item.tax,
      ieps: item.ieps,
      retention: item.retention,
      laborHours: item.laborHours,
      laborRate: item.laborRate,
      warrantyMonths: item.warrantyMonths,
      deliveryTime: item.deliveryTime,
      countryOrigin: item.countryOrigin,
      notes: item.notes,
    })),
  });

  const handleSave = async () => {
    if (!user?.token) {
      setSaveMessage("Inicia sesión para guardar.");
      return null;
    }
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const payload = buildPayload();
      const endpoint = quoteId ? `cotizaciones/${quoteId}` : "cotizaciones";
      const method = quoteId ? "PUT" : "POST";
      const res = await fetch(buildApiUrl(endpoint), {
        method,
        headers: {
          Authorization: `Bearer ${user.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("save failed");
      const data = await res.json();
      setQuoteId(data.id);
      setPublicToken(data.publicToken || null);
      setSaveMessage("Cotizacion guardada.");
      return data;
    } catch {
      setSaveMessage("No se pudo guardar la cotizacion.");
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async () => {
    const saved = await handleSave();
    if (!saved || !user?.token) return;
    const res = await fetch(buildApiUrl(`cotizaciones/${saved.id}/pdf`), {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    if (!res.ok) {
      setSaveMessage("No se pudo exportar el PDF.");
      return;
    }
    const blob = await res.blob();
    void triggerBlobDownload(blob, `cotizacion-${saved.quoteNumber || saved.id}.pdf`, {
      mimeType: "application/pdf",
    });
  };

  const handleSend = async () => {
    const saved = await handleSave();
    if (!saved || !user?.token) return;
    const message = window.prompt("Mensaje opcional para el cliente", "") || undefined;
    const res = await fetch(buildApiUrl(`cotizaciones/${saved.id}/send`), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${user.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: meta.clientEmail, message }),
    });
    if (!res.ok) {
      setSaveMessage("No se pudo enviar la cotizacion.");
      return;
    }
    const data = await res.json();
    setStatus("sent");
    setPublicToken(data.publicToken || null);
    setSaveMessage("Cotizacion enviada.");
  };

  const signUrl = publicToken && typeof window !== "undefined"
    ? `${window.location.origin}/cotizaciones/firmar/${publicToken}`
    : null;

  return (
    <RoleGuard permissions={[PERMISSIONS.COTIZACIONES_ACCESS]}>
      <section className="quoteShell">
        <header className="quoteHeader">
          <div>
            <p className="eyebrow">Panel Console</p>
            <h1>Gestión de Cotizaciones</h1>
            <p className="subline">Diseña, envia y firma cotizaciones en una sola vista.</p>
          </div>
          <div className="headerActions">
            <div className={`statusPill ${status}`}>{status === "draft" ? "Borrador" : status === "sent" ? "Enviada" : "Aprobada"}</div>
            <button className="ghostButton" type="button" onClick={() => setStatus("draft")}>Reiniciar</button>
            <button className="ghostButton" type="button" onClick={handleSave} disabled={isSaving}>Guardar</button>
            <button className="ghostButton" type="button" onClick={handleExport} disabled={isSaving}>Exportar PDF</button>
            <button className="primaryButton" type="button" onClick={handleSend} disabled={isSaving}>Enviar</button>
          </div>
        </header>

        {saveMessage && <p className="saveMessage">{saveMessage}</p>}

        <div className="statsRow">
          <div className="statCard">
            <span>Subtotal</span>
            <strong>{formatMoney(totals.subtotal, meta.currency)}</strong>
          </div>
          <div className="statCard">
            <span>Descuento</span>
            <strong>- {formatMoney(totals.discount, meta.currency)}</strong>
          </div>
          <div className="statCard">
            <span>IVA</span>
            <strong>{formatMoney(totals.tax, meta.currency)}</strong>
          </div>
          <div className="statCard accent">
            <span>Total</span>
            <strong>{formatMoney(totals.total, meta.currency)}</strong>
          </div>
        </div>

        <div className="quoteGrid">
          <div className="editorCard">
            <div className="section">
              <div className="sectionHeader">
                <h2>Documento</h2>
                <span className="chip">#{meta.quoteNumber}</span>
              </div>
              <div className="fieldGrid">
                <label className="field">
                  Número de cotización
                  <input value={meta.quoteNumber} onChange={(e) => updateMeta("quoteNumber", e.target.value)} />
                </label>
                <label className="field">
                  Fecha de emision
                  <input type="date" value={meta.issueDate} onChange={(e) => updateMeta("issueDate", e.target.value)} />
                </label>
                <label className="field">
                  Vigencia
                  <input type="date" value={meta.validUntil} onChange={(e) => updateMeta("validUntil", e.target.value)} />
                </label>
              </div>
            </div>

            <div className="section">
              <h2>Cliente</h2>
              <div className="fieldGrid">
                <label className="field">
                  Nombre
                  <input value={meta.clientName} onChange={(e) => updateMeta("clientName", e.target.value)} placeholder="Nombre del contacto" />
                </label>
                <label className="field">
                  Empresa
                  <input value={meta.clientCompany} onChange={(e) => updateMeta("clientCompany", e.target.value)} placeholder="Empresa" />
                </label>
                <label className="field">
                  Email
                  <input value={meta.clientEmail} onChange={(e) => updateMeta("clientEmail", e.target.value)} placeholder="correo@empresa.com" />
                </label>
                <label className="field">
                  Teléfono
                  <input value={meta.clientPhone} onChange={(e) => updateMeta("clientPhone", e.target.value)} placeholder="55 0000 0000" />
                </label>
                <label className="field full">
                  Dirección
                  <input value={meta.clientAddress} onChange={(e) => updateMeta("clientAddress", e.target.value)} placeholder="Calle, ciudad, país" />
                </label>
              </div>
            </div>

            <div className="section">
              <h2>Proyecto</h2>
              <div className="fieldGrid">
                <label className="field">
                  Nombre del proyecto
                  <input value={meta.projectName} onChange={(e) => updateMeta("projectName", e.target.value)} placeholder="Implementación Nexara" />
                </label>
                <label className="field">
                  Moneda
                  <select value={meta.currency} onChange={(e) => updateMeta("currency", e.target.value)}>
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </label>
                <label className="field">
                  Tiempo de entrega
                  <input value={meta.deliveryTime} onChange={(e) => updateMeta("deliveryTime", e.target.value)} />
                </label>
                <label className="field">
                  Terminos de pago
                  <input value={meta.paymentTerms} onChange={(e) => updateMeta("paymentTerms", e.target.value)} />
                </label>
                <label className="field">
                  Anticipo %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={meta.depositPercent}
                    onChange={(e) => updateMetaNumber("depositPercent", Number(e.target.value))}
                  />
                </label>
              </div>
              <label className="field" style={{ marginTop: 12 }}>
                Alcance
                <textarea
                  className="noteArea"
                  value={meta.scope}
                  onChange={(e) => updateMeta("scope", e.target.value)}
                  rows={3}
                />
              </label>
            </div>

            <div className="section">
              <h2>Preparado por</h2>
              <div className="fieldGrid">
                <label className="field">
                  Responsable
                  <input value={meta.preparedBy} onChange={(e) => updateMeta("preparedBy", e.target.value)} />
                </label>
                <label className="field">
                  Cargo
                  <input value={meta.preparedRole} onChange={(e) => updateMeta("preparedRole", e.target.value)} />
                </label>
              </div>
            </div>

            <div className="section">
              <div className="sectionHeader">
                <h2>Conceptos</h2>
                <div className="sectionActions">
                  <button type="button" className="ghostButton" onClick={addItem}>+ Agregar</button>
                </div>
              </div>
              <div className="tableWrap">
                <div className="tableHeader">
                  <span>#</span>
                  <span>Categoria</span>
                  <span>Concepto</span>
                  <span>Marca</span>
                  <span>Modelo/Lote</span>
                  <span>SKU/PN</span>
                  <span>Unidad</span>
                  <span>Cant</span>
                  <span>Precio</span>
                  <span>Desc %</span>
                  <span>IVA %</span>
                  <span>IEPS %</span>
                  <span>Ret %</span>
                  <span>Subtotal</span>
                  <span>Acción</span>
                </div>

                {items.map((item, index) => {
                  const lineSubtotal = item.qty * item.unitPrice;
                  const lineDiscount = lineSubtotal * (item.discount / 100);
                  const taxable = lineSubtotal - lineDiscount;
                  const ivaAmount = taxable * (item.tax / 100);
                  const iepsAmount = taxable * (item.ieps / 100);
                  const retentionAmount = taxable * (item.retention / 100);
                  const lineTotal = taxable + ivaAmount + iepsAmount - retentionAmount;

                  return (
                    <div key={item.id} className="tableGroup">
                      <div className="tableRow">
                        <div className="cell index">{String(index + 1).padStart(2, "0")}</div>
                        <div className="cell">
                          <select value={item.category} onChange={(e) => updateItem(item.id, "category", e.target.value)}>
                            {categoryOptions.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>
                        <div className="cell">
                          <input
                            value={item.name}
                            onChange={(e) => updateItem(item.id, "name", e.target.value)}
                            placeholder="Concepto o partida"
                          />
                        </div>
                        <div className="cell">
                          <input value={item.brand} onChange={(e) => updateItem(item.id, "brand", e.target.value)} placeholder="Marca" />
                        </div>
                        <div className="cell">
                          <input value={item.model} onChange={(e) => updateItem(item.id, "model", e.target.value)} placeholder="Modelo" />
                        </div>
                        <div className="cell">
                          <input value={item.sku} onChange={(e) => updateItem(item.id, "sku", e.target.value)} placeholder="SKU" />
                        </div>
                        <div className="cell">
                          <select value={item.unit} onChange={(e) => updateItem(item.id, "unit", e.target.value)}>
                            {unitOptions.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>
                        <div className="cell">
                          <input type="number" min={1} value={item.qty} onChange={(e) => updateItem(item.id, "qty", Number(e.target.value))} />
                        </div>
                        <div className="cell">
                          <input type="number" min={0} value={item.unitPrice} onChange={(e) => updateItem(item.id, "unitPrice", Number(e.target.value))} />
                        </div>
                        <div className="cell">
                          <input type="number" min={0} max={100} value={item.discount} onChange={(e) => updateItem(item.id, "discount", Number(e.target.value))} />
                        </div>
                        <div className="cell">
                          <input type="number" min={0} max={100} value={item.tax} onChange={(e) => updateItem(item.id, "tax", Number(e.target.value))} />
                        </div>
                        <div className="cell">
                          <input type="number" min={0} max={100} value={item.ieps} onChange={(e) => updateItem(item.id, "ieps", Number(e.target.value))} />
                        </div>
                        <div className="cell">
                          <input type="number" min={0} max={100} value={item.retention} onChange={(e) => updateItem(item.id, "retention", Number(e.target.value))} />
                        </div>
                        <div className="cell total">{formatMoney(lineTotal, meta.currency)}</div>
                        <div className="cell action">
                          <button type="button" className="ghostButton" onClick={() => removeItem(item.id)}>Quitar</button>
                        </div>
                      </div>

                      <div className="detailRow">
                        <label>
                          Descripción
                          <input value={item.description} onChange={(e) => updateItem(item.id, "description", e.target.value)} placeholder="Especificación técnica" />
                        </label>
                        <label>
                          Alcance
                          <input value={item.scope} onChange={(e) => updateItem(item.id, "scope", e.target.value)} placeholder="Incluye / excluye" />
                        </label>
                        <label>
                          No. parte
                          <input value={item.partNumber} onChange={(e) => updateItem(item.id, "partNumber", e.target.value)} placeholder="PN" />
                        </label>
                        <label>
                          Lote/Referencia
                          <input value={item.batchReference} onChange={(e) => updateItem(item.id, "batchReference", e.target.value)} placeholder="Modelo/lote" />
                        </label>
                        <label>
                          Horas MO
                          <input type="number" min={0} value={item.laborHours} onChange={(e) => updateItem(item.id, "laborHours", Number(e.target.value))} />
                        </label>
                        <label>
                          Tarifa MO
                          <input type="number" min={0} value={item.laborRate} onChange={(e) => updateItem(item.id, "laborRate", Number(e.target.value))} />
                        </label>
                        <label>
                          Garantia (meses)
                          <input type="number" min={0} value={item.warrantyMonths} onChange={(e) => updateItem(item.id, "warrantyMonths", Number(e.target.value))} />
                        </label>
                        <label>
                          Entrega
                          <input value={item.deliveryTime} onChange={(e) => updateItem(item.id, "deliveryTime", e.target.value)} placeholder="4-6 semanas" />
                        </label>
                        <label>
                          Origen
                          <input value={item.countryOrigin} onChange={(e) => updateItem(item.id, "countryOrigin", e.target.value)} placeholder="MX/US" />
                        </label>
                        <label>
                          Notas
                          <input value={item.notes} onChange={(e) => updateItem(item.id, "notes", e.target.value)} placeholder="Observaciones" />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="section">
              <h2>Notas y condiciones</h2>
              <textarea
                className="noteArea"
                value={meta.note}
                onChange={(e) => updateMeta("note", e.target.value)}
                rows={4}
              />
            </div>
          </div>

          <aside className="previewCard">
            <div className="previewHeader">
              <div>
                <p className="previewEyebrow">Vista previa</p>
                <h3>Propuesta comercial</h3>
                <p className="previewSub">#{meta.quoteNumber || "Q-2026-001"}</p>
              </div>
              <div className="previewBadge">{meta.currency}</div>
            </div>

            <div className="previewMetaGrid">
              <div>
                <div className="previewLabel">Emision</div>
                <div className="previewValue">{meta.issueDate || "--"}</div>
              </div>
              <div>
                <div className="previewLabel">Vigencia</div>
                <div className="previewValue">{meta.validUntil || "--"}</div>
              </div>
              <div>
                <div className="previewLabel">Entrega</div>
                <div className="previewValue">{meta.deliveryTime || "--"}</div>
              </div>
              <div>
                <div className="previewLabel">Pago</div>
                <div className="previewValue">{meta.paymentTerms || "--"}</div>
              </div>
            </div>

            <div className="previewClient">
              <div>
                <div className="previewLabel">Cliente</div>
                <div className="previewValue">{meta.clientCompany || "Empresa"}</div>
                <div className="previewMeta">{meta.clientName || "Contacto"}</div>
                <div className="previewMeta">{meta.clientEmail || "correo@empresa.com"}</div>
                <div className="previewMeta">{meta.clientPhone || "Teléfono"}</div>
              </div>
              <div>
                <div className="previewLabel">Proyecto</div>
                <div className="previewValue">{meta.projectName || "Proyecto"}</div>
                <div className="previewMeta">{meta.clientAddress || "Dirección"}</div>
                <div className="previewMeta">Estado: {status === "draft" ? "Borrador" : status === "sent" ? "Enviada" : "Aprobada"}</div>
              </div>
            </div>

            <div className="previewScope">
              <div className="previewLabel">Alcance</div>
              <p>{meta.scope}</p>
            </div>

            <div className="previewItems">
              {items.map((item) => {
                const subtotal = item.qty * item.unitPrice;
                const discount = subtotal * (item.discount / 100);
                const taxable = subtotal - discount;
                const total = taxable + taxable * (item.tax / 100) + taxable * (item.ieps / 100) - taxable * (item.retention / 100);
                return (
                  <div key={item.id} className="previewRow">
                    <div>
                      <div className="previewItemName">{item.name}</div>
                      <div className="previewItemMeta">
                        {item.category} · {item.brand || "Marca"} {item.model || "Modelo"} · {item.sku || item.partNumber || "SKU"}
                      </div>
                      <div className="previewItemMeta">{item.qty} {item.unit} x {formatMoney(item.unitPrice, meta.currency)} · Desc {formatPercent(item.discount)}</div>
                    </div>
                    <div className="previewItemAmount">{formatMoney(total, meta.currency)}</div>
                  </div>
                );
              })}
            </div>

            <div className="previewTotals">
              <div>
                <span>Subtotal</span>
                <span>{formatMoney(totals.subtotal, meta.currency)}</span>
              </div>
              <div>
                <span>Descuento</span>
                <span>- {formatMoney(totals.discount, meta.currency)}</span>
              </div>
              <div>
                <span>IVA</span>
                <span>{formatMoney(totals.tax, meta.currency)}</span>
              </div>
              <div>
                <span>IEPS</span>
                <span>{formatMoney(totals.ieps, meta.currency)}</span>
              </div>
              <div>
                <span>Retenciones</span>
                <span>- {formatMoney(totals.retention, meta.currency)}</span>
              </div>
              <div className="previewTotal">
                <span>Total</span>
                <span>{formatMoney(totals.total, meta.currency)}</span>
              </div>
              <div className="previewSplit">
                <div>
                  <span>Anticipo</span>
                  <strong>{formatMoney(depositAmount, meta.currency)}</strong>
                </div>
                <div>
                  <span>Saldo</span>
                  <strong>{formatMoney(balanceAmount, meta.currency)}</strong>
                </div>
              </div>
            </div>

            <div className="previewCategories">
              <div className="previewNoteTitle">Totales por categoria</div>
              {Object.entries(categoryTotals).map(([key, value]) => (
                <div key={key} className="previewCategoryRow">
                  <span>{key}</span>
                  <span>{formatMoney(value, meta.currency)}</span>
                </div>
              ))}
            </div>

            <div className="previewFoot">
              <div className="previewNoteTitle">Notas</div>
              <p>{meta.note}</p>
            </div>

            <div className="previewSignature">
              <div>
                <div className="previewLabel">Preparado por</div>
                <div className="previewValue">{meta.preparedBy}</div>
                <div className="previewMeta">{meta.preparedRole}</div>
                {signUrl && (
                  <div className="previewMeta">Link firma: {signUrl}</div>
                )}
              </div>
              <div className="signatureBox">
                <span>Firma y sello</span>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <style jsx>{`
        /* ── Shell & Header ── */
        .quoteShell {
          display: grid;
          gap: 20px;
          padding: 12px 0 36px;
          position: relative;
        }
        .quoteHeader {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          flex-wrap: wrap;
        }
        .quoteHeader h1 {
          margin: 4px 0;
          font-size: 2rem;
          color: var(--foreground);
        }
        .eyebrow {
          margin: 0;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--text-tertiary);
        }
        .subline {
          margin: 4px 0 0;
          color: var(--text-secondary);
        }
        .headerActions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .statusPill {
          padding: 4px 12px;
          border-radius: 999px;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .statusPill.draft {
          background: var(--state-warning-bg);
          border: 1px solid var(--state-warning-border);
          color: var(--state-warning-text);
        }
        .statusPill.sent {
          background: var(--state-info-bg);
          border: 1px solid var(--state-info-border);
          color: var(--state-info-text);
        }
        .statusPill.approved {
          background: var(--state-success-bg);
          border: 1px solid var(--state-success-border);
          color: var(--state-success-text);
        }
        .ghostButton {
          background: color-mix(in srgb, var(--surface) 94%, transparent);
          border: 1px solid var(--border);
          color: var(--foreground);
          border-radius: 10px;
          padding: 7px 14px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.18s ease, border-color 0.18s ease;
        }
        .ghostButton:hover { background: var(--surface-2); border-color: var(--border-strong); }
        .ghostButton:disabled { opacity: 0.5; cursor: not-allowed; }
        .primaryButton {
          background: linear-gradient(135deg, var(--primary), var(--secondary));
          border: none;
          color: var(--header-text);
          border-radius: 10px;
          padding: 7px 18px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: filter 0.18s ease, transform 0.18s ease;
        }
        .primaryButton:hover { filter: brightness(1.06); transform: translateY(-1px); }
        .primaryButton:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .saveMessage {
          margin: 0;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 0.875rem;
          background: var(--state-info-bg);
          border: 1px solid var(--state-info-border);
          color: var(--state-info-text);
        }
        .statsRow {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        .statCard {
          position: relative;
          background: color-mix(in srgb, var(--surface) 96%, transparent);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 12px 16px 12px 20px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          overflow: hidden;
          box-shadow: var(--elev-1);
        }
        .statCard::before {
          content: "";
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 3px;
          background: var(--primary);
        }
        .statCard span { font-size: 0.78rem; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.06em; }
        .statCard strong { font-size: 1.25rem; font-weight: 700; color: var(--foreground); }
        .statCard.accent { background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 12%, var(--surface)), var(--surface)); border-color: color-mix(in srgb, var(--primary) 30%, var(--border)); }
        .statCard.accent::before { background: linear-gradient(180deg, var(--primary), var(--secondary)); }
        .statCard.accent strong { color: var(--primary); }
        .quoteGrid {
          display: grid;
          grid-template-columns: 1fr 380px;
          align-items: start;
          gap: 20px;
        }
        .editorCard {
          background: color-mix(in srgb, var(--surface) 98%, transparent);
          border: 1px solid var(--border);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: var(--elev-1);
        }
        .section { padding: 20px 24px; border-bottom: 1px solid var(--border); }
        .section:last-child { border-bottom: none; }
        .section h2 { margin: 0 0 14px; font-size: 1.05rem; color: var(--foreground); }
        .sectionHeader { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
        .sectionHeader h2 { margin: 0; }
        .chip { background: color-mix(in srgb, var(--primary) 12%, transparent); border: 1px solid color-mix(in srgb, var(--primary) 26%, transparent); color: var(--primary); border-radius: 999px; padding: 3px 10px; font-size: 0.75rem; font-weight: 600; }
        .sectionActions { display: flex; gap: 8px; }
        .fieldGrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        .field { display: flex; flex-direction: column; gap: 5px; font-size: 0.82rem; color: var(--text-secondary); font-weight: 500; }
        .field input, .field select, .field textarea {
          background: color-mix(in srgb, var(--surface-2) 82%, transparent);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 7px 10px;
          font-size: 0.875rem;
          color: var(--foreground);
          width: 100%;
          transition: border-color 0.18s ease, box-shadow 0.18s ease;
        }
        .field input:focus, .field select:focus, .field textarea:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--focus); }
        .field.full { grid-column: 1 / -1; }
        .noteArea { background: color-mix(in srgb, var(--surface-2) 82%, transparent); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font-size: 0.875rem; color: var(--foreground); width: 100%; resize: vertical; transition: border-color 0.18s ease; }
        .noteArea:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--focus); }
        .tableWrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; }
        .tableHeader { display: grid; grid-template-columns: 36px 100px 1fr 80px 80px 80px 70px 50px 80px 55px 55px 55px 55px 90px 70px; padding: 8px 12px; background: color-mix(in srgb, var(--surface-2) 80%, transparent); border-bottom: 1px solid var(--border); min-width: 1100px; }
        .tableHeader span { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-tertiary); padding: 2px 4px; white-space: nowrap; }
        .tableGroup { border-bottom: 1px solid var(--border); min-width: 1100px; }
        .tableGroup:last-child { border-bottom: none; }
        .tableRow { display: grid; grid-template-columns: 36px 100px 1fr 80px 80px 80px 70px 50px 80px 55px 55px 55px 55px 90px 70px; padding: 6px 12px; align-items: center; }
        .cell { padding: 2px 4px; }
        .cell input, .cell select { background: color-mix(in srgb, var(--surface-2) 60%, transparent); border: 1px solid var(--border); border-radius: 6px; padding: 5px 6px; font-size: 0.8rem; color: var(--foreground); width: 100%; min-width: 0; }
        .cell input:focus, .cell select:focus { outline: none; border-color: var(--primary); }
        .cell.index { color: var(--text-tertiary); font-size: 0.75rem; font-weight: 600; text-align: center; }
        .cell.total { font-weight: 700; font-size: 0.82rem; color: var(--primary); white-space: nowrap; }
        .cell.action { display: flex; justify-content: center; }
        .detailRow { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; padding: 8px 12px 12px; background: color-mix(in srgb, var(--surface-2) 40%, transparent); border-top: 1px solid var(--border); }
        .detailRow label { display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem; color: var(--text-tertiary); }
        .detailRow label input { background: color-mix(in srgb, var(--surface) 80%, transparent); border: 1px solid var(--border); border-radius: 6px; padding: 5px 8px; font-size: 0.8rem; color: var(--foreground); width: 100%; }
        .detailRow label input:focus { outline: none; border-color: var(--primary); }
        .previewCard { background: color-mix(in srgb, var(--surface) 96%, transparent); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; position: sticky; top: 20px; max-height: calc(100vh - 80px); overflow-y: auto; box-shadow: var(--elev-1); }
        .previewHeader { display: flex; justify-content: space-between; align-items: flex-start; padding: 16px 20px; background: linear-gradient(135deg, var(--primary), var(--secondary)); color: var(--header-text); }
        .previewHeader h3 { margin: 4px 0; font-size: 1rem; color: var(--header-text); }
        .previewEyebrow { margin: 0; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.8; }
        .previewSub { margin: 2px 0 0; font-size: 0.8rem; opacity: 0.85; }
        .previewBadge { background: rgba(255,255,255,0.22); border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; padding: 6px 12px; font-size: 0.85rem; font-weight: 700; }
        .previewMetaGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border); }
        .previewMetaGrid > div { background: color-mix(in srgb, var(--surface) 96%, transparent); padding: 8px 12px; }
        .previewLabel { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-tertiary); margin-bottom: 2px; }
        .previewValue { font-size: 0.85rem; font-weight: 600; color: var(--foreground); }
        .previewMeta { font-size: 0.77rem; color: var(--text-secondary); margin-top: 2px; }
        .previewClient { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border); }
        .previewClient > div { background: color-mix(in srgb, var(--surface) 96%, transparent); padding: 10px 12px; }
        .previewScope { padding: 10px 12px; border-bottom: 1px solid var(--border); }
        .previewScope p { margin: 4px 0 0; font-size: 0.82rem; color: var(--text-secondary); }
        .previewItems { border-bottom: 1px solid var(--border); }
        .previewRow { display: flex; justify-content: space-between; align-items: flex-start; padding: 8px 12px; gap: 8px; border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent); }
        .previewRow:last-child { border-bottom: none; }
        .previewItemName { font-size: 0.875rem; font-weight: 600; color: var(--foreground); }
        .previewItemMeta { font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px; }
        .previewItemAmount { font-size: 0.875rem; font-weight: 700; color: var(--primary); white-space: nowrap; }
        .previewTotals { padding: 12px; border-bottom: 1px solid var(--border); display: grid; gap: 4px; }
        .previewTotals > div { display: flex; justify-content: space-between; font-size: 0.82rem; color: var(--text-secondary); }
        .previewTotal { display: flex; justify-content: space-between; border-top: 1px solid var(--border); margin-top: 6px; padding-top: 8px; }
        .previewTotal span { font-size: 1rem; font-weight: 700; color: var(--foreground); }
        .previewSplit { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 8px 12px; background: color-mix(in srgb, var(--surface-2) 60%, transparent); border-bottom: 1px solid var(--border); }
        .previewSplit > div { display: flex; flex-direction: column; gap: 2px; }
        .previewSplit span { font-size: 0.72rem; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.06em; }
        .previewSplit strong { font-size: 0.95rem; color: var(--primary); font-weight: 700; }
        .previewCategories { padding: 10px 12px; border-bottom: 1px solid var(--border); }
        .previewNoteTitle { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-tertiary); margin-bottom: 6px; font-weight: 600; }
        .previewCategoryRow { display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-secondary); padding: 3px 0; border-bottom: 1px solid color-mix(in srgb, var(--border) 40%, transparent); }
        .previewCategoryRow:last-child { border-bottom: none; }
        .previewFoot { padding: 10px 12px; border-bottom: 1px solid var(--border); }
        .previewFoot p { margin: 4px 0 0; font-size: 0.82rem; color: var(--text-secondary); }
        .previewSignature { display: flex; justify-content: space-between; align-items: flex-end; padding: 12px; gap: 12px; }
        .signatureBox { width: 120px; height: 60px; border: 2px dashed var(--border-strong); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; color: var(--text-tertiary); flex-shrink: 0; }
        @media (max-width: 1100px) {
          .quoteGrid { grid-template-columns: 1fr; }
          .previewCard { position: static; max-height: none; }
        }
        @media (max-width: 700px) {
          .statsRow { grid-template-columns: repeat(2, 1fr); }
          .fieldGrid { grid-template-columns: 1fr; }
          .detailRow { grid-template-columns: repeat(2, 1fr); }
          .quoteHeader { flex-direction: column; }
          .headerActions { width: 100%; }
        }
      `}</style>
    </RoleGuard>
  );
}




