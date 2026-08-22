"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import CatalogPicker from "@/components/CatalogPicker";
import { useUser } from "@/components/UserContext";
import {
  getSalesQuoteDetail,
  listSalesClients,
  updateSalesQuote,
  type SalesClient,
} from "@/lib/sales-api";
import { smartQuoteSearch, type SmartOffer } from "@/lib/smart-quote-api";
import type { CatalogProduct } from "@/lib/catalog-api";
import styles from "../../quotes.module.css";

type LineItem = {
  name: string;
  description: string;
  brand: string;
  model: string;
  sku: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
  discount: number;
  tax: number;
  laborHours: number;
  laborRate: number;
  deliveryTime: string;
};

const emptyLine = (): LineItem => ({
  name: "",
  description: "",
  brand: "",
  model: "",
  sku: "",
  qty: 1,
  unitPrice: 0,
  unitCost: 0,
  discount: 0,
  tax: 16,
  laborHours: 0,
  laborRate: 0,
  deliveryTime: "",
});

function money(n: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(n || 0);
}

function lineTotal(it: LineItem) {
  const product = it.qty * it.unitPrice;
  const labor = (it.laborHours || 0) * (it.laborRate || 0);
  const sub = product + labor;
  const disc = sub * ((it.discount || 0) / 100);
  const taxable = sub - disc;
  return taxable + taxable * ((it.tax || 0) / 100);
}

function ctThumb(src: string | null | undefined) {
  if (!src?.trim()) return null;
  try {
    const u = new URL(src.trim());
    if (u.protocol === "http:") u.protocol = "https:";
    if (u.hostname !== "static.ctonline.mx") return src.trim();
    return `/ct-media?u=${encodeURIComponent(u.toString())}`;
  } catch {
    return src.trim();
  }
}

export default function EditQuotePage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const quoteId = Number(params.id);

  const [loadingQuote, setLoadingQuote] = useState(true);
  const [quoteNumber, setQuoteNumber] = useState("");
  const [quoteStatus, setQuoteStatus] = useState("DRAFT");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [clients, setClients] = useState<SalesClient[]>([]);
  const [clientQuery, setClientQuery] = useState("");
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const clientBoxRef = useRef<HTMLDivElement>(null);

  const [salesClientId, setSalesClientId] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [projectName, setProjectName] = useState("");
  const [scope, setScope] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("50% anticipo · 50% contra entrega");
  const [deliveryTime, setDeliveryTime] = useState("Según disponibilidad de almacén");
  const [depositPercent, setDepositPercent] = useState(50);
  const [validDays, setValidDays] = useState(15);
  const [notes, setNotes] = useState("");

  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [ctOpen, setCtOpen] = useState(false);
  const [ctQuery, setCtQuery] = useState("");
  const [ctLoading, setCtLoading] = useState(false);
  const [ctOffers, setCtOffers] = useState<SmartOffer[]>([]);

  useEffect(() => {
    if (!token) return;
    listSalesClients(token).then(setClients).catch(() => setClients([]));
  }, [token]);

  useEffect(() => {
    if (!token || !quoteId) return;
    setLoadingQuote(true);
    setLoadError(null);
    getSalesQuoteDetail(token, quoteId)
      .then((raw) => {
        const q = raw as {
          quoteNumber?: string;
          status?: string;
          salesClientId?: number | null;
          clientCompany?: string | null;
          clientName?: string | null;
          clientEmail?: string | null;
          clientPhone?: string | null;
          clientAddress?: string | null;
          projectName?: string | null;
          scope?: string | null;
          paymentTerms?: string | null;
          deliveryTime?: string | null;
          depositPercent?: number | null;
          note?: string | null;
          validUntil?: string | null;
          issueDate?: string;
          items?: Array<Record<string, unknown>>;
        };
        if (q.status && q.status !== "DRAFT") {
          setLoadError("Solo se pueden editar cotizaciones en borrador.");
          setQuoteStatus(q.status);
          setQuoteNumber(q.quoteNumber || "");
          return;
        }
        setQuoteNumber(q.quoteNumber || "");
        setQuoteStatus(q.status || "DRAFT");
        setSalesClientId(q.salesClientId ? String(q.salesClientId) : "");
        setClientCompany(q.clientCompany || "");
        setClientName(q.clientName || "");
        setClientEmail(q.clientEmail || "");
        setClientPhone(q.clientPhone || "");
        setClientAddress(q.clientAddress || "");
        setClientQuery(q.clientCompany || q.clientName || "");
        setProjectName(q.projectName || "");
        setScope(q.scope || "");
        setPaymentTerms(q.paymentTerms || "50% anticipo · 50% contra entrega");
        setDeliveryTime(q.deliveryTime || "Según disponibilidad de almacén");
        setDepositPercent(Number(q.depositPercent ?? 50));
        setNotes(q.note || "");
        if (q.validUntil && q.issueDate) {
          const days = Math.max(
            1,
            Math.ceil(
              (new Date(String(q.validUntil).slice(0, 10)).getTime() -
                new Date(String(q.issueDate).slice(0, 10)).getTime()) /
                86400000,
            ),
          );
          setValidDays(days);
        }
        const mapped = (q.items || []).map((it) => ({
          name: String(it.name || ""),
          description: String(it.description || ""),
          brand: String(it.brand || ""),
          model: String(it.model || ""),
          sku: String(it.sku || ""),
          qty: Number(it.qty) || 1,
          unitPrice: Number(it.unitPrice) || 0,
          unitCost: Number(it.unitCost) || 0,
          discount: Number(it.discount) || 0,
          tax: Number(it.tax) || 16,
          laborHours: Number(it.laborHours) || 0,
          laborRate: Number(it.laborRate) || 0,
          deliveryTime: String(it.deliveryTime || ""),
        }));
        setLines(mapped.length ? mapped : [emptyLine()]);
      })
      .catch((e) => {
        setLoadError(e instanceof Error ? e.message : "No se pudo cargar la cotización");
      })
      .finally(() => setLoadingQuote(false));
  }, [token, quoteId]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!clientBoxRef.current?.contains(e.target as Node)) setClientMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return clients.slice(0, 12);
    return clients
      .filter((c) => {
        const hay = `${c.name} ${c.legalName ?? ""} ${c.billingEmail ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 12);
  }, [clients, clientQuery]);

  const selectClient = (c: SalesClient) => {
    setSalesClientId(String(c.id));
    setClientCompany(c.legalName?.trim() || c.name);
    setClientEmail(c.billingEmail ?? "");
    setClientPhone(c.billingPhone ?? "");
    setClientAddress(c.fiscalAddress ?? "");
    setClientQuery(c.legalName?.trim() || c.name);
    setClientMenuOpen(false);
  };

  const setLine = (i: number, patch: Partial<LineItem>) =>
    setLines((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (i: number) =>
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const addFromCatalog = (p: CatalogProduct) => {
    setLines((prev) => [
      ...prev.filter((l) => l.name.trim() || l.unitPrice > 0),
      {
        ...emptyLine(),
        name: p.name,
        description: p.description || "",
        brand: p.brand?.name || "",
        sku: p.sku || "",
        unitPrice: Number(p.price) || 0,
      },
    ]);
  };

  const addFromCt = (o: SmartOffer) => {
    setLines((prev) => [
      ...prev.filter((l) => l.name.trim() || l.unitPrice > 0),
      {
        ...emptyLine(),
        name: o.nombre || o.clave || "Producto CT",
        description: o.descripcion || "",
        brand: o.marca || "",
        model: o.modelo || "",
        sku: o.clave || "",
        unitPrice: o.sellPriceSuggested || 0,
        unitCost: o.costMxn || 0,
        deliveryTime: o.leadTimeDays <= 1 ? "Inmediata" : `${o.leadTimeDays} días`,
      },
    ]);
    setCtOpen(false);
  };

  const runCtSearch = useCallback(async () => {
    if (!token || !ctQuery.trim()) return;
    setCtLoading(true);
    try {
      const res = await smartQuoteSearch(token, {
        q: ctQuery.trim(),
        optimize: "BALANCE",
        take: 12,
      });
      setCtOffers(res.data || []);
    } catch {
      setCtOffers([]);
    } finally {
      setCtLoading(false);
    }
  }, [token, ctQuery]);

  const subtotal = lines.reduce((s, it) => s + it.qty * it.unitPrice + it.laborHours * it.laborRate, 0);
  const discountTotal = lines.reduce((s, it) => {
    const base = it.qty * it.unitPrice + it.laborHours * it.laborRate;
    return s + base * (it.discount / 100);
  }, 0);
  const taxTotal = lines.reduce((s, it) => {
    const base = (it.qty * it.unitPrice + it.laborHours * it.laborRate) * (1 - it.discount / 100);
    return s + base * (it.tax / 100);
  }, 0);
  const total = subtotal - discountTotal + taxTotal;
  const costTotal = lines.reduce((s, it) => s + it.qty * (it.unitCost || 0), 0);
  const marginPct = total > 0 && costTotal > 0 ? Math.round(((total / 1.16 - costTotal) / (total / 1.16)) * 100) : null;

  const validLines = lines.filter((l) => l.name.trim() && l.unitPrice > 0);
  const readyClient = Boolean(clientCompany.trim());
  const readyLines = validLines.length > 0;

  const save = async () => {
    if (!token || !readyClient || !readyLines || !quoteId) return;
    setSaving(true);
    setError(null);
    try {
      const validUntil = new Date(Date.now() + validDays * 86400000).toISOString().slice(0, 10);
      await updateSalesQuote(token, quoteId, {
        validUntil,
        salesClientId: salesClientId ? Number(salesClientId) : undefined,
        clientCompany: clientCompany.trim(),
        clientName: clientName.trim() || undefined,
        clientEmail: clientEmail.trim() || undefined,
        clientPhone: clientPhone.trim() || undefined,
        clientAddress: clientAddress.trim() || undefined,
        projectName: projectName.trim() || undefined,
        scope: scope.trim() || undefined,
        paymentTerms: paymentTerms.trim() || undefined,
        deliveryTime: deliveryTime.trim() || undefined,
        depositPercent,
        note: notes.trim() || undefined,
        preparedBy: user?.nombre || undefined,
        items: validLines.map((l) => ({
          name: l.name.trim(),
          description: l.description.trim() || undefined,
          brand: l.brand.trim() || undefined,
          model: l.model.trim() || undefined,
          sku: l.sku.trim() || undefined,
          qty: l.qty,
          unitPrice: l.unitPrice,
          unitCost: l.unitCost > 0 ? l.unitCost : undefined,
          discount: l.discount,
          tax: l.tax,
          laborHours: l.laborHours || undefined,
          laborRate: l.laborRate || undefined,
          deliveryTime: l.deliveryTime.trim() || undefined,
          marginPercent:
            l.unitCost > 0 && l.unitPrice > 0
              ? Math.round(((l.unitPrice - l.unitCost) / l.unitPrice) * 1000) / 10
              : undefined,
        })),
      });
      router.push(`/crm/quotes/${quoteId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la cotización");
    } finally {
      setSaving(false);
    }
  };

  if (loadingQuote) {
    return <EmptyState icon="⏳" title="Cargando cotización…" description="Preparando el editor." />;
  }

  if (loadError) {
    return (
      <EmptyState
        icon="⚠️"
        title="No se puede editar"
        description={loadError}
        action={
          <Link href={`/crm/quotes/${quoteId || ""}`}>
            <Button variant="secondary">Volver al detalle</Button>
          </Link>
        }
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Link href="/crm/quotes" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
              Cotizaciones
            </Link>
            {" / "}
            <Link href={`/crm/quotes/${quoteId}`} style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
              {quoteNumber || quoteId}
            </Link>
            {" / "}Editar
          </>
        }
        title={`Editar ${quoteNumber || "borrador"}`}
        subtitle="Ajusta cliente, partidas y condiciones. Solo disponible en estado borrador."
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href={`/crm/quotes/${quoteId}`}>
              <Button variant="ghost">Cancelar</Button>
            </Link>
          </div>
        }
      />

      <div className={styles.quotesCoach}>
        <div className={styles.quotesCoachIcon}>✏️</div>
        <div>
          <p className={styles.quotesCoachTitle}>Editando borrador ({quoteStatus})</p>
          <p className={styles.quotesCoachText}>
            Los cambios reemplazan las partidas actuales. Al guardar, el PDF se regenera con la nueva
            información.
          </p>
        </div>
      </div>

      <div className={styles.quotesLayout}>
        <div className={styles.quotesMain}>
          <section className={styles.quotesCard}>
            <div className={styles.quotesCardHead}>
              <div>
                <h2 className={styles.quotesCardTitle}>1. Cliente y proyecto</h2>
                <p className={styles.quotesCardHint}>Busca en cartera o captura datos nuevos.</p>
              </div>
            </div>

            <div className={styles.quotesFieldGrid}>
              <div className={`${styles.quotesFieldFull} ${styles.quotesClientSearch}`} ref={clientBoxRef}>
                <label className={styles.quotesLabel}>Cliente en cartera</label>
                <input
                  className={styles.quotesInput}
                  value={clientQuery}
                  placeholder="Escribe para filtrar clientes…"
                  onFocus={() => setClientMenuOpen(true)}
                  onChange={(e) => {
                    setClientQuery(e.target.value);
                    setClientMenuOpen(true);
                    if (!e.target.value) setSalesClientId("");
                  }}
                />
                {clientMenuOpen && filteredClients.length > 0 && (
                  <div className={styles.quotesClientMenu}>
                    {filteredClients.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={styles.quotesClientOption}
                        onClick={() => selectClient(c)}
                      >
                        <strong>{c.legalName?.trim() || c.name}</strong>
                        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
                          {[c.billingEmail, c.billingPhone].filter(Boolean).join(" · ")}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.quotesFieldFull}>
                <label className={styles.quotesLabel}>Empresa / razón social *</label>
                <input
                  className={styles.quotesInput}
                  value={clientCompany}
                  onChange={(e) => setClientCompany(e.target.value)}
                  placeholder="Empresa S.A. de C.V."
                />
              </div>
              <div>
                <label className={styles.quotesLabel}>Contacto</label>
                <input
                  className={styles.quotesInput}
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Nombre"
                />
              </div>
              <div>
                <label className={styles.quotesLabel}>Email</label>
                <input
                  className={styles.quotesInput}
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="correo@empresa.com"
                />
              </div>
              <div>
                <label className={styles.quotesLabel}>Teléfono</label>
                <input
                  className={styles.quotesInput}
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="10 dígitos"
                />
              </div>
              <div>
                <label className={styles.quotesLabel}>Proyecto / obra</label>
                <input
                  className={styles.quotesInput}
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Ej. CCTV tienda 12"
                />
              </div>
              <div className={styles.quotesFieldFull}>
                <label className={styles.quotesLabel}>Dirección</label>
                <input
                  className={styles.quotesInput}
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  placeholder="Calle, colonia, ciudad"
                />
              </div>
              <div className={styles.quotesFieldFull}>
                <label className={styles.quotesLabel}>Alcance del proyecto</label>
                <textarea
                  className={styles.quotesTextarea}
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  placeholder="Qué incluye la propuesta (equipo, instalación, configuración…)"
                />
              </div>
            </div>
          </section>

          <section className={styles.quotesCard}>
            <div className={styles.quotesCardHead}>
              <div>
                <h2 className={styles.quotesCardTitle}>2. Partidas</h2>
                <p className={styles.quotesCardHint}>Agrega desde catálogo Nexara, mayorista CT o captura libre.</p>
              </div>
              <div className={styles.quotesToolbar}>
                <Button size="sm" variant="secondary" onClick={() => setCatalogOpen(true)}>
                  Catálogo
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setCtOpen(true)}>
                  Buscar CT
                </Button>
                <Button size="sm" variant="ghost" onClick={addLine} iconLeft="+">
                  Línea
                </Button>
              </div>
            </div>

            {lines.map((line, i) => (
              <article key={i} className={styles.quotesLineCard}>
                <div className={styles.quotesLineTop}>
                  <div style={{ minWidth: 0 }}>
                    <label className={styles.quotesLabel}>Descripción / producto *</label>
                    <input
                      className={styles.quotesInput}
                      value={line.name}
                      onChange={(e) => setLine(i, { name: e.target.value })}
                      placeholder={`Partida ${i + 1}`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    disabled={lines.length === 1}
                    style={{
                      marginTop: 22,
                      border: 0,
                      background: "transparent",
                      color: "var(--text-tertiary)",
                      cursor: lines.length > 1 ? "pointer" : "default",
                      opacity: lines.length > 1 ? 1 : 0.35,
                      fontSize: 18,
                    }}
                    aria-label="Quitar partida"
                  >
                    ✕
                  </button>
                </div>

                <div className={styles.quotesLineMeta}>
                  <div>
                    <label className={styles.quotesLabel}>Cantidad</label>
                    <input
                      className={styles.quotesInput}
                      type="number"
                      min={1}
                      value={line.qty}
                      onChange={(e) => setLine(i, { qty: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </div>
                  <div>
                    <label className={styles.quotesLabel}>Precio unitario</label>
                    <input
                      className={styles.quotesInput}
                      type="number"
                      min={0}
                      step={0.01}
                      value={line.unitPrice}
                      onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className={styles.quotesLabel}>Dto %</label>
                    <input
                      className={styles.quotesInput}
                      type="number"
                      min={0}
                      max={100}
                      value={line.discount}
                      onChange={(e) => setLine(i, { discount: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className={styles.quotesLabel}>IVA %</label>
                    <input
                      className={styles.quotesInput}
                      type="number"
                      min={0}
                      max={100}
                      value={line.tax}
                      onChange={(e) => setLine(i, { tax: Number(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div className={styles.quotesLineExtra}>
                  <div>
                    <label className={styles.quotesLabel}>Marca</label>
                    <input
                      className={styles.quotesInput}
                      value={line.brand}
                      onChange={(e) => setLine(i, { brand: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={styles.quotesLabel}>Modelo / SKU</label>
                    <input
                      className={styles.quotesInput}
                      value={line.sku || line.model}
                      onChange={(e) => setLine(i, { sku: e.target.value, model: e.target.value })}
                      placeholder="SKU o modelo"
                    />
                  </div>
                  <div>
                    <label className={styles.quotesLabel}>Costo interno</label>
                    <input
                      className={styles.quotesInput}
                      type="number"
                      min={0}
                      step={0.01}
                      value={line.unitCost}
                      onChange={(e) => setLine(i, { unitCost: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className={styles.quotesLabel}>Entrega partida</label>
                    <input
                      className={styles.quotesInput}
                      value={line.deliveryTime}
                      onChange={(e) => setLine(i, { deliveryTime: e.target.value })}
                      placeholder="Inmediata / 3 días"
                    />
                  </div>
                  <div>
                    <label className={styles.quotesLabel}>Horas MO</label>
                    <input
                      className={styles.quotesInput}
                      type="number"
                      min={0}
                      step={0.5}
                      value={line.laborHours}
                      onChange={(e) => setLine(i, { laborHours: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className={styles.quotesLabel}>Tarifa MO / h</label>
                    <input
                      className={styles.quotesInput}
                      type="number"
                      min={0}
                      step={1}
                      value={line.laborRate}
                      onChange={(e) => setLine(i, { laborRate: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className={styles.quotesFieldFull}>
                    <label className={styles.quotesLabel}>Detalle técnico</label>
                    <textarea
                      className={styles.quotesTextarea}
                      value={line.description}
                      onChange={(e) => setLine(i, { description: e.target.value })}
                      placeholder="Especificaciones, notas para el PDF…"
                      rows={2}
                    />
                  </div>
                </div>

                <div className={styles.quotesLineTotal}>Línea: {money(lineTotal(line))}</div>
              </article>
            ))}
          </section>

          <section className={styles.quotesCard}>
            <div className={styles.quotesCardHead}>
              <div>
                <h2 className={styles.quotesCardTitle}>3. Condiciones comerciales</h2>
                <p className={styles.quotesCardHint}>Quedan en el PDF y en el detalle de la cotización.</p>
              </div>
            </div>
            <div className={styles.quotesFieldGrid}>
              <div>
                <label className={styles.quotesLabel}>Vigencia (días)</label>
                <input
                  className={styles.quotesInput}
                  type="number"
                  min={1}
                  max={365}
                  value={validDays}
                  onChange={(e) => setValidDays(Math.max(1, Number(e.target.value) || 15))}
                />
              </div>
              <div>
                <label className={styles.quotesLabel}>Anticipo %</label>
                <input
                  className={styles.quotesInput}
                  type="number"
                  min={0}
                  max={100}
                  value={depositPercent}
                  onChange={(e) => setDepositPercent(Number(e.target.value) || 0)}
                />
              </div>
              <div className={styles.quotesFieldFull}>
                <label className={styles.quotesLabel}>Condiciones de pago</label>
                <input
                  className={styles.quotesInput}
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                />
              </div>
              <div className={styles.quotesFieldFull}>
                <label className={styles.quotesLabel}>Tiempo de entrega</label>
                <input
                  className={styles.quotesInput}
                  value={deliveryTime}
                  onChange={(e) => setDeliveryTime(e.target.value)}
                />
              </div>
              <div className={styles.quotesFieldFull}>
                <label className={styles.quotesLabel}>Notas / exclusiones</label>
                <textarea
                  className={styles.quotesTextarea}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Garantía, exclusiones, condiciones especiales…"
                />
              </div>
            </div>
          </section>

          {error && <InlineAlert message={error} variant="danger" />}
        </div>

        <aside className={styles.quotesRail}>
          <div className={styles.quotesRailCard}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: "var(--text-tertiary)" }}>
              RESUMEN
            </div>
            <div className={styles.quotesRailRow}>
              <span>Subtotal</span>
              <span>{money(subtotal)}</span>
            </div>
            {discountTotal > 0 && (
              <div className={styles.quotesRailRow}>
                <span>Descuentos</span>
                <span>− {money(discountTotal)}</span>
              </div>
            )}
            <div className={styles.quotesRailRow}>
              <span>IVA</span>
              <span>{money(taxTotal)}</span>
            </div>
            {costTotal > 0 && (
              <div className={styles.quotesRailRow}>
                <span>Costo interno</span>
                <span>{money(costTotal)}</span>
              </div>
            )}
            {marginPct != null && (
              <div className={styles.quotesRailRow}>
                <span>Margen est.</span>
                <span>{marginPct}%</span>
              </div>
            )}
            <div className={styles.quotesRailTotal}>
              <span>Total</span>
              <strong>{money(total)}</strong>
            </div>
            <Button
              variant="primary"
              loading={saving}
              disabled={!readyClient || !readyLines || saving}
              onClick={() => void save()}
            >
              Guardar cambios
            </Button>
            <ul className={styles.quotesChecklist}>
              <li>
                <span className={readyClient ? styles.quotesCheckOk : styles.quotesCheckWait}>
                  {readyClient ? "✓" : "○"}
                </span>
                Cliente con razón social
              </li>
              <li>
                <span className={readyLines ? styles.quotesCheckOk : styles.quotesCheckWait}>
                  {readyLines ? "✓" : "○"}
                </span>
                Al menos una partida con precio
              </li>
              <li>
                <span className={projectName.trim() ? styles.quotesCheckOk : styles.quotesCheckWait}>
                  {projectName.trim() ? "✓" : "○"}
                </span>
                Nombre de proyecto (recomendado)
              </li>
            </ul>
          </div>
        </aside>
      </div>

      <CatalogPicker
        token={token}
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onSelect={addFromCatalog}
      />

      <Modal
        open={ctOpen}
        onClose={() => setCtOpen(false)}
        title="Buscar en catálogo CT"
        maxWidth={720}
      >
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <input
              className={styles.quotesInput}
              value={ctQuery}
              onChange={(e) => setCtQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void runCtSearch()}
              placeholder="Cámara, switch PoE, UPS…"
              autoFocus
            />
            <Button variant="primary" loading={ctLoading} onClick={() => void runCtSearch()}>
              Buscar
            </Button>
          </div>
          <div style={{ display: "grid", gap: 8, maxHeight: "50vh", overflow: "auto" }}>
            {ctOffers.map((o) => {
              const img = ctThumb(o.imagen);
              return (
                <button key={o.id} type="button" className={styles.quotesMiniOffer} onClick={() => addFromCt(o)}>
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className={styles.quotesMiniThumb} src={img} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <div className={styles.quotesMiniThumb} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{o.nombre}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                      {[o.marca, o.clave].filter(Boolean).join(" · ")} · stock {o.stockTotal}
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{money(o.sellPriceSuggested)}</div>
                </button>
              );
            })}
            {!ctLoading && ctOffers.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
                Escribe un producto y busca en el mayorista.
              </p>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
