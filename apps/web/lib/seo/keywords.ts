/**
 * Master keyword taxonomy for Nexara SEO targeting.
 *
 * Covers every core business line:
 *   CCTV / videovigilancia · Equipo de cómputo · Redes y WiFi
 *   Soporte TI · ERP industrial · Infraestructura TI
 *
 * Geographic modifiers target Mexico, Puebla, CDMX, and surrounding cities
 * where Nexara operates or is known to have business presence.
 *
 * Usage:
 *   import { getPageKeywords, CCTV_BASE, GEO_LOCATIONS } from '@/lib/seo/keywords';
 *   keywords: getPageKeywords('cctv', 'Puebla')
 */

// ─── Geographic scope ─────────────────────────────────────────────────────────

export const GEO_LOCATIONS = [
  'Puebla',
  'CDMX',
  'Ciudad de Mexico',
  'Mexico',
  'Tlaxcala',
  'Cholula',
  'San Andres Cholula',
  'Veracruz',
  'Monterrey',
  'Guadalajara',
  'Estado de Mexico',
  'Queretaro',
  'Heroica Puebla de Zaragoza',
] as const;

export type GeoLocation = (typeof GEO_LOCATIONS)[number];

// ─── CCTV & Videovigilancia ───────────────────────────────────────────────────

export const CCTV_BASE: string[] = [
  'cctv',
  'camaras de seguridad',
  'camaras ip',
  'videovigilancia',
  'instalacion de camaras',
  'sistema de camaras',
  'circuito cerrado de television',
  'camaras hikvision',
  'camaras dahua',
  'nvr instalacion',
  'dvr camaras',
  'monitoreo de camaras',
  'camaras de vigilancia',
  'camaras hd',
  'camaras exterior',
  'camaras interior',
  'camaras para empresa',
  'camaras para negocio',
  'cctv empresarial',
  'instalacion videovigilancia',
  'venta de camaras de seguridad',
  'sistema de vigilancia ip',
];

// ─── Equipo de cómputo ────────────────────────────────────────────────────────

export const COMPUTO_BASE: string[] = [
  'computo',
  'equipo de computo',
  'computadoras',
  'laptops',
  'venta de computadoras',
  'renta de equipo de computo',
  'mantenimiento de computo',
  'soporte tecnico computo',
  'computadoras para empresa',
  'equipo de computo para oficina',
  'actualizacion de equipo',
  'renovacion tecnologica',
  'venta de laptops',
  'computadoras all in one',
  'workstations',
  'servidores pymes',
  'equipo informatico',
  'renta de laptops',
  'mantenimiento preventivo computadoras',
];

// ─── Redes y conectividad ──────────────────────────────────────────────────────

export const REDES_BASE: string[] = [
  'redes empresariales',
  'wifi empresarial',
  'cableado estructurado',
  'instalacion de redes',
  'red lan empresarial',
  'switches cisco',
  'mikrotik',
  'ubiquiti',
  'red inalambrica empresarial',
  'soporte de redes',
  'mantenimiento de redes',
  'infraestructura de red',
  'redes para empresas',
  'fibra optica empresarial',
  'punto de acceso wifi',
  'red corporativa',
];

// ─── Soporte TI ───────────────────────────────────────────────────────────────

export const SOPORTE_BASE: string[] = [
  'soporte tecnico',
  'soporte ti',
  'mesa de ayuda ti',
  'help desk',
  'mantenimiento preventivo',
  'mantenimiento correctivo',
  'outsourcing ti',
  'servicios gestionados ti',
  'soporte informatico',
  'soporte remoto',
  'soporte en sitio',
  'ti para empresas',
  'soporte tecnico para empresas',
  'outsourcing informatico',
  'administracion de redes',
];

// ─── ERP e infraestructura industrial ─────────────────────────────────────────

export const ERP_BASE: string[] = [
  'erp industrial',
  'software empresarial',
  'erp mexico',
  'sistema de gestion empresarial',
  'transformacion digital',
  'automatizacion de procesos',
  'control de inventarios',
  'sistema erp',
  'infraestructura ti',
  'ciberseguridad empresarial',
  'servicios gestionados',
  'plataforma empresarial',
];

// ─── Brand keywords ───────────────────────────────────────────────────────────

export const BRAND_KEYWORDS: string[] = [
  'nexara',
  'nexara puebla',
  'nexara cdmx',
  'nexara tecnologia',
  'nexara soluciones ti',
  'nexara cctv',
  'nexara computo',
  'nexara redes',
  'soluciones tecnologicas puebla',
  'empresa de tecnologia puebla',
  'empresa de ti mexico',
  'integracion tecnologica mexico',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Expands a base keyword list with geographic modifiers. */
export function expandWithGeo(
  keywords: string[],
  geos: readonly string[] = GEO_LOCATIONS,
): string[] {
  const expanded: string[] = [...keywords];
  for (const kw of keywords) {
    for (const geo of geos) {
      expanded.push(`${kw} ${geo}`);
      expanded.push(`${kw} en ${geo}`);
    }
  }
  return [...new Set(expanded.map((k) => k.toLowerCase().trim()))];
}

export type KeywordCategory = 'cctv' | 'computo' | 'redes' | 'soporte' | 'erp' | 'general';

const CATEGORY_MAP: Record<KeywordCategory, string[]> = {
  cctv:    CCTV_BASE,
  computo: COMPUTO_BASE,
  redes:   REDES_BASE,
  soporte: SOPORTE_BASE,
  erp:     ERP_BASE,
  general: [...CCTV_BASE.slice(0, 5), ...COMPUTO_BASE.slice(0, 5), ...SOPORTE_BASE.slice(0, 5)],
};

/**
 * Returns a focused keyword list (≤ 20 entries) for a given service category
 * and optional primary city.  Includes brand anchors automatically.
 *
 * @example
 *   getPageKeywords('cctv', 'Puebla')
 *   // ['nexara', 'nexara puebla', 'cctv', 'cctv Puebla', 'camaras de seguridad Puebla', ...]
 */
export function getPageKeywords(category: KeywordCategory, geo?: string): string[] {
  const base = CATEGORY_MAP[category].slice(0, 8);
  const geoSuffix = geo ?? 'Puebla';

  const geoKws = base.map((kw) => `${kw} ${geoSuffix}`);
  const raw = [
    ...BRAND_KEYWORDS.slice(0, 3),
    ...base,
    ...geoKws,
    `${CATEGORY_MAP[category][0]} CDMX`,
    `${CATEGORY_MAP[category][0]} Mexico`,
  ];

  return [...new Set(raw)].slice(0, 20);
}

/**
 * Infers the keyword category from a service slug.
 * Used in programmatic landing pages.
 */
export function categoryFromSlug(serviceSlug: string): KeywordCategory {
  if (/cctv|camara|vigilancia|videovig/.test(serviceSlug)) return 'cctv';
  if (/computo|equipo|laptop|computadora/.test(serviceSlug)) return 'computo';
  if (/red|wifi|cableado|conectividad/.test(serviceSlug)) return 'redes';
  if (/soporte|mesa|help|pyme/.test(serviceSlug)) return 'soporte';
  if (/erp|automatiz|industrial/.test(serviceSlug)) return 'erp';
  return 'general';
}

// ─── All keywords combined (for sitemap / discovery) ─────────────────────────

export const ALL_NEXARA_KEYWORDS: string[] = [
  ...new Set([
    ...BRAND_KEYWORDS,
    ...CCTV_BASE,
    ...COMPUTO_BASE,
    ...REDES_BASE,
    ...SOPORTE_BASE,
    ...ERP_BASE,
  ]),
];
