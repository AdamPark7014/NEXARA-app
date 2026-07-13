/**
 * NEXARA · Page Content API
 * ─────────────────────────
 * Consume `apps/api/src/page-content/`.
 *
 * Endpoints:
 *   GET /studio/page-content/:section  → contenido de una sección
 *   PUT /studio/page-content/:section  → guardar (Studio, requiere token)
 *
 * Se usa en dos contextos:
 *   1. Server Component (Next.js) → fetch con revalidación
 *   2. Studio editor (client)     → fetch autenticado
 */

import { buildApiUrl } from "@/lib/api-base";

// ── Tipos de sección ─────────────────────────────────────────────────────────

export type HomeSection =
  | "home_hero"
  | "home_metricas"
  | "home_servicios"
  | "home_proceso"
  | "home_industrias"
  | "home_cta";

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

export async function listAllPageSections(token: string): Promise<PageContentRow[]> {
  const res = await fetch(buildApiUrl("studio/page-content"), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}
