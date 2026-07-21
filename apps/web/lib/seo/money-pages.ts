/**
 * Prioridades de crawl/sitemap para páginas que cierran negocio.
 */

/** Servicios con mayor intención comercial (cotización / WhatsApp). */
export const MONEY_SERVICE_SLUGS = [
  "camaras-cctv",
  "redes-y-conectividad",
  "soporte-ti-pyme",
  "equipo-de-computo",
  "infraestructura-ti",
  "mesa-de-ayuda-ti",
  "ciberseguridad-empresas",
  "erp-industrial",
  "servicios-gestionados-ti",
  "automatizacion-de-procesos",
] as const;

/** Industrias con mayor ticket / demanda local. */
export const MONEY_INDUSTRY_SLUGS = [
  "retail",
  "manufactura",
  "seguridad-electronica",
  "pymes-y-startups",
  "hospitalidad",
  "salud",
  "gobierno",
  "logistica",
  "servicios",
] as const;

export function sitemapPriorityForLanding(industrySlug: string, serviceSlug: string): number {
  const moneyService = (MONEY_SERVICE_SLUGS as readonly string[]).indexOf(serviceSlug);
  const moneyIndustry = (MONEY_INDUSTRY_SLUGS as readonly string[]).indexOf(industrySlug);

  // CCTV + retail/manufactura = máxima prioridad comercial
  if (serviceSlug === "camaras-cctv" && (industrySlug === "retail" || industrySlug === "manufactura" || industrySlug === "seguridad-electronica")) {
    return 0.94;
  }
  if (serviceSlug === "camaras-cctv" || serviceSlug === "redes-y-conectividad") {
    return 0.9;
  }
  if (serviceSlug === "soporte-ti-pyme" || serviceSlug === "equipo-de-computo") {
    return 0.88;
  }
  if (moneyService >= 0 && moneyIndustry >= 0) {
    return 0.84;
  }
  return 0.78;
}

export function buildWhatsAppLeadUrl(opts: {
  industryName: string;
  serviceName: string;
  path?: string;
}): string {
  const text = [
    "Hola Nexara,",
    `Me interesa ${opts.serviceName} para ${opts.industryName}.`,
    "¿Me pueden cotizar / agendar un diagnóstico?",
    opts.path ? `Ref: ${opts.path}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `https://wa.me/522226960350?text=${encodeURIComponent(text)}`;
}
