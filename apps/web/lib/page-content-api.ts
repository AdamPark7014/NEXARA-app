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
  { value: "+10", label: "Años de experiencia" },
  { value: "+200", label: "Proyectos entregados" },
  { value: "99.9%", label: "Uptime promedio" },
  { value: "24/7", label: "Soporte continuo" },
];

export const DEFAULT_SERVICIOS: ServicioItem[] = [
  { badge: "Software", title: "Desarrollo a medida", text: "Plataformas web, móviles y APIs para procesos críticos. Arquitectura limpia, código mantenible y ciclos cortos.", href: "/servicios#software" },
  { badge: "Cloud", title: "Infraestructura en la nube", text: "Migración, optimización y operación en AWS, Azure y GCP. Costos bajo control y escalabilidad real.", href: "/servicios#cloud" },
  { badge: "Ciberseguridad", title: "Defensa empresarial", text: "Hardening, EDR, gestión de identidades y respuesta a incidentes. Protegemos la operación sin frenar al equipo.", href: "/servicios#ciberseguridad" },
  { badge: "Data & IA", title: "Datos que deciden", text: "BI, analítica avanzada e IA aplicada. Visibilidad, predicción y automatización donde realmente mueve la aguja.", href: "/servicios#data-ai" },
  { badge: "Conectividad", title: "Redes y telecomunicaciones", text: "Diseño, instalación y mantenimiento de redes, enlaces, CCTV y videovigilancia con monitoreo central.", href: "/servicios#conectividad" },
  { badge: "Transformación", title: "Acompañamiento estratégico", text: "Roadmaps tecnológicos, optimización de procesos y gobierno de TI. De la estrategia a la operación.", href: "/servicios#transformacion" },
];

export const DEFAULT_PROCESO: ProcesoItem[] = [
  { num: "01", title: "Diagnóstico", text: "Entendemos tu operación y tus objetivos antes de proponer nada." },
  { num: "02", title: "Diseño", text: "Alcance, tiempos y costos claros. Sin sorpresas ni letra chiquita." },
  { num: "03", title: "Implementación", text: "Ejecutamos con disciplina de campo e hitos visibles." },
  { num: "04", title: "Acompañamiento", text: "Soporte, monitoreo y mejora continua. Estamos cuando se complica." },
];

export const DEFAULT_INDUSTRIAS: string[] = [
  "Retail", "Manufactura", "Hospitalidad", "Salud", "Educación", "Gobierno",
];

export const DEFAULT_CTA: CtaContent = {
  eyebrow: "Listos cuando tú lo estés",
  title: "Hablemos de cómo",
  titleAccent: "blindar tu operación",
  text: "Una conversación honesta, sin compromiso. Te decimos qué se puede mejorar y qué tiene sentido invertir.",
  primaryLabel: "Agendar conversación",
  primaryHref: "/contacto",
  secondaryLabel: "Ver casos publicados",
  secondaryHref: "/proyectos",
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
