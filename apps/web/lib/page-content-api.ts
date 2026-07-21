/**
 * NEXARA · Page Content API
 * ─────────────────────────
 * Consume `apps/api/src/page-content/`.
 *
 * Endpoints:
 *   GET  /studio/page-content/:section  → contenido de una sección
 *   PUT  /studio/page-content/:section  → guardar (Studio, requiere token)
 *   POST /studio/page-content/media     → subir imagen de página
 */

import { buildApiUrl } from "@/lib/api-base";

// ── Tipos de sección ─────────────────────────────────────────────────────────

export type HomeSection =
  | "home_hero"
  | "home_metricas"
  | "home_servicios"
  | "home_proceso"
  | "home_industrias"
  | "home_cta"
  | "page_home"
  | "page_servicios"
  | "page_soluciones"
  | "page_nosotros"
  | "page_contacto"
  | "seo_home"
  | "seo_servicios"
  | "seo_soluciones"
  | "seo_nosotros"
  | "seo_contacto"
  | "seo_proyectos"
  | "seo_blog"
  | "seo_cobertura";

export type PageVisualSection =
  | "page_home"
  | "page_servicios"
  | "page_soluciones"
  | "page_nosotros"
  | "page_contacto";

export interface PageContentRow {
  id: number;
  section: string;
  content: Record<string, unknown>;
  updatedBy: string | null;
  updatedAt: string;
  createdAt: string;
}

// ── Tipos de contenido por sección ───────────────────────────────────────────

export interface MetricaItem {
  value: string;
  label: string;
}

export interface ServicioItem {
  badge: string;
  title: string;
  text: string;
  href: string;
}

export interface ProcesoItem {
  num: string;
  title: string;
  text: string;
}

export interface HeroMediaConfig {
  mediaType: "carousel" | "video";
}

export interface CtaContent {
  eyebrow: string;
  title: string;
  titleAccent: string;
  text: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
}

/** Slot de imagen editable (desktop + móvil) dentro de una página pública. */
export type PageImageLayout =
  | "bleed_cinema"       // full-bleed, franja cinematográfica baja
  | "bleed_landscape"    // full-bleed, paisaje alto
  | "framed_wide"        // contenida 16:9
  | "framed_square"      // contenida 1:1
  | "portrait_featured"  // vertical editorial (columna historia)
  | "aside_compact"      // compacta lateral (contacto)
  | "inset_offset";      // ancha pero no full-bleed, con offset

export type PageImagePosition = "center" | "left" | "right" | "top" | "bottom";

export interface PageImageSlot {
  id: string;
  /** Etiqueta en Studio (ej. "Banda capacidades"). */
  label: string;
  desktopUrl: string;
  mobileUrl: string;
  alt: string;
  caption: string;
  /** Cómo se acomoda y dimensiona en la página. */
  layout: PageImageLayout;
  /** Encuadre del crop (object-position). */
  objectPosition?: PageImagePosition;
}

/** Specs de layout para Studio (medidas recomendadas al subir). */
export const PAGE_IMAGE_LAYOUTS: Record<
  PageImageLayout,
  {
    label: string;
    hint: string;
    desktop: { width: number; height: number; ratio: string };
    mobile: { width: number; height: number; ratio: string };
  }
> = {
  bleed_cinema: {
    label: "Franja cinema (full-bleed)",
    hint: "Banda ancha y baja, de borde a borde. Ideal entre secciones.",
    desktop: { width: 2400, height: 720, ratio: "10:3" },
    mobile: { width: 1080, height: 720, ratio: "3:2" },
  },
  bleed_landscape: {
    label: "Paisaje full-bleed",
    hint: "Imagen ancha de borde a borde, más alta que la franja cinema.",
    desktop: { width: 1920, height: 900, ratio: "32:15" },
    mobile: { width: 1080, height: 900, ratio: "6:5" },
  },
  framed_wide: {
    label: "Editorial ancha (contenida)",
    hint: "Dentro del ancho de contenido, proporción ~16:9.",
    desktop: { width: 1600, height: 900, ratio: "16:9" },
    mobile: { width: 1080, height: 720, ratio: "3:2" },
  },
  framed_square: {
    label: "Cuadrada contenida",
    hint: "Acento 1:1 centrado o en grid.",
    desktop: { width: 1200, height: 1200, ratio: "1:1" },
    mobile: { width: 1080, height: 1080, ratio: "1:1" },
  },
  portrait_featured: {
    label: "Retrato editorial",
    hint: "Vertical para columnas tipo historia / equipo. Desktop 3:4.",
    desktop: { width: 900, height: 1200, ratio: "3:4" },
    mobile: { width: 1080, height: 1350, ratio: "4:5" },
  },
  aside_compact: {
    label: "Compacta lateral",
    hint: "Pequeña, junto a formularios o asides. 4:5.",
    desktop: { width: 720, height: 900, ratio: "4:5" },
    mobile: { width: 1080, height: 810, ratio: "4:3" },
  },
  inset_offset: {
    label: "Inset con offset",
    hint: "Ancha pero no full-bleed; deja aire a un lado (editoriales).",
    desktop: { width: 1400, height: 800, ratio: "7:4" },
    mobile: { width: 1080, height: 720, ratio: "3:2" },
  },
};

export const PAGE_IMAGE_LAYOUT_OPTIONS = Object.entries(PAGE_IMAGE_LAYOUTS).map(
  ([id, meta]) => ({ id: id as PageImageLayout, ...meta }),
);

/** Visuales de una página pública (hero + slots estratégicos). */
export interface PageVisualsContent {
  heroDesktopUrl: string;
  heroMobileUrl: string;
  heroAlt: string;
  slots: PageImageSlot[];
}

// ── Defaults (fallback cuando la DB aún no tiene contenido) ──────────────────

export const DEFAULT_METRICAS: MetricaItem[] = [
  { value: "+10", label: "Años en campo" },
  { value: "+200", label: "Sitios implementados" },
  { value: "Puebla · CDMX", label: "Base de operación" },
  { value: "< 24 h", label: "Primera respuesta" },
];

export const DEFAULT_SERVICIOS: ServicioItem[] = [
  {
    badge: "CCTV",
    title: "Videovigilancia que se opera",
    text: "Diseño, instalación y monitoreo de cámaras IP. Grabación confiable, acceso remoto y mantenimiento sin sorpresas.",
    href: "/servicios#cctv",
  },
  {
    badge: "Redes",
    title: "Conectividad estable en cada sede",
    text: "Cableado, Wi‑Fi empresarial, enlaces y telefonía IP. La red deja de ser el cuello de botella de tu operación.",
    href: "/servicios#redes",
  },
  {
    badge: "Cómputo",
    title: "Infraestructura lista para el día a día",
    text: "Equipos, racks, respaldos y puesta a punto. Hardware y software alineados a cómo trabaja tu equipo.",
    href: "/servicios#computo",
  },
  {
    badge: "Soporte",
    title: "Mesa de ayuda que responde",
    text: "Tickets, visitas en sitio y continuidad. Cuando algo falla, hay un humano y un plan — no un buzón vacío.",
    href: "/servicios#soporte",
  },
];

export const DEFAULT_PROCESO: ProcesoItem[] = [
  {
    num: "01",
    title: "Diagnóstico",
    text: "Recorremos el sitio, levantamos riesgos y priorizamos lo que realmente mueve la operación.",
  },
  {
    num: "02",
    title: "Implementación",
    text: "Alcance cerrado, calendario visible e instalación con evidencia. Sin alcance abierto ni costos escondidos.",
  },
  {
    num: "03",
    title: "Operación",
    text: "Soporte, monitoreo y mejoras. Seguimos cuando el proyecto ya está en producción.",
  },
];

export const DEFAULT_INDUSTRIAS: string[] = [
  "Retail",
  "Manufactura",
  "Hospitalidad",
  "Salud",
  "Educación",
  "Gobierno",
];

/** Slugs canónicos para enlazar chips de industria a /soluciones/{slug} */
export const INDUSTRIA_SLUGS: Record<string, string> = {
  Retail: "retail",
  Manufactura: "manufactura",
  Hospitalidad: "hospitalidad",
  Salud: "salud",
  Educación: "educacion",
  Educacion: "educacion",
  Gobierno: "gobierno",
};

export const DEFAULT_HERO_MEDIA: HeroMediaConfig = {
  mediaType: "carousel",
};

export const DEFAULT_CTA: CtaContent = {
  eyebrow: "Siguiente paso",
  title: "Cuéntanos tu",
  titleAccent: "sitio o tu problema",
  text: "En una llamada corta te decimos qué conviene instalar, qué posponer y qué presupuesto tiene sentido.",
  primaryLabel: "Agendar diagnóstico",
  primaryHref: "/contacto",
  secondaryLabel: "Ver servicios",
  secondaryHref: "/servicios",
};

export const DEFAULT_PAGE_VISUALS: Record<PageVisualSection, PageVisualsContent> = {
  page_home: {
    heroDesktopUrl: "",
    heroMobileUrl: "",
    heroAlt: "Nexara",
    slots: [
      {
        id: "home_band_capabilities",
        label: "Franja cinema tras capacidades",
        desktopUrl: "/images/hero/hero-06.png",
        mobileUrl: "",
        alt: "Instalación Nexara en sitio",
        caption: "",
        layout: "bleed_cinema",
        objectPosition: "center",
      },
      {
        id: "home_band_industrias",
        label: "Paisaje antes de industrias",
        desktopUrl: "/images/hero/hero-04.png",
        mobileUrl: "",
        alt: "Operación tecnológica Nexara",
        caption: "",
        layout: "bleed_landscape",
        objectPosition: "top",
      },
    ],
  },
  page_servicios: {
    heroDesktopUrl: "/images/hero/hero-08.png",
    heroMobileUrl: "",
    heroAlt: "Centro de monitoreo Nexara",
    slots: [
      {
        id: "servicios_mid",
        label: "Inset editorial (mitad de página)",
        desktopUrl: "/images/hero/hero-02.png",
        mobileUrl: "",
        alt: "Redes e infraestructura Nexara",
        caption: "De la cobertura al soporte — una sola firma.",
        layout: "inset_offset",
        objectPosition: "left",
      },
    ],
  },
  page_soluciones: {
    heroDesktopUrl: "/images/hero/hero-03.png",
    heroMobileUrl: "",
    heroAlt: "Técnico Nexara en instalación",
    slots: [
      {
        id: "soluciones_mid",
        label: "Franja cinema antes del CTA",
        desktopUrl: "/images/hero/hero-07.png",
        mobileUrl: "",
        alt: "Soluciones por industria",
        caption: "Cada vertical con su riesgo típico.",
        layout: "bleed_cinema",
        objectPosition: "center",
      },
    ],
  },
  page_nosotros: {
    heroDesktopUrl: "/images/hero/hero-05.png",
    heroMobileUrl: "",
    heroAlt: "Equipo Nexara en campo",
    slots: [
      {
        id: "nosotros_story",
        label: "Retrato junto a la historia",
        desktopUrl: "/images/hero/hero-02.png",
        mobileUrl: "",
        alt: "Equipo de campo Nexara",
        caption: "",
        layout: "portrait_featured",
        objectPosition: "center",
      },
    ],
  },
  page_contacto: {
    heroDesktopUrl: "/images/hero/hero-01.png",
    heroMobileUrl: "",
    heroAlt: "Infraestructura Nexara",
    slots: [
      {
        id: "contacto_aside",
        label: "Compacta junto al formulario",
        desktopUrl: "/images/hero/hero-04.png",
        mobileUrl: "",
        alt: "Oficina y operación Nexara",
        caption: "",
        layout: "aside_compact",
        objectPosition: "center",
      },
    ],
  },
};

// ── Helpers de URL ───────────────────────────────────────────────────────────

/**
 * Resuelve URL de media de página para el navegador.
 * Nunca emitir hosts internos Docker (`nexara-api`) — en SSR `buildApiUrl`
 * usaría API_INTERNAL_URL y las <img> quedarían rotas en el HTML público.
 */
export function resolvePageMediaUrl(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      if (
        host === "nexara-api" ||
        host === "localhost" ||
        host === "127.0.0.1" ||
        host.endsWith(".internal")
      ) {
        const path = parsed.pathname.replace(/^\/api(?=\/)/, "") || "/";
        if (path.startsWith("/uploads/") || path.startsWith("/images/")) return path;
        return `/api${path.startsWith("/") ? path : `/${path}`}`;
      }
    } catch {
      /* keep absolute */
    }
    return url;
  }
  if (url.startsWith("/images/") || url.startsWith("/uploads/")) return url;
  const path = url.replace(/^\//, "");
  // Rutas API relativas (hero-slides, studio/page-content/media, …)
  return `/api/${path}`;
}

export function mergePageVisuals(
  section: PageVisualSection,
  stored: Partial<PageVisualsContent> | null | undefined,
): PageVisualsContent {
  const defaults = DEFAULT_PAGE_VISUALS[section];
  if (!stored) return structuredClone(defaults);

  const defaultSlots = defaults.slots;
  const storedSlots = Array.isArray(stored.slots) ? stored.slots : [];
  const byId = new Map(storedSlots.map((s) => [s.id, s]));

  const slots = defaultSlots.map((d) => {
    const s = byId.get(d.id);
    if (!s) return { ...d };
    return normalizeSlot({ ...d, ...s, id: d.id });
  });

  // Conserva slots extra que el editor haya añadido
  for (const s of storedSlots) {
    if (!slots.some((x) => x.id === s.id)) {
      slots.push(normalizeSlot(s));
    }
  }

  return {
    heroDesktopUrl: stored.heroDesktopUrl ?? defaults.heroDesktopUrl,
    heroMobileUrl: stored.heroMobileUrl ?? defaults.heroMobileUrl,
    heroAlt: stored.heroAlt ?? defaults.heroAlt,
    slots,
  };
}

function normalizeSlot(s: Partial<PageImageSlot> & { id?: string }): PageImageSlot {
  const layout =
    s.layout && s.layout in PAGE_IMAGE_LAYOUTS
      ? s.layout
      : ("framed_wide" as PageImageLayout);
  const objectPosition =
    s.objectPosition &&
    ["center", "left", "right", "top", "bottom"].includes(s.objectPosition)
      ? s.objectPosition
      : "center";
  return {
    id: s.id || `slot_${Date.now()}`,
    label: s.label || s.id || "Slot",
    desktopUrl: s.desktopUrl || "",
    mobileUrl: s.mobileUrl || "",
    alt: s.alt || "",
    caption: s.caption || "",
    layout,
    objectPosition,
  };
}

// ── Fetch server-side (Next.js Server Component) ─────────────────────────────

/**
 * Trae contenido de una sección desde la API.
 * - Revalida cada 5 minutos (ISR).
 * - Devuelve `null` si la sección no existe todavía (404) o falla la red.
 * - Nunca lanza, para que la página pública nunca falle por falta de contenido.
 */
export async function fetchPageSection<T = Record<string, unknown>>(
  section: HomeSection,
): Promise<T | null> {
  try {
    const res = await fetch(buildApiUrl(`studio/page-content/${section}`), {
      next: { revalidate: 300 }, // 5 min ISR
    });
    if (!res.ok) return null;
    const row: PageContentRow = await res.json();
    return row.content as T;
  } catch {
    return null;
  }
}

export async function fetchPageVisuals(
  section: PageVisualSection,
): Promise<PageVisualsContent> {
  const stored = await fetchPageSection<Partial<PageVisualsContent>>(section);
  return mergePageVisuals(section, stored);
}

// ── Fetch cliente (Studio) ───────────────────────────────────────────────────

export async function getPageSection(
  section: HomeSection,
  token: string,
): Promise<PageContentRow | null> {
  const res = await fetch(buildApiUrl(`studio/page-content/${section}`), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Error ${res.status} al cargar sección "${section}"`);
  return res.json();
}

export async function savePageSection(
  section: HomeSection,
  content: Record<string, unknown>,
  token: string,
  updatedBy?: string,
): Promise<PageContentRow> {
  const res = await fetch(buildApiUrl(`studio/page-content/${section}`), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content, updatedBy }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function uploadPageMedia(
  token: string,
  file: File,
): Promise<{ url: string }> {
  const form = new FormData();
  form.append("image", file);
  const res = await fetch(buildApiUrl("studio/page-content/media"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function listAllPageSections(token: string): Promise<PageContentRow[]> {
  const res = await fetch(buildApiUrl("studio/page-content"), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}
