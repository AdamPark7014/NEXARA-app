"use client";

import Link from "next/link";
import { useState } from "react";
import type { CSSProperties } from "react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import MetricStrip, { type Metric } from "@/components/ui/MetricStrip";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import { createSalesQuote, linkSalesQuoteToOpportunity } from "@/lib/sales-api";
import { DetailError, DetailSection, formatDateTime } from "@/components/detail/DetailFrame";
import { FinanceField, FinanceFormGrid, financeInputStyle } from "@/components/finance/FinanceModuleShell";
import { useOpportunityDetail } from "@/components/crm/OpportunityDetailShell";
import { toast } from "@/components/Toast";
import styles from "./quotes.module.css";

interface LineItem { name: string; qty: number; unitPrice: number; discount: number; tax: number }
const emptyItem = (): LineItem => ({ name: "", qty: 1, unitPrice: 0, discount: 0, tax: 16 });

const EMPTY_FORM = { projectName: "", validDays: 15, notes: "" };

/** Controles de partida: el mismo input de finanzas, más corto y a la derecha. */
const celdaInput: CSSProperties = { ...financeInputStyle, padding: "6px 8px", fontSize: 12.5 };
const celdaNum: CSSProperties = { ...celdaInput, textAlign: "right" };

function fmtMXN(n: number) {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function OpportunityQuotesPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const { opportunity, error, reload } = useOpportunityDetail();

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [lines, setLines] = useState<LineItem[]>([emptyItem()]);

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!opportunity) return null;

  const addLine = () => setLines((l) => [...l, emptyItem()]);
  const removeLine = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));
  const setLine = (i: number, patch: Partial<LineItem>) =>
    setLines((l) => l.map((it, idx) => idx === i ? { ...it, ...patch } : it));

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const discTotal = lines.reduce((s, l) => s + l.qty * l.unitPrice * (l.discount / 100), 0);
  const taxTotal = lines.reduce((s, l) => { const b = l.qty * l.unitPrice * (1 - l.discount / 100); return s + b * (l.tax / 100); }, 0);
  const total = subtotal - discTotal + taxTotal;

  const cerrarForm = () => {
    setShowForm(false);
    setForm({ ...EMPTY_FORM });
    setLines([emptyItem()]);
  };

  const createQuote = async () => {
    const validLines = lines.filter((l) => l.name.trim() && l.unitPrice > 0);
    if (!token || validLines.length === 0) return;
    setSaving(true);
    try {
      const clientName = opportunity.client?.name ?? opportunity.clientName ?? "";
      const quoteNumber = `COT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`;
      const created = await createSalesQuote(token, {
        quoteNumber,
        issueDate: new Date().toISOString().slice(0, 10),
        validUntil: new Date(Date.now() + form.validDays * 86400000).toISOString().slice(0, 10),
        clientCompany: clientName,
        projectName: form.projectName.trim() || opportunity.title,
        items: validLines.map((l) => ({ name: l.name.trim(), qty: l.qty, unitPrice: l.unitPrice, discount: l.discount, tax: l.tax })),
      }) as { id: number };
      if (created?.id) {
        await linkSalesQuoteToOpportunity(token, created.id, opportunity.id, `v${(opportunity.quotes?.length ?? 0) + 1}`);
      }
      cerrarForm();
      reload();
    } catch (e) {
      toast.error("Error: " + (e instanceof Error ? e.message : "desconocido"));
    } finally { setSaving(false); }
  };

  const quotes = opportunity.quotes ?? [];
  /** Regla 7: el vacío es cero versiones vinculadas, no un importe en cero. */
  const sinRegistros = quotes.length === 0;
  const conDoc = quotes.filter((q) => !!q.cotizacionId).length;
  const conPdf = quotes.filter((q) => !!q.pdfUrl).length;
  const sinPdf = quotes.length - conPdf;

  const metrics: Metric[] = [
    { label: "Versiones", value: quotes.length, hint: "vinculadas a la oportunidad" },
    { label: "Con documento", value: conDoc, hint: "abren el detalle" },
    { label: "Con PDF", value: conPdf, hint: "listas para enviar" },
    {
      label: "Sin PDF",
      value: sinPdf,
      hint: sinPdf > 0 ? "falta generarlo" : "ninguna pendiente",
      tone: sinPdf > 0 ? "warning" : "default",
    },
  ];

  const puedeGuardar = lines.filter((l) => l.name.trim() && l.unitPrice > 0).length > 0;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Regla 7: sin versiones no se pinta la tira. Y las mismas tres cifras
          no se repiten en una gráfica de barras debajo: ya están aquí. */}
      {!sinRegistros && <MetricStrip metrics={metrics} ariaLabel="Resumen de cotizaciones de la oportunidad" />}

      <DetailSection title="Cotizaciones vinculadas">
        {/* Regla 8: una sola fila, sin caja, con el primario a la derecha. El
            cliente ya está en la cabecera de la oportunidad: repetirlo aquí
            no informaba de nada. Con el formulario abierto, el primario es
            «Crear y vincular»: no hay dos. */}
        {!sinRegistros && !showForm && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
              Nueva cotización
            </Button>
          </div>
        )}

        {sinRegistros && !showForm ? (
          <EmptyState
            title="Sin cotizaciones vinculadas"
            description="Cada versión que captures aquí se crea como cotización y queda ligada a esta oportunidad, para seguir el histórico de lo que se le ofreció al cliente."
            action={
              <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
                Nueva cotización
              </Button>
            }
          />
        ) : quotes.length > 0 ? (
          <ul className={styles.lista}>
            {quotes.map((q) => (
              <li key={q.id} className={styles.version}>
                <div className={styles.versionCopy}>
                  <div className={styles.versionTitulo}>{q.versionLabel?.trim() || `Cotización #${q.id}`}</div>
                  <div className={styles.versionMeta}>
                    {formatDateTime(q.createdAt)}
                    {q.cotizacionId ? ` · Doc #${q.cotizacionId}` : ""}
                  </div>
                </div>
                <div className={styles.versionAcciones}>
                  {q.pdfUrl && (
                    <a
                      href={buildApiUrl(q.pdfUrl.replace(/^\//, ""))}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.versionEnlace}
                    >
                      Abrir PDF
                    </a>
                  )}
                  {q.cotizacionId && (
                    <Link href={`/crm/quotes/${q.cotizacionId}`} className={styles.versionEnlace}>
                      Ver detalle
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {/* ── Captura de una versión nueva ─────────────────────────────────
            Una sola caja: antes eran tres (sección → panel → recuadro de
            partidas) y ninguna añadía jerarquía. */}
        {showForm && (
          <div className={styles.form}>
            <h3 className={styles.formTitulo}>Nueva cotización para {opportunity.title}</h3>

            <FinanceFormGrid>
              <FinanceField label="Nombre del proyecto" optional hint="Si lo dejas vacío se usa el título de la oportunidad.">
                <input
                  value={form.projectName}
                  onChange={(e) => setForm((f) => ({ ...f, projectName: e.target.value }))}
                  placeholder={opportunity.title}
                  style={financeInputStyle}
                />
              </FinanceField>
              <FinanceField label="Vigencia" hint="Días que la cotización sigue siendo válida.">
                <input
                  type="number"
                  min={1}
                  value={form.validDays}
                  onChange={(e) => setForm((f) => ({ ...f, validDays: Number(e.target.value) }))}
                  style={{ ...financeInputStyle, textAlign: "right" }}
                />
              </FinanceField>
            </FinanceFormGrid>

            <div>
              <p className={styles.rotulo}>Partidas</p>
              <div className={styles.partidas}>
                <div className={styles.partidaCabeza} aria-hidden="true">
                  <span>Descripción</span>
                  <span className={styles.centro}>Cant.</span>
                  <span className={styles.derecha}>P. unit.</span>
                  <span className={styles.centro}>Dto %</span>
                  <span className={styles.centro}>IVA %</span>
                  <span />
                </div>
                {lines.map((line, i) => (
                  <div key={i} className={styles.partidaFila}>
                    {/* Cada control lleva nombre accesible: en móvil la
                        cabecera desaparece y sin esto no se sabe qué es qué. */}
                    <input
                      value={line.name}
                      onChange={(e) => setLine(i, { name: e.target.value })}
                      placeholder={`Partida ${i + 1}`}
                      aria-label={`Descripción de la partida ${i + 1}`}
                      style={celdaInput}
                    />
                    <input
                      type="number" min={1} value={line.qty}
                      onChange={(e) => setLine(i, { qty: Number(e.target.value) })}
                      aria-label={`Cantidad de la partida ${i + 1}`}
                      style={celdaNum}
                    />
                    <input
                      type="number" min={0} step={0.01} value={line.unitPrice}
                      onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })}
                      aria-label={`Precio unitario de la partida ${i + 1}`}
                      style={celdaNum}
                    />
                    <input
                      type="number" min={0} max={100} value={line.discount}
                      onChange={(e) => setLine(i, { discount: Number(e.target.value) })}
                      aria-label={`Descuento de la partida ${i + 1}`}
                      style={celdaNum}
                    />
                    <input
                      type="number" min={0} max={100} value={line.tax}
                      onChange={(e) => setLine(i, { tax: Number(e.target.value) })}
                      aria-label={`IVA de la partida ${i + 1}`}
                      style={celdaNum}
                    />
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      disabled={lines.length === 1}
                      aria-label={`Quitar la partida ${i + 1}`}
                      className={styles.quitar}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Button size="sm" variant="secondary" onClick={addLine} iconLeft="+">Agregar partida</Button>
            </div>

            <div className={styles.totales}>
              <div>Subtotal: {fmtMXN(subtotal)}</div>
              {discTotal > 0 && <div className={styles.totalDescuento}>Descuento: −{fmtMXN(discTotal)}</div>}
              <div>IVA: {fmtMXN(taxTotal)}</div>
              <div className={styles.totalFinal}>Total: {fmtMXN(total)}</div>
            </div>

            <div className={styles.formPie}>
              <Button size="sm" variant="secondary" onClick={cerrarForm}>Cancelar</Button>
              <Button size="sm" variant="primary" onClick={() => void createQuote()} disabled={saving || !puedeGuardar}>
                {saving ? "Creando…" : "Crear y vincular"}
              </Button>
            </div>
          </div>
        )}
      </DetailSection>
    </div>
  );
}
