"use client";
import { buildApiUrl } from "@/lib/api-base";
import React, { useMemo, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { PERMISSIONS } from "@/lib/permissions";
import { useUser } from "@/components/UserContext";

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
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cotizacion-${saved.quoteNumber || saved.id}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
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
                          Descripcion
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

      <style jsx>{``}</style>
    </RoleGuard>
  );
}




