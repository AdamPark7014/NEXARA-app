import { findServiceLanding, SERVICE_LANDINGS } from "@/lib/seo/programmatic-landings";

/**
 * Ciudades objetivo para SEO local (intención “CCTV Puebla”, “redes CDMX”, …).
 */

export type GeoCity = {
  slug: string;
  name: string;
  region: string;
  mode: "base" | "campo" | "extendida";
  blurb: string;
  keywords: string[];
};

/** Servicios con búsqueda local más fuerte (ciudad × servicio). */
export const GEO_SERVICE_SLUGS = [
  "camaras-cctv",
  "redes-y-conectividad",
  "soporte-ti-pyme",
  "equipo-de-computo",
  "infraestructura-ti",
] as const;

export type GeoServiceSlug = (typeof GEO_SERVICE_SLUGS)[number];

export const GEO_CITIES: GeoCity[] = [
  {
    slug: "puebla",
    name: "Puebla",
    region: "Puebla",
    mode: "base",
    blurb:
      "Base operativa principal. Cuadrillas propias, respuesta local y proyectos de CCTV, redes y soporte con levantamiento en sitio el mismo día hábil en muchos casos.",
    keywords: ["cctv Puebla", "camaras de seguridad Puebla", "redes empresariales Puebla", "soporte TI Puebla"],
  },
  {
    slug: "cdmx",
    name: "Ciudad de México",
    region: "CDMX",
    mode: "base",
    blurb:
      "Segunda ancla operativa. Instalación y soporte en CDMX y zona metropolitana: retail multi-sede, oficinas y plantas con SLA claros.",
    keywords: ["cctv CDMX", "camaras de seguridad CDMX", "wifi empresarial CDMX", "soporte TI CDMX"],
  },
  {
    slug: "cholula",
    name: "San Andrés Cholula",
    region: "Puebla",
    mode: "base",
    blurb:
      "Cobertura inmediata desde Puebla: campus, retail y oficinas en Cholula / Angelópolis con los mismos estándares de campo.",
    keywords: ["cctv Cholula", "redes Cholula", "soporte TI Angelopolis"],
  },
  {
    slug: "tlaxcala",
    name: "Tlaxcala",
    region: "Tlaxcala",
    mode: "campo",
    blurb:
      "Campo cercano a la base Puebla. Ideal para plantas, bodegas y cadenas con sedes en el corredor Puebla–Tlaxcala.",
    keywords: ["cctv Tlaxcala", "redes Tlaxcala", "soporte TI Tlaxcala"],
  },
  {
    slug: "queretaro",
    name: "Querétaro",
    region: "Querétaro",
    mode: "campo",
    blurb:
      "Bajío industrial: manufactura, logística y oficinas. Levantamiento en sitio y seguimiento híbrido desde el centro.",
    keywords: ["cctv Queretaro", "redes industriales Queretaro", "soporte TI Queretaro"],
  },
  {
    slug: "estado-de-mexico",
    name: "Estado de México",
    region: "Estado de México",
    mode: "campo",
    blurb:
      "Zona metropolitana y corredores industriales. Multi-sede retail y plantas con estándar repetible entre ubicaciones.",
    keywords: ["cctv Estado de Mexico", "redes Edomex", "soporte TI Toluca"],
  },
  {
    slug: "monterrey",
    name: "Monterrey",
    region: "Nuevo León",
    mode: "extendida",
    blurb:
      "Norte industrial. Proyectos por fases con equipo móvil: CCTV, redes e infraestructura con documentación de entrega.",
    keywords: ["cctv Monterrey", "redes Monterrey", "soporte TI Nuevo Leon"],
  },
  {
    slug: "guadalajara",
    name: "Guadalajara",
    region: "Jalisco",
    mode: "extendida",
    blurb:
      "Occidente. Instalación y mantenimiento programado para retail, servicios y oficinas con logística coordinada.",
    keywords: ["cctv Guadalajara", "redes Guadalajara", "wifi empresarial Jalisco"],
  },
  {
    slug: "veracruz",
    name: "Veracruz",
    region: "Veracruz",
    mode: "extendida",
    blurb:
      "Golfo y sureste cercano. Intervenciones programadas de videovigilancia, conectividad y soporte híbrido.",
    keywords: ["cctv Veracruz", "redes Veracruz", "soporte TI Veracruz"],
  },
  {
    slug: "cancun",
    name: "Cancún",
    region: "Quintana Roo",
    mode: "extendida",
    blurb:
      "Hospitalidad y retail en el Caribe. CCTV, Wi‑Fi de alta densidad y soporte por fases con logística sureste.",
    keywords: ["cctv Cancun", "wifi hotelero Cancun", "redes Cancun"],
  },
  {
    slug: "leon",
    name: "León",
    region: "Guanajuato",
    mode: "campo",
    blurb:
      "Bajío manufacturero y comercial. Redes de piso, CCTV y soporte con base cercana desde Querétaro/Puebla.",
    keywords: ["cctv Leon Guanajuato", "redes Leon", "soporte TI Bajio"],
  },
];

export function findGeoCity(slug: string): GeoCity | undefined {
  return GEO_CITIES.find((c) => c.slug === slug);
}

export function isGeoServiceSlug(slug: string): slug is GeoServiceSlug {
  return (GEO_SERVICE_SLUGS as readonly string[]).includes(slug);
}

export function getGeoServiceCombos(): {
  city: GeoCity;
  serviceSlug: GeoServiceSlug;
  serviceName: string;
}[] {
  const out: { city: GeoCity; serviceSlug: GeoServiceSlug; serviceName: string }[] = [];
  for (const city of GEO_CITIES) {
    for (const serviceSlug of GEO_SERVICE_SLUGS) {
      const service = findServiceLanding(serviceSlug) || SERVICE_LANDINGS.find((s) => s.slug === serviceSlug);
      if (!service) continue;
      out.push({ city, serviceSlug, serviceName: service.name });
    }
  }
  return out;
}

export const GEO_MONEY_LINKS: { industry: string; service: string; label: string }[] = [
  { industry: "retail", service: "camaras-cctv", label: "CCTV para retail" },
  { industry: "manufactura", service: "camaras-cctv", label: "CCTV industrial" },
  { industry: "seguridad-electronica", service: "camaras-cctv", label: "Videovigilancia IP" },
  { industry: "retail", service: "redes-y-conectividad", label: "Redes y Wi‑Fi retail" },
  { industry: "manufactura", service: "redes-y-conectividad", label: "Redes de planta" },
  { industry: "pymes-y-startups", service: "soporte-ti-pyme", label: "Soporte TI PyME" },
  { industry: "pymes-y-startups", service: "equipo-de-computo", label: "Equipo de cómputo" },
  { industry: "retail", service: "mesa-de-ayuda-ti", label: "Mesa de ayuda" },
];

/** Alias de búsqueda popular → URL canónica geo×servicio */
export const GEO_SEARCH_ALIASES: { source: string; city: string; service: string }[] = [
  { source: "/cctv-puebla", city: "puebla", service: "camaras-cctv" },
  { source: "/cctv-cdmx", city: "cdmx", service: "camaras-cctv" },
  { source: "/camaras-seguridad-puebla", city: "puebla", service: "camaras-cctv" },
  { source: "/camaras-seguridad-cdmx", city: "cdmx", service: "camaras-cctv" },
  { source: "/redes-puebla", city: "puebla", service: "redes-y-conectividad" },
  { source: "/redes-cdmx", city: "cdmx", service: "redes-y-conectividad" },
  { source: "/wifi-empresarial-puebla", city: "puebla", service: "redes-y-conectividad" },
  { source: "/soporte-ti-puebla", city: "puebla", service: "soporte-ti-pyme" },
  { source: "/soporte-ti-cdmx", city: "cdmx", service: "soporte-ti-pyme" },
  { source: "/cctv-cholula", city: "cholula", service: "camaras-cctv" },
  { source: "/cctv-queretaro", city: "queretaro", service: "camaras-cctv" },
  { source: "/cctv-monterrey", city: "monterrey", service: "camaras-cctv" },
];
