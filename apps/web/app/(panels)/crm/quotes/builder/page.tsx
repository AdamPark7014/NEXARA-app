"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  smartQuoteLogistics,
  smartQuoteSearch,
  smartQuoteSubstitutes,
  type LogisticsZone,
  type OptimizeMode,
  type QuoteLinePayload,
  type SmartOffer,
} from "@/lib/smart-quote-api";
import {
  codesForCity,
  fulfillmentOptionsFromStockRows,
  leadTimeForFulfillment,
  stockAtApiWarehouseFromRows,
  stockAtPreferred,
  warehouseApiLabel,
  warehouseLabel,
  type FulfillmentWarehouseOption,
} from "@/lib/ct-warehouse-labels";
import Modal from "@/components/ui/Modal";
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

type FacetOption = { name: string; count: number };

const BADGE_META: Record<
  string,
  { label: string; className: string }
> = {
  BEST_PRICE: { label: "Mejor precio", className: "sqBadgePrice" },
  BEST_STOCK: { label: "Más stock", className: "sqBadgeStock" },
  FASTEST: { label: "Entrega rápida", className: "sqBadgeSpeed" },
  BEST_MARGIN: { label: "Mejor margen", className: "sqBadgeRec" },
  RECOMMENDED: { label: "Recomendado", className: "sqBadgeRec" },
  SUBSTITUTE: { label: "Sustituto", className: "sqBadgeSpeed" },
};

const FALLBACK_ZONES: LogisticsZone[] = [
  { zoneCode: "LOCAL_PUE", zoneName: "Puebla (local)", baseCost: 350, basePrice: 650 },
  { zoneCode: "CDMX", zoneName: "Ciudad de México", baseCost: 900, basePrice: 1500 },
  { zoneCode: "FORANEO", zoneName: "Foráneo nacional", baseCost: 1800, basePrice: 2800 },
];

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

function formatEta(days: number | null | undefined): string {
  if (days == null || days <= 0) return "Consultar";
  if (days <= 1) return "Inmediata";
  return `${days}d`;
}

function formatSyncTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function offerHasPromo(offer: SmartOffer): boolean {
  return Boolean(offer.hasPromo || (offer.promociones && offer.promociones.length > 0));
}

function aggregateStockChips(
  rows: SmartOffer["stockByWarehouse"],
  preferredCodes: string[],
  max = 6,
): Array<{ city: string; qty: number; preferred: boolean }> {
  if (!rows?.length) return [];
  const pref = new Set(preferredCodes.map((c) => c.toUpperCase()));
  const byCity = new Map<string, { qty: number; preferred: boolean }>();
  for (const r of rows) {
    if (r.qty <= 0) continue;
    const city = r.city || warehouseLabel(r.code);
    const isPref = pref.has(r.code.toUpperCase());
    const prev = byCity.get(city);
    if (prev) {
      prev.qty += r.qty;
      prev.preferred = prev.preferred || isPref;
    } else {
      byCity.set(city, { qty: r.qty, preferred: isPref });
    }
  }
  return [...byCity.entries()]
    .map(([city, v]) => ({ city, ...v }))
    .sort((a, b) => {
      if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
      return b.qty - a.qty;
    })
    .slice(0, max);
}

function lineMarginWarning(l: QuoteLinePayload): string | null {
  const cost = Number(l.unitCost) || 0;
  const price = Number(l.unitPrice) || 0;
  if (cost <= 0 || price <= 0) return null;
  const margin = ((price - cost) / price) * 100;
  if (margin < 15) return `Margen bajo (${margin.toFixed(0)}%)`;
  if (margin < 20) return `Margen ajustado (${margin.toFixed(0)}%)`;
  return null;
}

function solutionPreviewItems(template: "CCTV" | "WIFI" | "ACCESS", cfg: {
  cameras: number;
  storageDays: number;
  accessPoints: number;
  doors: number;
}) {
  if (template === "CCTV") {
    const channels = Math.max(16, Math.ceil(cfg.cameras / 8) * 8);
    const tb = Math.max(2, Math.ceil((cfg.cameras * cfg.storageDays) / 60));
    return [
      { icon: "📷", text: `${cfg.cameras} cámara${cfg.cameras === 1 ? "" : "s"} IP (exterior/interior)` },
      { icon: "🖥️", text: `NVR ~${channels} canales` },
      { icon: "💾", text: `Disco HDD ~${tb} TB (${cfg.storageDays} días de grabación)` },
      { icon: "🔌", text: `Switch PoE (${Math.ceil(cfg.cameras / 16) || 1} u.)` },
      { icon: "🔋", text: "UPS sugerido (si aplica)" },
      { icon: "🛠️", text: "Instalación / cableado (opcional)" },
    ];
  }
  if (template === "WIFI") {
    return [
      { icon: "📶", text: `${cfg.accessPoints} access point${cfg.accessPoints === 1 ? "" : "s"} WiFi` },
      { icon: "🔌", text: `Switch PoE (${Math.ceil(cfg.accessPoints / 12) || 1} u.)` },
      { icon: "🛠️", text: "Instalación en sitio" },
    ];
  }
  return [
    { icon: "🚪", text: `${cfg.doors} punto${cfg.doors === 1 ? "" : "s"} de acceso` },
    { icon: "🪪", text: "Lectores / controladora" },
    { icon: "🔐", text: "Cerraduras magnéticas / pestillos" },
    { icon: "🛠️", text: "Instalación y configuración" },
  ];
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

function OfferStockRow({
  offer,
  preferredCodes,
  variant = "default",
}: {
  offer: SmartOffer;
  preferredCodes: string[];
  variant?: "default" | "strip";
}) {
  const prefQty = stockAtPreferred(offer.stockByWarehouse, preferredCodes) || offer.stockPreferred;
  const prefCity = warehouseLabel(preferredCodes[0] ?? "PUE");
  let chips = aggregateStockChips(offer.stockByWarehouse, preferredCodes);
  if (!chips.length && offer.stockTotal > 0) {
    chips = [{ city: "Red CT", qty: offer.stockTotal, preferred: prefQty > 0 }];
  }
  const eta = formatEta(offer.leadTimeDays);
  const etaFast = offer.leadTimeDays <= 1;
  const strip = variant === "strip";

  if (!offer.stockTotal) {
    return (
      <div className={strip ? styles.sqProductStockStrip : styles.sqStockRow}>
        <span className={`${styles.sqWhChip} ${styles.sqWhChipEmpty}`}>Sin stock CT</span>
        <span className={`${styles.sqEtaChip} ${styles.sqEtaChipWarn}`}>{eta}</span>
      </div>
    );
  }

  return (
    <div className={strip ? styles.sqProductStockStrip : styles.sqStockRow}>
      {strip ? <div className={styles.sqStockBandLabel}>Stock por ciudad</div> : null}
      <div className={styles.sqWhChips}>
        {chips.map((c) => (
          <span
            key={c.city}
            className={`${styles.sqWhChip} ${c.preferred ? styles.sqWhChipPref : ""}`}
            title={`${c.qty} u. en ${c.city}`}
          >
            {c.city} · {c.qty}
          </span>
        ))}
      </div>
      <div className={styles.sqStockMetaRow}>
        {prefQty > 0 ? (
          <span className={styles.sqPickupBadge} title={`Recoger en ${prefCity}`}>
            Recoger {prefCity}
          </span>
        ) : (
          <span className={styles.sqPickupBadgeRemote}>Pedir traslado</span>
        )}
        <span className={`${styles.sqEtaChip} ${etaFast ? styles.sqEtaChipFast : ""}`}>{eta}</span>
      </div>
    </div>
  );
}

function OfferBadges({ offer }: { offer: SmartOffer }) {
  const chips: Array<{ key: string; label: string; className: string }> = [];
  for (const b of offer.badges || []) {
    const meta = BADGE_META[b];
    if (meta) chips.push({ key: b, label: meta.label, className: styles[meta.className as keyof typeof styles] as string });
  }
  if (offerHasPromo(offer)) {
    chips.push({ key: "promo", label: "Promo", className: styles.sqBadgePromo });
  }
  if (offer.protegido) {
    chips.push({ key: "protegido", label: "Protegido", className: styles.sqBadgeProtected });
  }
  if (offer.moneda?.toUpperCase() === "USD" && offer.tipoCambio) {
    chips.push({
      key: "fx",
      label: `USD TC ${offer.tipoCambio.toFixed(2)}`,
      className: styles.sqBadgeFx,
    });
  }
  if (!chips.length) return null;
  return (
    <div className={styles.sqBadgeRow}>
      {chips.map((c) => (
        <span key={c.key} className={`${styles.sqBadgeChip} ${c.className}`}>
          {c.label}
        </span>
      ))}
    </div>
  );
}

function OfferMetaLine({ offer }: { offer: SmartOffer }) {
  const parts: Array<{ label: string; value: string }> = [];
  if (offer.marca) parts.push({ label: "Marca", value: offer.marca });
  if (offer.clave) parts.push({ label: "Clave", value: offer.clave });
  if (offer.numParte) parts.push({ label: "P/N", value: offer.numParte });
  if (offer.modelo) parts.push({ label: "Modelo", value: offer.modelo });
  if (!parts.length) return null;
  return (
    <div className={styles.sqMetaLine}>
      {parts.map((p) => (
        <span key={p.label}>
          <strong>{p.label}</strong>
          {p.value}
        </span>
      ))}
    </div>
  );
}

function CtStatusBar({
  ctStatus,
  preferredWarehouse,
}: {
  ctStatus: {
    total: number;
    withStock?: number;
    lastSync: { finishedAt?: string } | null;
    preferredWarehouse?: string;
  } | null;
  preferredWarehouse: string;
}) {
  if (!ctStatus) return null;
  const wh = preferredWarehouse || ctStatus.preferredWarehouse || "PUE";
  return (
    <div className={styles.sqHeaderMeta}>
      {ctStatus.lastSync?.finishedAt ? (
        <span className={styles.sqHeaderMetaItem}>
          <strong>Sync CT</strong> {formatSyncTime(ctStatus.lastSync.finishedAt)}
        </span>
      ) : null}
      {ctStatus.withStock != null ? (
        <span className={styles.sqHeaderMetaItem}>
          <strong>Con stock</strong> {ctStatus.withStock.toLocaleString("es-MX")}
        </span>
      ) : null}
      <span className={styles.sqHeaderMetaItem}>
        <strong>Recoger</strong> {warehouseLabel(wh)}
      </span>
      <span className={styles.sqHeaderMetaItem}>
        <strong>Catálogo</strong> {ctStatus.total.toLocaleString("es-MX")} SKUs
      </span>
    </div>
  );
}

function CartLineMeta({ line, showCosts }: { line: QuoteLinePayload; showCosts: boolean }) {
  const warn = showCosts ? lineMarginWarning(line) : null;
  const whCode = line.supplierWarehouseCode;
  const whStock =
    whCode && line.stockByWarehouse
      ? stockAtApiWarehouseFromRows(line.stockByWarehouse, whCode)
      : null;
  const stockShort = whStock != null && line.qty > whStock;
  return (
    <div className={styles.sqPosLineMeta}>
      {line.leadTimeDays != null ? (
        <span className={`${styles.sqEtaChip} ${line.leadTimeDays <= 1 ? styles.sqEtaChipFast : ""}`}>
          {line.deliveryTime || formatEta(line.leadTimeDays)}
        </span>
      ) : null}
      {whCode ? (
        <span className={stockShort ? styles.sqMarginWarn : undefined}>
          {warehouseApiLabel(whCode)}
          {whStock != null ? ` · ${whStock} u.` : ""}
        </span>
      ) : null}
      {!whCode && line.stockSnapshot != null && line.stockSnapshot > 0 ? (
        <span>{line.stockSnapshot} u. CT</span>
      ) : null}
      {warn ? <span className={styles.sqMarginWarn}>{warn}</span> : null}
    </div>
  );
}

function CartLineFulfillment({
  line,
  preferredCodes,
  onChange,
}: {
  line: QuoteLinePayload;
  preferredCodes: string[];
  onChange: (patch: Partial<QuoteLinePayload>) => void;
}) {
  if (!line.productCtId) return null;
  const opts = fulfillmentOptionsFromStockRows(line.stockByWarehouse, preferredCodes);
  if (!opts.length) return null;

  const selected = line.supplierWarehouseCode || opts[0].apiCode;
  const selectedOpt = opts.find((o) => o.apiCode === selected) || opts[0];
  const stockShort = selectedOpt.qty < line.qty;

  const pick = (apiCode: string) => {
    const opt =
      opts.find((o) => o.apiCode === apiCode) ||
      ({ apiCode, label: warehouseApiLabel(apiCode), qty: 0, local: false } as FulfillmentWarehouseOption);
    const eta = leadTimeForFulfillment(opt);
    onChange({
      supplierWarehouseCode: apiCode,
      leadTimeDays: eta.days,
      deliveryTime: eta.deliveryTime,
    });
  };

  return (
    <label className={styles.sqFulfillment}>
      <span>Obtener de</span>
      <select
        className={styles.sqFulfillmentSelect}
        value={selected}
        onChange={(e) => pick(e.target.value)}
        aria-label={`Almacén de surtido para ${line.name}`}
      >
        {opts.map((o) => (
          <option key={o.apiCode} value={o.apiCode}>
            {warehouseApiLabel(o.apiCode)} — {o.qty} u.{o.local ? " · local" : ""}
          </option>
        ))}
      </select>
      {stockShort ? (
        <span className={styles.sqFulfillmentWarn}>
          Solo {selectedOpt.qty} u. aquí (pides {line.qty})
        </span>
      ) : null}
    </label>
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
  const searchParams = useSearchParams();
  const prefClientId = searchParams.get("clientId");
  const prefClientName = searchParams.get("clientName");

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
  const [ctStatus, setCtStatus] = useState<{
    total: number;
    withStock?: number;
    lastSync: { finishedAt?: string } | null;
    preferredWarehouse?: string;
  } | null>(null);
  const [preferredWarehouse, setPreferredWarehouse] = useState("PUE");
  const [logisticsZones, setLogisticsZones] = useState<LogisticsZone[]>(FALLBACK_ZONES);
  const [subModalClave, setSubModalClave] = useState<string | null>(null);
  const [substitutes, setSubstitutes] = useState<SmartOffer[]>([]);
  const [loadingSubstitutes, setLoadingSubstitutes] = useState(false);
  const [marginAlert, setMarginAlert] = useState<string | null>(null);
  const [copilotPrompt, setCopilotPrompt] = useState("");
  const [copilotQuestions, setCopilotQuestions] = useState<string[]>([]);
  const [searchedOnce, setSearchedOnce] = useState(false);
  const [filterBrand, setFilterBrand] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [inStockOnly, setInStockOnly] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [facetBrands, setFacetBrands] = useState<FacetOption[]>([]);
  const [facetCategories, setFacetCategories] = useState<FacetOption[]>([]);
  const [moreFilters, setMoreFilters] = useState(false);
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
        if (prefClientId && list.some((c) => String(c.id) === prefClientId)) {
          setClientId(prefClientId);
        } else if (prefClientName) {
          const name = prefClientName.trim().toLowerCase();
          const match = list.find((c) => (c.name ?? "").trim().toLowerCase() === name);
          if (match) setClientId(String(match.id));
          else if (list.length === 1) setClientId(String(list[0].id));
        } else if (list.length === 1) {
          setClientId(String(list[0].id));
        }
      })
      .catch(() => setClients([]));
    smartQuoteCtStatus(token)
      .then((s) => {
        setCtStatus(s);
        if (s.preferredWarehouse) setPreferredWarehouse(s.preferredWarehouse);
      })
      .catch(() => setCtStatus(null));
    smartQuoteFacets(token)
      .then((f) => {
        setFacetBrands(
          (f.brands || [])
            .filter((b): b is { name: string; count: number } => Boolean(b.name))
            .map((b) => ({ name: b.name!, count: b.count }))
            .slice(0, 40),
        );
        setFacetCategories(
          (f.categories || [])
            .filter((c): c is { name: string; count: number } => Boolean(c.name))
            .map((c) => ({ name: c.name!, count: c.count }))
            .slice(0, 30),
        );
      })
      .catch(() => {
        setFacetBrands([]);
        setFacetCategories([]);
      });
    smartQuoteLogistics(token)
      .then((zones) => {
        if (zones?.length) setLogisticsZones(zones);
      })
      .catch(() => setLogisticsZones(FALLBACK_ZONES));
  }, [token, prefClientId, prefClientName]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!token || !subModalClave) {
      setSubstitutes([]);
      return;
    }
    setLoadingSubstitutes(true);
    smartQuoteSubstitutes(token, subModalClave, { optimize, targetMargin, take: 12 })
      .then(setSubstitutes)
      .catch(() => setSubstitutes([]))
      .finally(() => setLoadingSubstitutes(false));
  }, [token, subModalClave, optimize, targetMargin]);

  const client = useMemo(() => clients.find((c) => String(c.id) === clientId), [clients, clientId]);

  const qtyInCart = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of lines) {
      const key =
        (l.sku && `sku:${l.sku}`) ||
        (l.productCtId != null ? `id:${l.productCtId}` : `name:${l.name}`);
      map.set(key, (map.get(key) || 0) + l.qty);
    }
    return map;
  }, [lines]);

  const offerCartQty = (o: SmartOffer) => {
    if (o.clave) return qtyInCart.get(`sku:${o.clave}`) || 0;
    return qtyInCart.get(`id:${o.id}`) || 0;
  };

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

  const pickupWarehouseCodes = useMemo(() => {
    if (cfg.zone === "LOCAL_PUE") return codesForCity("Puebla");
    const wh = preferredWarehouse || ctStatus?.preferredWarehouse || "PUE";
    const city = warehouseLabel(wh);
    return [...new Set([wh, ...codesForCity(city)])];
  }, [cfg.zone, preferredWarehouse, ctStatus?.preferredWarehouse]);

  const runSearch = useCallback(
    async (qOverride?: string, signal?: AbortSignal) => {
      if (!token) return;
      const q = (qOverride ?? query).trim();
      if (qOverride !== undefined) setQuery(qOverride);
      setLoadingSearch(true);
      setError(null);
      setSearchedOnce(true);
      try {
        const res = await smartQuoteSearch(
          token,
          {
            q: q || undefined,
            brand: filterBrand || undefined,
            category: filterCategory || undefined,
            optimize,
            targetMargin,
            inStockOnly,
            take: 24,
          },
          { signal },
        );
        if (signal?.aborted) return;
        setOffers(res.data);
        if (res.meta?.preferredWarehouse) setPreferredWarehouse(res.meta.preferredWarehouse);
        if (!res.data.length) {
          setToast("Sin coincidencias. Prueba otra palabra o quita Stock.");
        }
      } catch (e) {
        if (signal?.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
        setError(e instanceof Error ? e.message : "No se pudo buscar en el catálogo");
      } finally {
        if (!signal?.aborted) setLoadingSearch(false);
      }
    },
    [token, query, optimize, targetMargin, filterBrand, filterCategory, inStockOnly],
  );

  // Catálogo vivo: aborta la petición anterior al tipear (evita colas lentas).
  useEffect(() => {
    if (!token || step !== 2 || path !== "search") return;
    const ac = new AbortController();
    const delay = query.trim() ? 220 : 60;
    const t = setTimeout(() => {
      void runSearch(undefined, ac.signal);
    }, delay);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
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

  const addOffer = (offer: SmartOffer, qty = 1) => {
    const n = Math.max(1, qty);
    setLines((prev) => {
      const idx = prev.findIndex(
        (l) =>
          (offer.clave && l.sku === offer.clave) ||
          (l.productCtId != null && l.productCtId === offer.id),
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + n };
        return next;
      }
      return [...prev, offerToLine(offer, n, optimize, targetMargin, pickupWarehouseCodes)];
    });
    setToast(`+${n} · ${shortName(offer.nombre || offer.clave, 36)}`);
  };

  const bumpLineQty = (idx: number, delta: number) => {
    setLines((prev) =>
      prev
        .map((l, i) => (i === idx ? { ...l, qty: Math.max(0, l.qty + delta) } : l))
        .filter((l) => l.qty > 0),
    );
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
    if (!clientId && !client?.name) {
      setError("Selecciona un cliente arriba (o en el carrito) antes de generar la cotización.");
      setToast("Falta el cliente para guardar la cotización");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const quoteNumber = `NXR-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
      const issueDate = new Date().toISOString().slice(0, 10);
      const validUntil = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
      const created = await createSalesQuote(token, {
        quoteNumber,
        issueDate,
        validUntil,
        salesClientId: client?.id,
        clientCompany: client?.name || client?.legalName || undefined,
        clientName: client?.name || "Cliente por definir",
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
          supplierCode: l.productCtId ? "CT" : l.supplierCode ?? undefined,
          productCtId: l.productCtId,
          supplierSku: l.supplierSku || undefined,
          marginPercent: l.marginPercent ?? undefined,
          stockSnapshot: l.stockSnapshot ?? undefined,
          leadTimeDays: l.leadTimeDays ?? undefined,
          scoreReason: l.scoreReason || undefined,
          optimizationMode: l.optimizationMode || optimize,
          supplierWarehouseCode: l.supplierWarehouseCode || undefined,
          laborHours: l.laborHours || 0,
          laborRate: l.laborRate || 0,
          deliveryTime: l.deliveryTime || undefined,
        })) as any,
      });
      const newId = Number((created as { id?: number })?.id);
      if (!Number.isFinite(newId) || newId <= 0) {
        setToast("Cotización guardada. Ábrela desde Mis cotizaciones.");
        router.push("/crm/quotes");
        return;
      }
      setToast(`Cotización ${quoteNumber} lista`);
      router.push(`/crm/quotes/${newId}`);
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
  const solutionPreview = useMemo(
    () => solutionPreviewItems(cfg.template, cfg),
    [cfg.template, cfg.cameras, cfg.storageDays, cfg.accessPoints, cfg.doors],
  );

  return (
    <div className={`${styles.sq} ${exploring ? styles.sqExploreMode : ""}`}>
      {!exploring ? (
      <PageHeader
        variant="hero"
        eyebrow="CRM · Cotizaciones"
        title="Cotizador profesional"
        subtitle={`${catalogHint}. Explora, filtra y cambia prioridad en tiempo real mientras armas la propuesta.`}
        meta={
          <>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              <Link href="/crm/quotes" style={{ color: "var(--text-tertiary)" }}>
                Volver a cotizaciones
              </Link>
            </span>
            <CtStatusBar ctStatus={ctStatus} preferredWarehouse={preferredWarehouse} />
          </>
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
            ← Mis cotizaciones
          </Link>
          <span className={styles.sqExploreTitle}>Explorador CT</span>
          <span className={styles.sqExploreHint}>{catalogHint}</span>
          <CtStatusBar ctStatus={ctStatus} preferredWarehouse={preferredWarehouse} />
        </div>
        <div className={styles.sqExploreTopActions}>
          <Link href="/crm/quotes" className={styles.sqMiniStep} style={{ textDecoration: "none" }}>
            Ver todas
          </Link>
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

      <div className={`${styles.sqLayout} ${exploring && lines.length > 0 ? styles.sqLayoutPos : ""}`}>
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
                      El catálogo muestra <strong>costo CT</strong> (neto). Al cliente se cotiza{" "}
                      <strong>precio de venta + IVA {CT_IVA_PERCENT}%</strong> según este margen.
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
                    <span className={styles.sqPathDesc}>
                      Explora el catálogo CT con stock por almacén, filtros por marca y ranking en vivo según tu prioridad.
                    </span>
                    <span className={styles.sqPathMeta}>Lo más usado · chips de almacén</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.sqPath} ${path === "solution" ? styles.sqPathOn : ""}`}
                    onClick={() => setPath("solution")}
                  >
                    <span className={styles.sqPathIcon}>🧩</span>
                    <span className={styles.sqPathTitle}>Armar solución</span>
                    <span className={styles.sqPathDesc}>
                      Describe el alcance (cámaras, APs, puertas) y armamos BOM con NVR, HDD, switch e instalación.
                    </span>
                    <span className={styles.sqPathMeta}>CCTV · WiFi · Acceso · preview en vivo</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.sqPath} ${path === "ai" ? styles.sqPathOn : ""}`}
                    onClick={() => setPath("ai")}
                  >
                    <span className={styles.sqPathIcon}>💬</span>
                    <span className={styles.sqPathTitle}>Describirlo</span>
                    <span className={styles.sqPathDesc}>
                      Escribe el proyecto en lenguaje natural; generamos borrador con precios CT y stock real.
                    </span>
                    <span className={styles.sqPathMeta}>Copiloto · borrador automático</span>
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
            <section className={`${styles.sqCard} ${styles.sqWorkspace} ${styles.sqPosDesk}`}>
              <div className={styles.sqControlDeck}>
                <div className={styles.sqPosToolbar}>
                  <input
                    className={styles.sqSearchInput}
                    autoFocus
                    placeholder="Buscar SKU, marca o producto… Enter agrega el primero"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (offers[0]) addOffer(offers[0], 1);
                      }
                    }}
                  />
                  <label className={styles.sqPosCheck}>
                    <input
                      type="checkbox"
                      checked={inStockOnly}
                      onChange={(e) => setInStockOnly(e.target.checked)}
                    />
                    Stock
                  </label>
                  <select
                    className={styles.sqInput}
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    aria-label="Cliente"
                  >
                    <option value="">Cliente…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setQuery("");
                      setFilterBrand("");
                      setFilterCategory("");
                    }}
                  >
                    Limpiar
                  </Button>
                  <button
                    type="button"
                    className={`${styles.sqMiniStep} ${moreFilters ? styles.sqMiniStepOn : ""}`}
                    onClick={() => setMoreFilters((v) => !v)}
                  >
                    Más
                  </button>
                  <div className={styles.sqViewToggle}>
                    <button
                      type="button"
                      className={`${styles.sqViewBtn} ${viewMode === "list" ? styles.sqViewBtnOn : ""}`}
                      onClick={() => setViewMode("list")}
                    >
                      Lista
                    </button>
                    <button
                      type="button"
                      className={`${styles.sqViewBtn} ${viewMode === "grid" ? styles.sqViewBtnOn : ""}`}
                      onClick={() => setViewMode("grid")}
                    >
                      Rejilla
                    </button>
                  </div>
                </div>

                {moreFilters && (
                  <div className={styles.sqPosMore}>
                    <div className={styles.sqPriorityStrip}>
                      {PRIORITIES.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className={`${styles.sqPriorityBtn} ${optimize === p.id ? styles.sqPriorityBtnOn : ""}`}
                          onClick={() => setOptimize(p.id)}
                          title={p.hint}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <div className={styles.sqPosMoreRow}>
                      <label className={styles.sqPosMargin}>
                        Margen {targetMargin}%
                        <input
                          type="range"
                          min={15}
                          max={55}
                          value={targetMargin}
                          onChange={(e) => setTargetMargin(Number(e.target.value))}
                        />
                      </label>
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
                          <option key={b.name} value={b.name}>
                            {b.name} ({b.count.toLocaleString("es-MX")})
                          </option>
                        ))}
                      </select>
                      <select
                        className={styles.sqInput}
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        aria-label="Categoría"
                      >
                        <option value="">Categoría</option>
                        {facetCategories.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name} ({c.count.toLocaleString("es-MX")})
                          </option>
                        ))}
                      </select>
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
                  </div>
                )}

                <div className={styles.sqLiveBar}>
                  <div className={styles.sqLiveMeta}>
                    <span className={styles.sqPulse} aria-hidden />
                    <span>
                      {loadingSearch
                        ? "Buscando…"
                        : `${offers.length} · clic = +1 · Enter = primero · ${PRIORITIES.find((p) => p.id === optimize)?.label}`}
                    </span>
                  </div>
                </div>
              </div>

              {loadingSearch && !offers.length ? (
                <div className={styles.sqDenseList}>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className={styles.sqDenseSkeleton} />
                  ))}
                </div>
              ) : null}

              {viewMode === "list" && offers.length > 0 ? (
                <div className={styles.sqDenseList} role="list">
                  {offers.map((o) => {
                    const inCart = offerCartQty(o);
                    return (
                      <div
                        key={o.id}
                        role="listitem"
                        className={`${styles.sqDenseRow} ${inCart ? styles.sqDenseRowOn : ""}`}
                      >
                        <button
                          type="button"
                          className={styles.sqDenseRowMain}
                          onClick={() => addOffer(o, 1)}
                          title="Clic para agregar +1"
                        >
                          <ProductThumb src={o.imagen} alt="" />
                          <div className={styles.sqDenseBody}>
                            <div className={styles.sqDenseName}>{o.nombre}</div>
                            <OfferMetaLine offer={o} />
                            <OfferBadges offer={o} />
                            {showCosts ? (
                              <div className={styles.sqDenseMeta}>CT {money(o.costMxn)} · venta {money(o.sellPriceSuggested)}</div>
                            ) : null}
                            <OfferStockRow offer={o} preferredCodes={pickupWarehouseCodes} />
                          </div>
                          <div className={styles.sqDensePriceCol}>
                            <div className={styles.sqDensePrice}>{money(o.sellPriceSuggested)}</div>
                            <div className={styles.sqDenseTax}>venta neto · +IVA</div>
                          </div>
                        </button>
                        {o.clave ? (
                          <button
                            type="button"
                            className={styles.sqSubstBtn}
                            onClick={() => setSubModalClave(o.clave!)}
                            title="Ver sustitutos"
                          >
                            ↔ Alt.
                          </button>
                        ) : null}
                        {inCart > 0 ? <span className={styles.sqDenseBadge}>×{inCart}</span> : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {viewMode === "grid" && offers.length > 0 ? (
                <div className={styles.sqProductGrid}>
                  {offers.map((o) => {
                    const rec = o.badges.includes("RECOMMENDED");
                    const img = ctProxiedImageUrl(o.imagen);
                    const inCart = offerCartQty(o);
                    return (
                      <article
                        key={o.id}
                        className={`${styles.sqProductCard} ${rec ? styles.sqProductCardRec : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => addOffer(o, 1)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            addOffer(o, 1);
                          }
                        }}
                      >
                        <div className={styles.sqProductMedia}>
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img} alt="" loading="lazy" referrerPolicy="no-referrer" />
                          ) : (
                            <span className={styles.sqThumbFallback}>Sin imagen</span>
                          )}
                          {inCart > 0 ? (
                            <span className={styles.sqDenseBadge} style={{ position: "absolute", top: 8, right: 8 }}>
                              ×{inCart}
                            </span>
                          ) : rec ? (
                            <span
                              className={styles.sqBadgeRec}
                              style={{ position: "absolute", top: 8, left: 8 }}
                            >
                              Top
                            </span>
                          ) : null}
                        </div>
                        <OfferStockRow offer={o} preferredCodes={pickupWarehouseCodes} variant="strip" />
                        <div className={styles.sqProductBody}>
                          <div className={styles.sqProductName} title={o.nombre || undefined}>
                            {o.nombre}
                          </div>
                          <OfferMetaLine offer={o} />
                          <OfferBadges offer={o} />
                          <div className={styles.sqProductFoot}>
                            <div>
                              <div className={styles.sqProductPrice}>{money(o.sellPriceSuggested)}</div>
                              <div className={styles.sqProductCost}>sin IVA · clic = +1</div>
                            </div>
                            {o.clave ? (
                              <button
                                type="button"
                                className={styles.sqSubstBtn}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSubModalClave(o.clave!);
                                }}
                              >
                                ↔ Alt.
                              </button>
                            ) : null}
                          </div>
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
                      ? "Prueba otra palabra o desactiva “Stock” en la barra."
                      : "En un momento verás productos recomendados."
                  }
                />
              )}
            </section>
          )}

          {step === 2 && path === "solution" && (
            <section className={styles.sqCard}>
              <div>
                <h2 className={styles.sqCardTitle}>Arma una solución completa</h2>
                <p className={styles.sqCardLead}>
                  Elige el tipo de proyecto, ajusta cantidades y zona de entrega. Incluimos equipos, accesorios e instalación sugerida.
                </p>
              </div>

              <div className={styles.sqSolutionGrid}>
                <div className={styles.sqSolutionTemplates}>
                  {(
                    [
                      {
                        id: "CCTV" as const,
                        icon: "📹",
                        title: "Videovigilancia",
                        desc: "Cámaras IP + grabador NVR, almacenamiento HDD y red PoE para el sitio.",
                        includes: ["Cámaras", "NVR", "HDD", "Switch PoE"],
                      },
                      {
                        id: "WIFI" as const,
                        icon: "📶",
                        title: "Red WiFi",
                        desc: "Cobertura inalámbrica con access points gestionados y switch PoE.",
                        includes: ["Access points", "Switch PoE", "Instalación"],
                      },
                      {
                        id: "ACCESS" as const,
                        icon: "🚪",
                        title: "Control de acceso",
                        desc: "Lectores, controladora y cerraduras para puertas peatonales o vehiculares.",
                        includes: ["Lectores", "Controladora", "Cerraduras"],
                      },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`${styles.sqSolutionCard} ${cfg.template === t.id ? styles.sqSolutionCardOn : ""}`}
                      onClick={() => setCfg({ ...cfg, template: t.id })}
                    >
                      <span className={styles.sqSolutionIcon} aria-hidden>
                        {t.icon}
                      </span>
                      <span>
                        <div className={styles.sqSolutionCardTitle}>{t.title}</div>
                        <div className={styles.sqSolutionCardDesc}>{t.desc}</div>
                        <div className={styles.sqSolutionIncludes}>
                          {t.includes.map((inc) => (
                            <span key={inc} className={styles.sqSolutionIncludeChip}>
                              {inc}
                            </span>
                          ))}
                        </div>
                      </span>
                    </button>
                  ))}

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
                  </div>

                  <div>
                    <div className={styles.sqLabel} style={{ marginBottom: 8 }}>
                      Zona de entrega / instalación
                    </div>
                    <div className={styles.sqZoneGrid}>
                      {logisticsZones.map((z) => (
                        <button
                          key={z.zoneCode}
                          type="button"
                          className={`${styles.sqZoneOption} ${cfg.zone === z.zoneCode ? styles.sqZoneOptionOn : ""}`}
                          onClick={() => setCfg({ ...cfg, zone: z.zoneCode })}
                        >
                          <span>
                            <div className={styles.sqZoneName}>{z.zoneName}</div>
                            <div className={styles.sqZoneHint}>
                              Logística estimada {money(Number(z.basePrice))} · costo {money(Number(z.baseCost))}
                            </div>
                          </span>
                          {cfg.zone === z.zoneCode ? <span aria-hidden>✓</span> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={styles.sqSolutionPreview}>
                  <div className={styles.sqSolutionPreviewTitle}>Tu paquete incluirá</div>
                  <ul className={styles.sqSolutionPreviewList}>
                    {solutionPreview.map((item) => (
                      <li key={item.text} className={styles.sqSolutionPreviewItem}>
                        <span className={styles.sqSolutionPreviewIcon} aria-hidden>
                          {item.icon}
                        </span>
                        <span>{item.text}</span>
                      </li>
                    ))}
                  </ul>
                  <div className={styles.sqSolutionPreviewHint}>
                    Buscamos equipos con stock CT según tu prioridad ({PRIORITIES.find((p) => p.id === optimize)?.label}).
                    Puedes ajustar todo después en el explorador o en confirmar.
                  </div>
                </div>
              </div>

              <div className={styles.sqFooter}>
                <Button variant="ghost" onClick={() => setStep(1)}>
                  Atrás
                </Button>
                <Button variant="primary" size="lg" onClick={() => void runConfigure()} loading={loadingAction}>
                  Armar propuesta completa
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

        {exploring && lines.length > 0 && (
          <aside className={styles.sqPosCart} aria-label="Propuesta">
            <div className={styles.sqPosCartHead}>
              <div className={styles.sqRailEyebrow}>PROPUESTA</div>
              <div className={styles.sqPosCartTitle}>
                {client?.name || "Sin cliente"}
                {projectName ? ` · ${projectName}` : ""}
              </div>
            </div>
            <div className={styles.sqPosCartLines}>
              {lines.map((l, idx) => (
                <div key={`${l.sku || l.name}-${idx}`} className={styles.sqPosLine}>
                  <div className={styles.sqPosLineName}>{shortName(l.name, 36)}</div>
                  <CartLineFulfillment
                    line={l}
                    preferredCodes={pickupWarehouseCodes}
                    onChange={(patch) =>
                      setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)))
                    }
                  />
                  <CartLineMeta line={l} showCosts={showCosts} />
                  <div className={styles.sqPosLineControls}>
                    <button type="button" className={styles.sqQtyBtn} onClick={() => bumpLineQty(idx, -1)} aria-label="Menos">
                      −
                    </button>
                    <span className={styles.sqPosQty}>{l.qty}</span>
                    <button type="button" className={styles.sqQtyBtn} onClick={() => bumpLineQty(idx, 1)} aria-label="Más">
                      +
                    </button>
                    <strong className={styles.sqPosLineTotal}>{money(lineSell(l))}</strong>
                    <button
                      type="button"
                      className={styles.sqGhostBtn}
                      aria-label="Quitar"
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.sqTotals}>
              {showCosts && (
                <div className={styles.sqTotalRow}>
                  <span>Costo</span>
                  <strong>{money(totals.cost)}</strong>
                </div>
              )}
              <div className={styles.sqTotalRow}>
                <span>Subtotal</span>
                <strong>{money(totals.subtotal)}</strong>
              </div>
              <div className={styles.sqTotalRow}>
                <span>IVA {CT_IVA_PERCENT}%</span>
                <strong>{money(totals.tax)}</strong>
              </div>
              <div className={`${styles.sqTotalRow} ${styles.sqTotalMain}`}>
                <span>Total</span>
                <span>{money(totals.sell)}</span>
              </div>
              {showCosts && (
                <div className={styles.sqTotalRow}>
                  <span>Margen</span>
                  <strong>{totals.margin.toFixed(1)}%</strong>
                </div>
              )}
            </div>
            {!clientId && (
              <select
                className={styles.sqInput}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                aria-label="Cliente"
                style={{ borderColor: "color-mix(in srgb, #b45309 55%, var(--border))" }}
              >
                <option value="">Cliente obligatorio…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <Button
              variant="primary"
              fullWidth
              size="lg"
              onClick={() => void saveQuote()}
              loading={saving}
              disabled={!lines.length}
            >
              Generar y ver cotización
            </Button>
            <Link
              href="/crm/quotes"
              style={{
                display: "block",
                textAlign: "center",
                fontSize: 12.5,
                fontWeight: 650,
                color: "var(--text-tertiary)",
                textDecoration: "none",
              }}
            >
              Ver todas mis cotizaciones
            </Link>
          </aside>
        )}

        {!exploring && (
        <aside className={styles.sqRail}>
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

            {showCosts && (
              <div className={styles.sqPricingCallout}>
                <strong>Vista interna:</strong> costo CT (neto) → venta al cliente + IVA {CT_IVA_PERCENT}%.
                El PDF para el cliente solo muestra precio de venta.
              </div>
            )}

            <div style={{ display: "grid", gap: 10, maxHeight: 300, overflow: "auto" }}>
              {lines.length === 0 ? (
                <div className={styles.sqHelp} style={{ padding: "4px 0" }}>
                  Aquí aparecerá todo lo que agregues.
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
                    <CartLineFulfillment
                      line={l}
                      preferredCodes={pickupWarehouseCodes}
                      onChange={(patch) =>
                        setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)))
                      }
                    />
                    <CartLineMeta line={l} showCosts={showCosts} />
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
                    {showCosts && l.unitCost != null && l.unitCost > 0 && (
                      <div className={styles.sqLineEconomics}>
                        <span>CT {money(l.unitCost)}/u</span>
                        <span>Venta {money(l.unitPrice)}/u</span>
                        <span>
                          Margen{" "}
                          {l.unitPrice > 0
                            ? `${(((l.unitPrice - l.unitCost) / l.unitPrice) * 100).toFixed(0)}%`
                            : "—"}
                        </span>
                      </div>
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
        )}
      </div>

      {!exploring && (
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
      )}

      <Modal
        open={Boolean(subModalClave)}
        onClose={() => setSubModalClave(null)}
        title={subModalClave ? `Alternativas · ${subModalClave}` : "Alternativas"}
        maxWidth={640}
      >
        {loadingSubstitutes ? (
          <div className={styles.sqHelp}>Buscando sustitutos con stock CT…</div>
        ) : substitutes.length === 0 ? (
          <EmptyState
            icon="↔"
            title="Sin alternativas"
            description="No encontramos sustitutos compatibles para este SKU."
          />
        ) : (
          <div className={styles.sqSubstList}>
            {substitutes.map((o) => (
              <div key={o.id} className={styles.sqSubstRow}>
                <ProductThumb src={o.imagen} alt="" />
                <div>
                  <div className={styles.sqDenseName}>{o.nombre}</div>
                  <OfferMetaLine offer={o} />
                  <OfferBadges offer={o} />
                  <OfferStockRow offer={o} preferredCodes={pickupWarehouseCodes} />
                  <div className={styles.sqDenseMeta} style={{ marginTop: 6 }}>
                    {money(o.sellPriceSuggested)} venta · CT {money(o.costMxn)}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    addOffer(o, 1);
                    setSubModalClave(null);
                  }}
                >
                  Agregar
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
