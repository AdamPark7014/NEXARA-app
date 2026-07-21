/**
 * SEO editable desde Studio (title, description, Open Graph).
 * Secciones PageContent: seo_home, seo_servicios, …
 */

import type { Metadata } from "next";
import { fetchPageSection, resolvePageMediaUrl } from "@/lib/page-content-api";

export type PageSeoKey =
  | "home"
  | "servicios"
  | "soluciones"
  | "nosotros"
  | "contacto"
  | "proyectos"
  | "blog"
  | "cobertura";

export type PageSeoSection = `seo_${PageSeoKey}`;

export interface PageSeoContent {
  /** <title> (sin sufijo de plantilla si ya incluye NEXARA) */
  title: string;
  /** meta description (~150–160 caracteres) */
  description: string;
  /** og:title — si vacío, usa title */
  ogTitle: string;
  /** og:description — si vacío, usa description */
  ogDescription: string;
  /** Imagen OG 1200×630 */
  ogImageUrl: string;
  /** Keywords separadas por coma */
  keywords: string;
  /** true = noindex */
  noIndex: boolean;
}

export const PAGE_SEO_KEYS: PageSeoKey[] = [
  "home",
  "servicios",
  "soluciones",
  "nosotros",
  "contacto",
  "proyectos",
  "blog",
  "cobertura",
];

export const PAGE_SEO_META: Record<
  PageSeoKey,
  { label: string; path: string; section: PageSeoSection }
> = {
  home: { label: "Inicio", path: "/", section: "seo_home" },
  servicios: { label: "Servicios", path: "/servicios", section: "seo_servicios" },
  soluciones: { label: "Soluciones", path: "/soluciones", section: "seo_soluciones" },
  nosotros: { label: "Nosotros", path: "/nosotros", section: "seo_nosotros" },
  contacto: { label: "Contacto", path: "/contacto", section: "seo_contacto" },
  proyectos: { label: "Proyectos", path: "/proyectos", section: "seo_proyectos" },
  blog: { label: "Blog", path: "/blog", section: "seo_blog" },
  cobertura: { label: "Cobertura", path: "/cobertura", section: "seo_cobertura" },
};

const DEFAULT_OG = "/logo-nexara-lockup.png";

export const DEFAULT_PAGE_SEO: Record<PageSeoKey, PageSeoContent> = {
  home: {
    title: "NEXARA | CCTV, Cómputo, Redes y Soluciones TI en México",
    description:
      "NEXARA: cámaras CCTV, equipo de cómputo, redes WiFi, soporte TI y ERP industrial para empresas en Puebla, CDMX y toda México.",
    ogTitle: "NEXARA | Soluciones TI para un mundo conectado",
    ogDescription:
      "CCTV, redes, cómputo y soporte TI con una sola firma responsable. Puebla · CDMX · cobertura nacional.",
    ogImageUrl: DEFAULT_OG,
    keywords:
      "cctv Puebla, cámaras de seguridad, redes empresariales, soporte TI, equipo de cómputo, Nexara",
    noIndex: false,
  },
  servicios: {
    title: "Servicios | CCTV, redes, cómputo y soporte TI",
    description:
      "Seguridad inteligente, conectividad, infraestructura TI, soporte y plataformas a medida — soluciones diseñadas para operar desde el primer día.",
    ogTitle: "Servicios NEXARA — CCTV, redes y soporte TI",
    ogDescription:
      "Videovigilancia, redes Wi‑Fi, cómputo y mesa de ayuda con instalación y operación bajo el mismo contrato.",
    ogImageUrl: DEFAULT_OG,
    keywords: "servicios CCTV, redes empresariales, soporte TI México, infraestructura TI",
    noIndex: false,
  },
  soluciones: {
    title: "Soluciones por industria | Nexara",
    description:
      "Soluciones Nexara por vertical: retail, manufactura, hospitalidad, salud, educación y gobierno.",
    ogTitle: "Soluciones por industria | Nexara",
    ogDescription:
      "Cada vertical con su riesgo típico: CCTV, redes y soporte alineados a tu operación.",
    ogImageUrl: DEFAULT_OG,
    keywords: "soluciones TI por industria, CCTV retail, redes manufactura",
    noIndex: true,
  },
  nosotros: {
    title: "Nosotros | Equipo de integración tecnológica",
    description:
      "Quiénes somos: ingeniería, implementación y soporte tecnológico desde Puebla y Ciudad de México, con cobertura nacional.",
    ogTitle: "Nosotros | Nexara",
    ogDescription: "Donde la tecnología se convierte en resultados operativos.",
    ogImageUrl: DEFAULT_OG,
    keywords: "empresa tecnología Puebla, integradores TI México, Nexara equipo",
    noIndex: false,
  },
  contacto: {
    title: "Contacto | Cotiza CCTV, redes y soporte TI",
    description:
      "Contacta a NEXARA para cotizaciones, soporte TI, CCTV, redes y proyectos tecnológicos en Puebla, CDMX y México.",
    ogTitle: "Contacto | NEXARA",
    ogDescription: "Agenda un diagnóstico. Te decimos qué instalar, qué posponer y qué presupuesto tiene sentido.",
    ogImageUrl: DEFAULT_OG,
    keywords: "cotizar CCTV Puebla, contacto Nexara, soporte TI CDMX",
    noIndex: false,
  },
  proyectos: {
    title: "Proyectos | Casos de integración tecnológica",
    description:
      "Casos y proyectos representativos ejecutados por Nexara en retail, manufactura, hospitalidad y más.",
    ogTitle: "Proyectos | Nexara",
    ogDescription: "Implementaciones reales de CCTV, redes y soporte en sitios que no pueden fallar.",
    ogImageUrl: DEFAULT_OG,
    keywords: "casos de éxito TI, proyectos CCTV, implementación redes",
    noIndex: false,
  },
  blog: {
    title: "Blog | Noticias y guías de campo",
    description:
      "Noticias, guías y notas de campo sobre CCTV, redes, cómputo y soporte TI.",
    ogTitle: "Blog | Nexara",
    ogDescription: "Notas prácticas de instalación, operación y soporte tecnológico.",
    ogImageUrl: DEFAULT_OG,
    keywords: "blog CCTV, guías redes empresariales, soporte TI",
    noIndex: false,
  },
  cobertura: {
    title: "Cobertura y clientes | NEXARA en México",
    description:
      "Cobertura de proyectos NEXARA y referencias de clientes en México: CCTV, cómputo, redes y soporte TI.",
    ogTitle: "Cobertura | NEXARA",
    ogDescription: "Operamos desde Puebla y CDMX con alcance a toda la República.",
    ogImageUrl: DEFAULT_OG,
    keywords: "cobertura Nexara, CCTV México, soporte TI nacional",
    noIndex: false,
  },
};

export function seoSectionFor(key: PageSeoKey): PageSeoSection {
  return PAGE_SEO_META[key].section;
}

export function mergePageSeo(
  key: PageSeoKey,
  stored: Partial<PageSeoContent> | null | undefined,
): PageSeoContent {
  const defaults = DEFAULT_PAGE_SEO[key];
  if (!stored) return { ...defaults };
  return {
    title: normalize(stored.title) || defaults.title,
    description: normalize(stored.description) || defaults.description,
    ogTitle: normalize(stored.ogTitle) || defaults.ogTitle,
    ogDescription: normalize(stored.ogDescription) || defaults.ogDescription,
    ogImageUrl: normalize(stored.ogImageUrl) || defaults.ogImageUrl,
    keywords: normalize(stored.keywords) || defaults.keywords,
    noIndex: typeof stored.noIndex === "boolean" ? stored.noIndex : defaults.noIndex,
  };
}

function normalize(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function parseKeywords(raw: string): string[] {
  return raw
    .split(/[,;]+/)
    .map((k) => k.trim())
    .filter(Boolean);
}

function absoluteOgImage(url: string, siteUrl: string): string {
  const resolved = resolvePageMediaUrl(url) || url;
  if (/^https?:\/\//i.test(resolved)) return resolved;
  const path = resolved.startsWith("/") ? resolved : `/${resolved}`;
  return `${siteUrl}${path}`;
}

/** Carga SEO desde Studio (ISR 5 min) y fusiona con defaults. */
export async function fetchPageSeo(key: PageSeoKey): Promise<PageSeoContent> {
  const stored = await fetchPageSection<Partial<PageSeoContent>>(seoSectionFor(key));
  return mergePageSeo(key, stored);
}

/**
 * Metadata Next.js a partir del SEO editable en Studio.
 * Usa defaults de código si Studio aún no tiene fila guardada.
 */
export async function buildStudioPageMetadata(key: PageSeoKey): Promise<Metadata> {
  const seo = await fetchPageSeo(key);
  const meta = PAGE_SEO_META[key];
  const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || "https://nexara.com.mx").replace(/\/+$/, "");
  const path = meta.path;
  const pageUrl = path === "/" ? siteUrl : `${siteUrl}${path}`;
  const ogImage = absoluteOgImage(seo.ogImageUrl || DEFAULT_OG, siteUrl);
  const ogTitle = seo.ogTitle || seo.title;
  const ogDescription = seo.ogDescription || seo.description;
  const keywords = parseKeywords(seo.keywords);

  return {
    title: {
      absolute: seo.title,
    },
    description: seo.description,
    keywords: keywords.length ? keywords : undefined,
    alternates: { canonical: path },
    robots: seo.noIndex
      ? { index: false, follow: true }
      : { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: "es_MX",
      url: pageUrl,
      siteName: "NEXARA",
      title: ogTitle,
      description: ogDescription,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: ogTitle,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      images: [ogImage],
    },
  };
}
