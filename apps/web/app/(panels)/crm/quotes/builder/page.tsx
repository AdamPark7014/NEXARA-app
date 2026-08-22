"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { createSalesQuote, listSalesClients, type SalesClient } from "@/lib/sales-api";
import {
  CT_IVA_PERCENT,
  offerToLine,
  smartQuoteCheckMargin,
  smartQuoteConfigure,
  smartQuoteCopilotDraft,
  smartQuoteCtStatus,
  smartQuoteFacets,
  smartQuoteLaborSuggest,
  smartQuoteSearch,
  smartQuoteSubstitutes,
  type OptimizeMode,
  type QuoteLinePayload,
  type SmartOffer,
} from "@/lib/smart-quote-api";
import styles from "./smart-quote.module.css";

type Step = 1 | 2 | 3;
type EntryPath = "search" | "solution" | "ai";

const PRIORITIES: Array<{ id: OptimizeMode; label: string; hint: string }> = [
  { id: "BALANCE", label: "Equilibrado", hint: "Buen balance entre precio, stock y margen" },
  { id: "PRICE", label: "Más económico", hint: "Prioriza el menor costo del mayorista" },
  { id: "SPEED", label: "Entrega rápida", hint: "Prioriza lo que hay en stock ahora" },
  { id: "MARGIN", label: "Más rentable", hint: "Prioriza el margen de Nexara" },
  { id: "PREMIUM", label: "Premium", hint: "Prioriza marcas y opciones de mayor calidad" },
];

const QUICK_SEARCHES = [
  "cámara IP 4MP exterior",
  "switch PoE 24 puertos",
  "NVR 32 canales",
  "access point WiFi 6",
  "UPS",
];

const BADGE_ES: Record<string, string> = {
  BEST_PRICE: "Mejor precio",
  BEST_STOCK: "Más stock",
  FASTEST: "Entrega rápida",
  BEST_MARGIN: "Más rentable",
  RECOMMENDED: "Recomendado",
  SUBSTITUTE: "Alternativa",
  LABOR: "Servicio",
};

const COACH: Record<Step, { icon: string; title: string; text: string }> = {
  1: {
    icon: "👋",
    title: "Contexto del proyecto",
    text: "Cliente y modo de armado. La prioridad también la puedes cambiar después, en vivo.",
  },
  2: {
    icon: "🛍️",
    title: "Catálogo vivo",
    text: "Ya ves productos. Filtra, cambia prioridad o margen y el ranking se recalcula al instante.",
  },
  3: {
    icon: "✅",
    title: "Último vistazo",
    text: "Ajusta cantidades, agrega instalación y genera la cotización formal.",
  },
};

function money(n: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

/** CT Cloudflare bloquea hotlink con Referer; servimos vía proxy same-origin. */
function ctProxiedImageUrl(src: string | null | undefined): string | null {
  if (!src?.trim()) return null;
  try {
    const u = new URL(src.trim());
    if (u.protocol === 'http:') u.protocol = 'https:';
    if (u.hostname !== 'static.ctonline.mx') return src.trim();
    return `/ct-media?u=${encodeURIComponent(u.toString())}`;
  } catch {
    return src.trim();
  }
}

function ProductThumb({ src, alt }: { src: string | null; alt: string }) {
  const proxied = ctProxiedImageUrl(src);
  const [broken, setBroken] = useState(!proxied);
  if (broken || !proxied) {
    return (
      <div className={styles.sqThumb}>
        <span className={styles.sqThumbFallback}>Sin imagen</span>
      </div>
    );
  }
  return (
    <div className={styles.sqThumb}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.sqThumbImg}
        src={proxied}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    </div>
  );
}


/** CT publica precios sin IVA; unitPrice/unitCost son netos y tax% se suma aquí. */
function lineAmounts(l: QuoteLinePayload) {
  const product = l.qty * l.unitPrice;
  const labor = (l.laborHours || 0) * (l.laborRate || 0);
  const sub = product + labor;
  const disc = sub * ((l.discount || 0) / 100);
  const taxable = Math.max(0, sub - disc);
  const taxRate = (l.tax ?? 16) / 100;
  const taxAmount = taxable * taxRate;
  return { taxable, taxAmount, total: taxable + taxAmount };
}

function lineSell(l: QuoteLinePayload) {
  return lineAmounts(l).total;
}

function shortName(name?: string | null, max = 42) {
  if (!name) return "Producto";
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

export default function SmartQuoteBuilderPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const router = useRouter();

  const [step, setStep] = useState<Step>(2);
  const [path, setPath] = useState<EntryPath>("search");
  const [clients, setClients] = useState<SalesClient[]>([]);
  const [clientId, setClientId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [optimize, setOptimize] = useState<OptimizeMode>("BALANCE");
  const [targetMargin, setTargetMargin] = useState(30);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [query, setQuery] = useState("");
  const [offers, setOffers] = useState<SmartOffer[]>([]);
  const [lines, setLines] = useState<QuoteLinePayload[]>([]);
  const [showCosts, setShowCosts] = useState(true);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ctStatus, setCtStatus] = useState<{ total: number; lastSync: { finishedAt?: string } | null } | null>(null);
  const [marginAlert, setMarginAlert] = useState<string | null>(null);
  const [copilotPrompt, setCopilotPrompt] = useState("");
  const [copilotQuestions, setCopilotQuestions] = useState<string[]>([]);
  const [qtyDraft, setQtyDraft] = useState<Record<number, number>>({});
  const [searchedOnce, setSearchedOnce] = useState(false);
  const [expandedOffer, setExpandedOffer] = useState<number | null>(null);
  const [filterBrand, setFilterBrand] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [inStockOnly, setInStockOnly] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [resultMeta, setResultMeta] = useState(0);
  const [facetBrands, setFacetBrands] = useState<string[]>([]);
  const [facetCategories, setFacetCategories] = useState<string[]>([]);
  const [cfg, setCfg] = useState({
    template: "CCTV" as "CCTV" | "WIFI" | "ACCESS",
    cameras: 12,
    storageDays: 30,
    accessPoints: 8,
    doors: 2,
    zone: "LOCAL_PUE",
  });

  useEffect(() => {
    if (!token) return;
    listSalesClients(token)
      .then((list) => {
        setClients(list);
        if (list.length === 1) setClientId(String(list[0].id));
      })
      .catch(() => setClients([]));
    smartQuoteCtStatus(token).then(setCtStatus).catch(() => setCtStatus(null));
    smartQuoteFacets(token)
      .then((f) => {
        setFacetBrands(
          (f.brands || [])
            .map((b) => b.name)
            .filter((n): n is string => Boolean(n))
            .slice(0, 40),
        );
        setFacetCategories(
          (f.categories || [])
            .map((c) => c.name)
            .filter((n): n is string => Boolean(n))
            .slice(0, 30),
        );
      })
      .catch(() => {
        setFacetBrands([]);
        setFacetCategories([]);
      });
  }, [token]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const client = useMemo(() => clients.find((c) => String(c.id) === clientId), [clients, clientId]);

  const totals = useMemo(() => {
    const amounts = lines.map(lineAmounts);
    const subtotal = amounts.reduce((a, x) => a + x.taxable, 0);
    const tax = amounts.reduce((a, x) => a + x.taxAmount, 0);
    const sell = amounts.reduce((a, x) => a + x.total, 0);
    const cost = lines.reduce((a, l) => a + l.qty * (Number(l.unitCost) || 0), 0);
    // Margen comercial sobre precios sin IVA (misma base que CT y que la utilidad).
    const margin = subtotal > 0 ? ((subtotal - cost) / subtotal) * 100 : 0;
    return { subtotal, tax, sell, cost, margin, count: lines.length };
  }, [lines]);

  useEffect(() => {
    if (!token || !lines.length) {
      setMarginAlert(null);
      return;
    }
    const first = lines.find((l) => l.unitCost != null);
    if (!first) return;
    const qty = Math.max(1, lines.reduce((a, l) => a + l.qty, 0));
    smartQuoteCheckMargin(token, {
      unitCost: totals.cost / qty,
      unitPrice: totals.subtotal / qty,
      category: first.category,
      brand: first.brand || undefined,
    })
      .then((r) => setMarginAlert(r.ok ? null : r.message))
      .catch(() => setMarginAlert(null));
  }, [token, lines, totals]);

  const canGoStep2 = Boolean(clientId || projectName.trim());
  const canGoStep3 = lines.length > 0;
  const step1Done = canGoStep2;
  const step2Done = canGoStep3;

  const runSearch = useCallback(
    async (qOverride?: string) => {
      if (!token) return;
      const q = (qOverride ?? query).trim();
      if (qOverride !== undefined) setQuery(qOverride);
      setLoadingSearch(true);
      setError(null);
      setSearchedOnce(true);
      try {
        const res = await smartQuoteSearch(token, {
          q: q || undefined,
          brand: filterBrand || undefined,
          category: filterCategory || undefined,
          optimize,
          targetMargin,
          inStockOnly,
          take: 36,
        });
        setOffers(res.data);
        setResultMeta(res.meta?.totalCandidates ?? res.data.length);
        if (!res.data.length) {
          setToast("Sin coincidencias. Prueba otra palabra, quita filtros o incluye sin stock.");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo buscar en el catálogo");
        setOffers([]);
      } finally {
        setLoadingSearch(false);
      }
    },
    [token, query, optimize, targetMargin, filterBrand, filterCategory, inStockOnly],
  );

  // Catálogo vivo: carga inicial + reconsulta al cambiar filtros / prioridad / margen
  useEffect(() => {
    if (!token || step !== 2 || path !== "search") return;
    const t = setTimeout(() => {
      void runSearch();
    }, query.trim() ? 320 : 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce intentionally keyed
  }, [token, step, path, query, optimize, targetMargin, filterBrand, filterCategory, inStockOnly]);

  // Remoldea precios de líneas CT cuando cambias el margen objetivo
  useEffect(() => {
    setLines((prev) =>
      prev.map((l) => {
        const cost = Number(l.unitCost) || 0;
        if (cost <= 0 || !l.productCtId) return l;
        const m = Math.min(0.9, Math.max(0.05, targetMargin / 100));
        const unitPrice = Math.round((cost / (1 - m)) * 100) / 100;
        return { ...l, unitPrice, marginPercent: targetMargin };
      }),
    );
  }, [targetMargin]);

  const loadSubstitutes = async (clave: string) => {
    if (!token || !clave) return;
    setLoadingSearch(true);
    try {
      const data = await smartQuoteSubstitutes(token, clave, {
        optimize,
        targetMargin,
        take: 12,
      });
      setOffers(data);
      setSearchedOnce(true);
      setToast(`Alternativas para ${clave}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar alternativas");
    } finally {
      setLoadingSearch(false);
    }
  };

  const addOffer = (offer: SmartOffer) => {
    const qty = Math.max(1, qtyDraft[offer.id] || 1);
    setLines((prev) => [...prev, offerToLine(offer, qty, optimize)]);
    setToast(`Listo: agregaste ${qty} × ${shortName(offer.nombre || offer.clave, 36)}`);
  };

  const mergeProposal = (
    hardware: QuoteLinePayload[],
    labor: Array<Record<string, unknown>>,
    logistics: QuoteLinePayload | null,
    notes?: string[],
  ) => {
    const next: QuoteLinePayload[] = [...hardware];
    for (const s of labor || []) {
      next.push({
        category: String(s.category || "ENGINEERING"),
        name: String(s.name || "Servicio"),
        qty: Number(s.qty) || 1,
        unitPrice: Number(s.unitPrice) || 0,
        unitCost: Number(s.unitCost) || 0,
        discount: 0,
        tax: CT_IVA_PERCENT,
        laborHours: Number(s.laborHours) || 0,
        laborRate: Number(s.laborRate) || 0,
      });
    }
    if (logistics) {
      next.push({
        ...logistics,
        discount: logistics.discount ?? 0,
        tax: logistics.tax ?? CT_IVA_PERCENT,
      });
    }
    setLines(next);
    setStep(3);
    setToast(
      notes?.length
        ? notes[0]
        : `Propuesta lista: ${next.length} concepto${next.length === 1 ? "" : "s"}. Revísala y genera.`,
    );
  };

  const runConfigure = async () => {
    if (!token) return;
    setLoadingAction(true);
    setError(null);
    try {
      const res = await smartQuoteConfigure(token, {
        template: cfg.template,
        cameras: cfg.template === "CCTV" ? cfg.cameras : undefined,
        storageDays: cfg.template === "CCTV" ? cfg.storageDays : undefined,
        accessPoints: cfg.template === "WIFI" ? cfg.accessPoints : undefined,
        doors: cfg.template === "ACCESS" ? cfg.doors : undefined,
        optimize,
        targetMarginPercent: targetMargin,
        logisticsZone: cfg.zone,
        includeLabor: true,
      });
      mergeProposal(res.hardware || [], res.labor || [], res.logistics, res.notes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo armar la solución");
    } finally {
      setLoadingAction(false);
    }
  };

  const runCopilot = async () => {
    if (!token || !copilotPrompt.trim()) return;
    setLoadingAction(true);
    setError(null);
    try {
      const draft = await smartQuoteCopilotDraft(token, copilotPrompt.trim());
      setCopilotQuestions(draft.intent.questions || []);
      setOptimize(draft.intent.optimize);
      mergeProposal(draft.proposal.hardware || [], draft.proposal.labor || [], draft.proposal.logistics, draft.proposal.notes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el borrador");
    } finally {
      setLoadingAction(false);
    }
  };

  const suggestLabor = async () => {
    if (!token || !lines.length) return;
    setLoadingAction(true);
    try {
      const sugg = await smartQuoteLaborSuggest(
        token,
        lines.map((l) => ({ category: l.category, qty: l.qty, name: l.name })),
      );
      if (!sugg.length) {
        setToast("No encontramos servicios sugeridos para estos productos.");
        return;
      }
      const asLines: QuoteLinePayload[] = sugg.map((s) => ({
        category: s.category,
        name: s.name,
        qty: s.qty,
        unitPrice: s.unitPrice,
        unitCost: s.unitCost,
        discount: 0,
        tax: CT_IVA_PERCENT,
        laborHours: s.laborHours,
        laborRate: s.laborRate,
        scoreReason: "LABOR",
        optimizationMode: optimize,
      }));
      setLines((prev) => [...prev, ...asLines]);
      setToast(`Agregamos ${asLines.length} servicio${asLines.length === 1 ? "" : "s"} de instalación / ingeniería.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo calcular la mano de obra");
    } finally {
      setLoadingAction(false);
    }
  };

  const saveQuote = async () => {
    if (!token || !lines.length) return;
    setSaving(true);
    setError(null);
    try {
      const quoteNumber = `NXR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
      const issueDate = new Date().toISOString().slice(0, 10);
      const validUntil = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
      await createSalesQuote(token, {
        quoteNumber,
        issueDate,
        validUntil,
        salesClientId: client?.id,
        clientCompany: client?.name || client?.legalName || undefined,
        clientName: client?.name,
        projectName: projectName || undefined,
        items: lines.map((l) => ({
          name: l.name,
          qty: l.qty,
          unitPrice: l.unitPrice,
          discount: l.discount,
          tax: l.tax ?? CT_IVA_PERCENT,
          description: l.description || undefined,
          category: l.category,
          brand: l.brand || undefined,
          model: l.model || undefined,
          sku: l.sku || undefined,
          partNumber: l.partNumber || undefined,
          unitCost: l.unitCost ?? undefined,
          productCtId: l.productCtId,
          supplierSku: l.supplierSku || undefined,
          marginPercent: l.marginPercent ?? undefined,
          stockSnapshot: l.stockSnapshot ?? undefined,
          leadTimeDays: l.leadTimeDays ?? undefined,
          scoreReason: l.scoreReason || undefined,
          optimizationMode: l.optimizationMode || optimize,
          laborHours: l.laborHours || 0,
          laborRate: l.laborRate || 0,
          deliveryTime: l.deliveryTime || undefined,
        })) as any,
      });
      router.push("/crm/quotes");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la cotización");
    } finally {
      setSaving(false);
    }
  };

  const goStep = (next: Step) => {
    if (next === 3 && !canGoStep3) {
      setToast("Agrega al menos un producto antes de confirmar.");
      return;
    }
    setStep(next);
  };

  const coach = COACH[step];
  const exploring = step === 2 && path === "search";
  const catalogHint = ctStatus
    ? `${ctStatus.total.toLocaleString("es-MX")} productos del mayorista listos para cotizar`
    : "Catálogo del mayorista listo para cotizar";

  return (
    <div className={`${styles.sq} ${exploring ? styles.sqExploreMode : ""}`}>
      {!exploring ? (
      <PageHeader
        variant="hero"
        eyebrow="CRM · Cotizaciones"
        title="Cotizador profesional"
        subtitle={`${catalogHint}. Explora, filtra y cambia prioridad en tiempo real mientras armas la propuesta.`}
        meta={
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            <Link href="/crm/quotes" style={{ color: "var(--text-tertiary)" }}>
              Volver a cotizaciones
            </Link>
          </span>
        }
        actions={
          <Button variant="ghost" size="sm" onClick={() => setShowCosts((v) => !v)}>
            {showCosts ? "Vista cliente" : "Vista interna"}
          </Button>
        }
      />
      ) : (
      <div className={styles.sqExploreTop}>
        <div className={styles.sqExploreTopLeft}>
          <Link href="/crm/quotes" className={styles.sqExploreBack}>
            ← Cotizaciones
          </Link>
          <span className={styles.sqExploreTitle}>Explorador CT</span>
          <span className={styles.sqExploreHint}>{catalogHint}</span>
        </div>
        <div className={styles.sqExploreTopActions}>
          <button type="button" className={styles.sqMiniStep} onClick={() => setStep(1)}>
            Cliente
          </button>
          <button type="button" className={`${styles.sqMiniStep} ${styles.sqMiniStepOn}`}>
            Productos
          </button>
          <button
            type="button"
            className={styles.sqMiniStep}
            onClick={() => goStep(3)}
            disabled={!canGoStep3}
          >
            Confirmar ({lines.length})
          </button>
          <Button variant="ghost" size="sm" onClick={() => setShowCosts((v) => !v)}>
            {showCosts ? "Vista cliente" : "Vista interna"}
          </Button>
        </div>
      </div>
      )}

      {!exploring && (
      <div className={styles.sqStepper} role="navigation" aria-label="Pasos de cotización">
        {(
          [
            { id: 1 as Step, label: "Cliente", hint: "Para quién es", done: step1Done },
            { id: 2 as Step, label: "Productos", hint: "Qué incluir", done: step2Done },
            { id: 3 as Step, label: "Confirmar", hint: "Generar propuesta", done: false },
          ] as const
        ).map((s) => {
          const active = step === s.id;
          const done = s.id < step || (s.id === 1 && step1Done && step > 1) || (s.id === 2 && step2Done && step > 2);
          return (
            <button
              key={s.id}
              type="button"
              className={`${styles.sqStep} ${active ? styles.sqStepActive : ""} ${done && !active ? styles.sqStepDone : ""}`}
              onClick={() => goStep(s.id)}
            >
              <span className={styles.sqStepNum}>{done && !active ? "✓" : s.id}</span>
              <span>
                <div className={styles.sqStepLabel}>{s.label}</div>
                <div className={styles.sqStepHint}>{s.hint}</div>
              </span>
            </button>
          );
        })}
      </div>
      )}

      {!exploring && (
      <div className={styles.sqCoach} role="note">
        <div className={styles.sqCoachIcon} aria-hidden>
          {coach.icon}
        </div>
        <div className={styles.sqCoachBody}>
          <div className={styles.sqCoachTitle}>{coach.title}</div>
          <div className={styles.sqCoachText}>{coach.text}</div>
        </div>
      </div>
      )}

      {error && <InlineAlert message={error} variant="danger" onDismiss={() => setError(null)} />}
      {marginAlert && <InlineAlert message={marginAlert} variant="warning" onDismiss={() => setMarginAlert(null)} />}
      {toast && <InlineAlert message={toast} variant="success" onDismiss={() => setToast(null)} />}

      <div className={styles.sqLayout}>
        <main className={styles.sqMain}>
          {step === 1 && (
            <section className={styles.sqCard}>
              <div>
                <h2 className={styles.sqCardTitle}>¿Para quién cotizamos?</h2>
                <p className={styles.sqCardLead}>
                  Con esto personalizamos la propuesta. Luego eliges cómo armar los productos.
                </p>
              </div>

              <div className={styles.sqFieldGrid}>
                <label className={styles.sqLabel}>
                  Cliente
                  <select
                    className={styles.sqSelect}
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                  >
                    <option value="">Selecciona un cliente…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.sqLabel}>
                  Proyecto (opcional pero recomendado)
                  <input
                    className={styles.sqInput}
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Ej. CCTV Bodega Norte"
                  />
                </label>
              </div>

              <div>
                <div className={styles.sqLabel} style={{ marginBottom: 8 }}>
                  ¿Qué priorizamos en este proyecto?
                </div>
                <div className={styles.sqChips}>
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`${styles.sqChip} ${optimize === p.id ? styles.sqChipOn : ""}`}
                      onClick={() => setOptimize(p.id)}
                      title={p.hint}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className={styles.sqHelp} style={{ marginTop: 8 }}>
                  {PRIORITIES.find((p) => p.id === optimize)?.hint}
                </div>
              </div>

              <div>
                <button
                  type="button"
                  className={styles.sqGhostBtn}
                  style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}
                  onClick={() => setShowAdvanced((v) => !v)}
                >
                  {showAdvanced ? "Ocultar opciones avanzadas" : "Opciones avanzadas (margen)"}
                </button>
                {showAdvanced && (
                  <label className={styles.sqLabel} style={{ marginTop: 10 }}>
                    Margen objetivo: {targetMargin}%
                    <input
                      type="range"
                      min={15}
                      max={50}
                      value={targetMargin}
                      onChange={(e) => setTargetMargin(Number(e.target.value))}
                    />
                    <span className={styles.sqHelp}>
                      Usamos este margen para sugerir el precio de venta sobre el costo del mayorista.
                    </span>
                  </label>
                )}
              </div>

              <div>
                <div className={styles.sqLabel} style={{ marginBottom: 8 }}>
                  ¿Cómo quieres armarla?
                </div>
                <div className={styles.sqPaths}>
                  <button
                    type="button"
                    className={`${styles.sqPath} ${path === "search" ? styles.sqPathOn : ""}`}
                    onClick={() => setPath("search")}
                  >
                    <span className={styles.sqPathIcon}>🔎</span>
                    <span className={styles.sqPathTitle}>Buscar productos</span>
                    <span className={styles.sqPathDesc}>Ideal si ya sabes qué equipo necesitas.</span>
                    <span className={styles.sqPathMeta}>Lo más usado</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.sqPath} ${path === "solution" ? styles.sqPathOn : ""}`}
                    onClick={() => setPath("solution")}
                  >
                    <span className={styles.sqPathIcon}>🧩</span>
                    <span className={styles.sqPathTitle}>Armar solución</span>
                    <span className={styles.sqPathDesc}>Dices el alcance y te proponemos el paquete.</span>
                    <span className={styles.sqPathMeta}>CCTV · WiFi · Acceso</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.sqPath} ${path === "ai" ? styles.sqPathOn : ""}`}
                    onClick={() => setPath("ai")}
                  >
                    <span className={styles.sqPathIcon}>💬</span>
                    <span className={styles.sqPathTitle}>Describirlo</span>
                    <span className={styles.sqPathDesc}>Lo escribes como se lo dirías a un colega.</span>
                    <span className={styles.sqPathMeta}>Borrador automático</span>
                  </button>
                </div>
              </div>

              <div className={styles.sqFooter}>
                <span className={styles.sqHelp}>
                  Puedes ir al explorador ya; el cliente también se elige allá.
                </span>
                <Button variant="primary" size="lg" onClick={() => goStep(2)}>
                  Ir al explorador
                </Button>
              </div>
            </section>
          )}

          {step === 2 && path === "search" && (
            <section className={`${styles.sqCard} ${styles.sqWorkspace}`}>
              <div className={styles.sqControlDeck}>
                <div className={styles.sqSearchRow}>
                  <input
                    className={styles.sqSearchInput}
                    autoFocus
                    placeholder="Buscar en el catálogo CT… cámara 4MP, switch PoE, UPS, Hikvision…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setQuery("");
                      setFilterBrand("");
                      setFilterCategory("");
                    }}
                  >
                    Limpiar
                  </Button>
                </div>

                <div className={styles.sqPriorityStrip}>
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`${styles.sqPriorityBtn} ${optimize === p.id ? styles.sqPriorityBtnOn : ""}`}
                      onClick={() => {
                        setOptimize(p.id);
                        setToast(`Prioridad: ${p.label}`);
                      }}
                      title={p.hint}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className={styles.sqMarginRow}>
                  <span>Margen {targetMargin}%</span>
                  <input
                    type="range"
                    min={15}
                    max={55}
                    value={targetMargin}
                    onChange={(e) => setTargetMargin(Number(e.target.value))}
                  />
                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={inStockOnly}
                      onChange={(e) => setInStockOnly(e.target.checked)}
                    />
                    Solo stock
                  </label>
                </div>

                <div className={styles.sqFilterRow}>
                  <select
                    className={styles.sqInput}
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    aria-label="Cliente"
                  >
                    <option value="">Cliente (opcional ahora)…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className={styles.sqInput}
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Proyecto / obra"
                  />
                  <select
                    className={styles.sqInput}
                    value={filterBrand}
                    onChange={(e) => setFilterBrand(e.target.value)}
                    aria-label="Marca"
                  >
                    <option value="">Todas las marcas</option>
                    {facetBrands.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                  <select
                    className={styles.sqInput}
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    aria-label="Categoría"
                  >
                    <option value="">Categoría (lista)</option>
                    {facetCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.sqLiveBar}>
                  <div className={styles.sqViewToggle}>
                    <button
                      type="button"
                      className={`${styles.sqViewBtn} ${viewMode === "grid" ? styles.sqViewBtnOn : ""}`}
                      onClick={() => setViewMode("grid")}
                    >
                      Rejilla
                    </button>
                    <button
                      type="button"
                      className={`${styles.sqViewBtn} ${viewMode === "list" ? styles.sqViewBtnOn : ""}`}
                      onClick={() => setViewMode("list")}
                    >
                      Lista
                    </button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCosts((v) => !v)}
                    title="Mostrar/ocultar costos internos"
                  >
                    {showCosts ? "Ocultar costos" : "Ver costos"}
                  </Button>
                </div>

                <div className={styles.sqCatStrip}>
                  <button
                    type="button"
                    className={`${styles.sqCatPill} ${!filterCategory ? styles.sqCatPillOn : ""}`}
                    onClick={() => setFilterCategory("")}
                  >
                    Todas
                  </button>
                  {facetCategories.slice(0, 14).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`${styles.sqCatPill} ${filterCategory === c ? styles.sqCatPillOn : ""}`}
                      onClick={() => setFilterCategory(filterCategory === c ? "" : c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>

                <div className={styles.sqChips}>
                  {QUICK_SEARCHES.map((q) => (
                    <button
                      key={q}
                      type="button"
                      className={`${styles.sqChip} ${styles.sqChipSoft}`}
                      onClick={() => setQuery(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>

                <div className={styles.sqLiveBar}>
                  <div className={styles.sqLiveMeta}>
                    <span className={styles.sqPulse} aria-hidden />
                    <span>
                      {loadingSearch
                        ? "Actualizando catálogo…"
                        : `${offers.length} productos · ${resultMeta || "—"} candidatos · ${PRIORITIES.find((p) => p.id === optimize)?.label}`}
                    </span>
                  </div>
                  <span className={styles.sqHelp}>
                    {PRIORITIES.find((p) => p.id === optimize)?.hint}
                  </span>
                </div>
              </div>

              {loadingSearch && !offers.length ? (
                <div className={styles.sqSkeletonGrid}>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className={styles.sqSkeletonCard} />
                  ))}
                </div>
              ) : null}

              {viewMode === "grid" && offers.length > 0 ? (
                <div className={styles.sqProductGrid}>
                  {offers.map((o) => {
                    const rec = o.badges.includes("RECOMMENDED");
                    const img = ctProxiedImageUrl(o.imagen);
                    return (
                      <article
                        key={o.id}
                        className={`${styles.sqProductCard} ${rec ? styles.sqProductCardRec : ""}`}
                      >
                        <div className={styles.sqProductMedia}>
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img} alt="" loading="lazy" referrerPolicy="no-referrer" />
                          ) : (
                            <span className={styles.sqThumbFallback}>Sin imagen</span>
                          )}
                          {rec ? (
                            <span
                              className={styles.sqBadgeRec}
                              style={{ position: "absolute", top: 8, left: 8 }}
                            >
                              Top
                            </span>
                          ) : null}
                        </div>
                        <div className={styles.sqProductBody}>
                          <div className={styles.sqProductName}>{o.nombre}</div>
                          <div className={styles.sqProductMeta}>
                            {[o.marca, o.clave].filter(Boolean).join(" · ")}
                            {" · "}
                            <span className={o.stockTotal > 0 ? styles.sqStockOk : styles.sqStockWarn}>
                              {o.stockTotal > 0 ? `${o.stockTotal} u.` : "Sin stock"}
                            </span>
                          </div>
                          <div>
                            <div className={styles.sqProductPrice}>{money(o.sellPriceSuggested)}</div>
                            <div className={styles.sqProductCost}>
                              sin IVA · +{CT_IVA_PERCENT}%
                              {showCosts ? ` · costo CT ${money(o.costMxn)} · ${o.marginPercent}%` : ""}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {o.badges.slice(0, 2).map((b) => (
                              <span key={b} className={styles.sqBadge}>
                                {BADGE_ES[b] || b}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className={styles.sqProductActions}>
                          <input
                            className={styles.sqInput}
                            type="number"
                            min={1}
                            value={qtyDraft[o.id] || 1}
                            onChange={(e) =>
                              setQtyDraft((prev) => ({
                                ...prev,
                                [o.id]: Math.max(1, Number(e.target.value) || 1),
                              }))
                            }
                            aria-label="Cantidad"
                          />
                          <Button variant="primary" size="sm" onClick={() => addOffer(o)}>
                            Agregar
                          </Button>
                        </div>
                        {o.clave ? (
                          <button
                            type="button"
                            className={styles.sqDetailsToggle}
                            style={{ margin: "0 12px 12px" }}
                            onClick={() => void loadSubstitutes(o.clave!)}
                          >
                            Ver alternativas
                          </button>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : null}

              {viewMode === "list" ? (
              <div style={{ display: "grid", gap: 10 }}>
                {offers.map((o) => {
                  const rec = o.badges.includes("RECOMMENDED");
                  const open = expandedOffer === o.id;
                  const specs = o.especificaciones || [];
                  const warehouses = o.stockByWarehouse || [];
                  return (
                    <article key={o.id} className={`${styles.sqOffer} ${rec ? styles.sqOfferRec : ""}`}>
                      <ProductThumb src={o.imagen} alt={o.nombre || o.clave || "Producto"} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 750, fontSize: 14, lineHeight: 1.35 }}>{o.nombre}</div>
                        <div className={styles.sqOfferMeta}>
                          {o.marca ? <span>{o.marca}</span> : null}
                          {o.modelo ? <span>Modelo {o.modelo}</span> : null}
                          {o.clave ? <span>SKU {o.clave}</span> : null}
                          {o.numParte ? <span>P/N {o.numParte}</span> : null}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
                          {[o.categoria, o.subcategoria].filter(Boolean).join(" · ") || "Sin categoría"}
                          {" · "}
                          <span className={o.stockTotal > 0 ? styles.sqStockOk : styles.sqStockWarn}>
                            {o.stockTotal > 0 ? `${o.stockTotal} disponibles` : "Sin stock"}
                          </span>
                          {o.stockPreferred > 0 ? ` · ${o.stockPreferred} en almacén preferido` : null}
                          {o.leadTimeDays <= 1 ? " · inmediato" : ` · ~${o.leadTimeDays} días`}
                        </div>
                        {o.descripcion ? <p className={styles.sqOfferDesc}>{o.descripcion}</p> : null}
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
                          {o.badges.map((b) => (
                            <span
                              key={b}
                              className={`${styles.sqBadge} ${b === "RECOMMENDED" ? styles.sqBadgeRec : ""}`}
                            >
                              {BADGE_ES[b] || b}
                            </span>
                          ))}
                          {o.protegido ? <span className={styles.sqBadge}>Precio protegido</span> : null}
                          {(o.promociones?.length || 0) > 0 ? (
                            <span className={styles.sqBadge}>Promoción CT</span>
                          ) : null}
                        </div>
                        {warehouses.length > 0 ? (
                          <div className={styles.sqWh}>
                            {warehouses.slice(0, open ? 8 : 4).map((w) => (
                              <span key={w.code} className={styles.sqWhChip}>
                                {w.code}: {w.qty}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {open && specs.length > 0 ? (
                          <div className={styles.sqSpecs}>
                            {specs.slice(0, 8).map((s) => (
                              <div key={`${s.tipo}-${s.valor}`} className={styles.sqSpecItem}>
                                <strong>{s.tipo}:</strong> {s.valor}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {open ? (
                          <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-tertiary)" }}>
                            {o.ean ? `EAN ${o.ean}` : null}
                            {o.ean && o.upc ? " · " : null}
                            {o.upc ? `UPC ${o.upc}` : null}
                            {o.sustituto && o.sustituto !== o.clave ? ` · Sustituto ${o.sustituto}` : null}
                            {showCosts ? ` · Costo CT ${money(o.precio)} ${o.moneda}` : null}
                          </div>
                        ) : null}
                        {(specs.length > 0 || o.ean || o.upc || o.descripcion) && (
                          <button
                            type="button"
                            className={styles.sqDetailsToggle}
                            onClick={() => setExpandedOffer(open ? null : o.id)}
                          >
                            {open ? "Ocultar detalle" : "Ver más datos"}
                          </button>
                        )}
                        <div style={{ marginTop: 8, fontSize: 15, fontWeight: 800 }}>
                          {money(o.sellPriceSuggested)}
                          <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: "var(--text-tertiary)" }}>
                            sin IVA · +{CT_IVA_PERCENT}%
                            {showCosts ? ` · costo ${money(o.costMxn)} · margen ${o.marginPercent}%` : ""}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: "grid", gap: 8, justifyItems: "stretch" }}>
                        <input
                          className={styles.sqInput}
                          type="number"
                          min={1}
                          value={qtyDraft[o.id] || 1}
                          onChange={(e) =>
                            setQtyDraft((prev) => ({
                              ...prev,
                              [o.id]: Math.max(1, Number(e.target.value) || 1),
                            }))
                          }
                          style={{ width: 76, textAlign: "center", padding: "8px" }}
                          aria-label="Cantidad"
                        />
                        <Button variant="primary" size="sm" onClick={() => addOffer(o)}>
                          Agregar
                        </Button>
                        {o.clave ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void loadSubstitutes(o.clave!)}
                          >
                            Alternativas
                          </Button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
              ) : null}

                {!offers.length && !loadingSearch && (
                  <EmptyState
                    icon="🔎"
                    title={searchedOnce ? "Sin resultados" : "Cargando catálogo…"}
                    description={
                      searchedOnce
                        ? "Prueba otra palabra, otra categoría o desactiva “Solo stock”."
                        : "En un momento verás productos recomendados."
                    }
                  />
                )}

              <div className={styles.sqFooter}>
                <Button variant="ghost" onClick={() => setStep(1)}>
                  Cliente / modo
                </Button>
                <Button variant="primary" size="lg" disabled={!canGoStep3} onClick={() => goStep(3)}>
                  Revisar ({lines.length})
                </Button>
              </div>
            </section>
          )}

          {step === 2 && path === "solution" && (
            <section className={styles.sqCard}>
              <div>
                <h2 className={styles.sqCardTitle}>Cuéntanos el alcance</h2>
                <p className={styles.sqCardLead}>
                  Con estos datos armamos una propuesta completa: equipos, instalación y entrega.
                </p>
              </div>

              <div className={styles.sqChips}>
                {(
                  [
                    { id: "CCTV" as const, label: "Videovigilancia" },
                    { id: "WIFI" as const, label: "Red WiFi" },
                    { id: "ACCESS" as const, label: "Control de acceso" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`${styles.sqChip} ${cfg.template === t.id ? styles.sqChipOn : ""}`}
                    onClick={() => setCfg({ ...cfg, template: t.id })}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className={styles.sqFieldGrid}>
                {cfg.template === "CCTV" && (
                  <>
                    <label className={styles.sqLabel}>
                      Número de cámaras
                      <input
                        className={styles.sqInput}
                        type="number"
                        min={1}
                        value={cfg.cameras}
                        onChange={(e) => setCfg({ ...cfg, cameras: Number(e.target.value) || 1 })}
                      />
                    </label>
                    <label className={styles.sqLabel}>
                      Días de grabación
                      <input
                        className={styles.sqInput}
                        type="number"
                        min={7}
                        value={cfg.storageDays}
                        onChange={(e) => setCfg({ ...cfg, storageDays: Number(e.target.value) || 30 })}
                      />
                    </label>
                  </>
                )}
                {cfg.template === "WIFI" && (
                  <label className={styles.sqLabel}>
                    Access points
                    <input
                      className={styles.sqInput}
                      type="number"
                      min={1}
                      value={cfg.accessPoints}
                      onChange={(e) => setCfg({ ...cfg, accessPoints: Number(e.target.value) || 1 })}
                    />
                  </label>
                )}
                {cfg.template === "ACCESS" && (
                  <label className={styles.sqLabel}>
                    Puertas a controlar
                    <input
                      className={styles.sqInput}
                      type="number"
                      min={1}
                      value={cfg.doors}
                      onChange={(e) => setCfg({ ...cfg, doors: Number(e.target.value) || 1 })}
                    />
                  </label>
                )}
                <label className={styles.sqLabel}>
                  Zona de entrega / instalación
                  <select
                    className={styles.sqSelect}
                    value={cfg.zone}
                    onChange={(e) => setCfg({ ...cfg, zone: e.target.value })}
                  >
                    <option value="LOCAL_PUE">Local · Puebla</option>
                    <option value="CDMX">Ciudad de México</option>
                    <option value="FORANEO">Foráneo</option>
                  </select>
                </label>
              </div>

              <div className={styles.sqFooter}>
                <Button variant="ghost" onClick={() => setStep(1)}>
                  Atrás
                </Button>
                <Button variant="primary" size="lg" onClick={() => void runConfigure()} loading={loadingAction}>
                  Armar propuesta
                </Button>
              </div>
            </section>
          )}

          {step === 2 && path === "ai" && (
            <section className={styles.sqCard}>
              <div>
                <h2 className={styles.sqCardTitle}>Descríbelo como se lo dirías a un colega</h2>
                <p className={styles.sqCardLead}>
                  Generamos un borrador con precios y stock reales del mayorista. Tú solo revisas y ajustas.
                </p>
              </div>

              <textarea
                className={styles.sqTextarea}
                autoFocus
                placeholder='Ej. "Necesito 50 cámaras en un almacén, priorizando disponibilidad e instalación en máximo 10 días en Puebla"'
                value={copilotPrompt}
                onChange={(e) => setCopilotPrompt(e.target.value)}
              />

              {copilotQuestions.length > 0 && (
                <div style={{ padding: 14, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Para afinar después</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text-secondary)" }}>
                    {copilotQuestions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className={styles.sqFooter}>
                <Button variant="ghost" onClick={() => setStep(1)}>
                  Atrás
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => void runCopilot()}
                  loading={loadingAction}
                  disabled={!copilotPrompt.trim()}
                >
                  Generar borrador
                </Button>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className={styles.sqCard}>
              <div>
                <h2 className={styles.sqCardTitle}>Todo listo para generar</h2>
                <p className={styles.sqCardLead}>
                  Ajusta cantidades en el panel de la derecha. Si el proyecto incluye instalación, agrégala aquí.
                </p>
              </div>

              <div className={styles.sqKpis}>
                <div className={styles.sqKpi}>
                  <div className={styles.sqKpiLabel}>Conceptos</div>
                  <div className={styles.sqKpiValue}>{totals.count}</div>
                </div>
                <div className={styles.sqKpi}>
                  <div className={styles.sqKpiLabel}>Total c/IVA</div>
                  <div className={styles.sqKpiValue}>{money(totals.sell)}</div>
                </div>
                <div className={styles.sqKpi}>
                  <div className={styles.sqKpiLabel}>Margen</div>
                  <div className={styles.sqKpiValue}>{totals.count ? `${totals.margin.toFixed(0)}%` : "—"}</div>
                </div>
              </div>

              {!lines.length ? (
                <EmptyState
                  icon="📋"
                  title="Aún no hay conceptos"
                  description="Regresa un paso y agrega productos o arma una solución."
                  action={
                    <Button variant="secondary" onClick={() => setStep(2)}>
                      Ir a productos
                    </Button>
                  }
                />
              ) : (
                <div className={styles.sqHelp}>
                  Al generar, la cotización queda en CRM como borrador. Desde ahí puedes descargar PDF o enviarla al cliente.
                </div>
              )}

              <div className={styles.sqFooter}>
                <Button variant="ghost" onClick={() => setStep(2)}>
                  Seguir agregando
                </Button>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button variant="secondary" onClick={() => void suggestLabor()} loading={loadingAction} disabled={!lines.length}>
                    + Instalación
                  </Button>
                  <Button variant="primary" size="lg" onClick={() => void saveQuote()} loading={saving} disabled={!lines.length}>
                    Generar cotización
                  </Button>
                </div>
              </div>
            </section>
          )}
        </main>

        <aside className={`${styles.sqRail} ${exploring && lines.length === 0 ? styles.sqRailCompact : ""}`}>
          <div className={styles.sqRailCard}>
            <div className={styles.sqRailHead}>
              <div className={styles.sqRailEyebrow}>TU PROPUESTA</div>
              <div className={styles.sqRailTitle}>
                {client?.name || "Cliente por definir"}
                {projectName ? ` · ${projectName}` : ""}
              </div>
              <div className={styles.sqRailMeta}>
                {PRIORITIES.find((p) => p.id === optimize)?.label}
                {showCosts ? ` · margen objetivo ${targetMargin}%` : ""}
              </div>
            </div>

            <div style={{ display: "grid", gap: 10, maxHeight: exploring ? 220 : 300, overflow: "auto" }}>
              {lines.length === 0 ? (
                <div className={styles.sqHelp} style={{ padding: "4px 0" }}>
                  {exploring
                    ? "Agrega productos del catálogo; el total se actualiza aquí."
                    : "Aquí aparecerá todo lo que agregues."}
                </div>
              ) : (
                lines.map((l, idx) => (
                  <div key={`${l.sku || l.name}-${idx}`} className={styles.sqLine}>
                    <div className={styles.sqLineTop}>
                      <div className={styles.sqLineName}>{shortName(l.name, 48)}</div>
                      <button
                        type="button"
                        className={styles.sqGhostBtn}
                        aria-label="Quitar de la cotización"
                        onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        ✕
                      </button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <span style={{ color: "var(--text-tertiary)" }}>Cant.</span>
                      <input
                        className={styles.sqInput}
                        type="number"
                        min={1}
                        value={l.qty}
                        onChange={(e) => {
                          const qty = Math.max(1, Number(e.target.value) || 1);
                          setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, qty } : x)));
                        }}
                        style={{ width: 64, padding: "5px 8px", fontSize: 13 }}
                      />
                      <strong style={{ marginLeft: "auto", fontSize: 13 }}>{money(lineSell(l))}</strong>
                    </div>
                    {showCosts && l.unitCost != null && (
                      <div className={styles.sqHelp}>Costo {money((l.unitCost || 0) * l.qty)}</div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className={styles.sqTotals}>
              {showCosts && (
                <div className={styles.sqTotalRow}>
                  <span>Costo Nexara (sin IVA)</span>
                  <strong>{money(totals.cost)}</strong>
                </div>
              )}
              <div className={styles.sqTotalRow}>
                <span>Subtotal</span>
                <strong>{money(totals.subtotal)}</strong>
              </div>
              <div className={styles.sqTotalRow}>
                <span>IVA ({CT_IVA_PERCENT}%)</span>
                <strong>{money(totals.tax)}</strong>
              </div>
              <div className={`${styles.sqTotalRow} ${styles.sqTotalMain}`}>
                <span>Total al cliente</span>
                <span>{money(totals.sell)}</span>
              </div>
              {showCosts && (
                <div
                  className={styles.sqTotalRow}
                  style={{
                    color: totals.margin > 0 && totals.margin < 20 ? "#b45309" : undefined,
                  }}
                >
                  <span>Margen estimado</span>
                  <strong>{totals.count ? `${totals.margin.toFixed(1)}%` : "—"}</strong>
                </div>
              )}
            </div>

            {step === 3 && (
              <div style={{ display: "grid", gap: 8 }}>
                <Button variant="secondary" fullWidth onClick={() => void suggestLabor()} loading={loadingAction} disabled={!lines.length}>
                  Agregar instalación
                </Button>
                <Button variant="primary" fullWidth size="lg" onClick={() => void saveQuote()} loading={saving} disabled={!lines.length}>
                  Generar cotización
                </Button>
              </div>
            )}

            {step < 3 && lines.length > 0 && (
              <Button variant="primary" fullWidth onClick={() => goStep(3)}>
                Ir a confirmar ({lines.length})
              </Button>
            )}
          </div>
        </aside>
      </div>

      <div className={styles.sqStickyBar}>
        <div className={styles.sqStickyInner}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              {totals.count} conceptos · IVA incl.
            </div>
            <div style={{ fontWeight: 800 }}>{money(totals.sell)}</div>
          </div>
          {step < 3 ? (
            <Button
              variant="primary"
              onClick={() => goStep(step === 1 ? 2 : 3)}
              disabled={step === 1 ? false : !canGoStep3}
            >
              Continuar
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void saveQuote()} loading={saving} disabled={!lines.length}>
              Generar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
