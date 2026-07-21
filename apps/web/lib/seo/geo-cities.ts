/**
 * Ciudades objetivo para SEO local (intención “CCTV Puebla”, “redes CDMX”, …).
 */

export type GeoCity = {
  slug: string;
  name: string;
  region: string;
  /** Cómo operamos ahí */
  mode: "base" | "campo" | "extendida";
  blurb: string;
  /** Keywords locales cortas */
  keywords: string[];
};

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
];

export function findGeoCity(slug: string): GeoCity | undefined {
  return GEO_CITIES.find((c) => c.slug === slug);
}

/** Combos servicio×industria más cotizados por ciudad (enlaces a landings existentes). */
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
