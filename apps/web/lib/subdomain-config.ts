/**
 * Configuración oficial de subdominios NEXARA.
 *
 * Cada entrada representa un "panel" del ERP. La clave (`slug`) es la carpeta
 * interna en `app/(subdomains)/<slug>/`. `publicDomain` es la URL canónica
 * (la que aparece en navegador y se usa para enlaces externos).
 *
 * `aliases` lista hostnames legacy que deben resolver al mismo panel pero
 * (idealmente) redirigirse 308 al `publicDomain` para mantener canonical y SEO.
 */

export type SubdomainConfig = {
  /** Nombre humano para mostrar en UI */
  name: string;
  /** Dominio público canónico (sin protocolo) */
  publicDomain: string;
  /** Hosts legacy que apuntan al mismo panel (sin protocolo) */
  aliases?: string[];
  /** Ruta interna raíz dentro del folder */
  rootPath: string;
  /** Descripción corta del panel */
  description: string;
  /** Si está activo (false → muestra placeholder) */
  enabled?: boolean;
};

export const SUBDOMAIN_CONFIG: Record<string, SubdomainConfig> = {
  // ── Núcleo empresarial ──
  console: {
    name: 'Core ERP',
    publicDomain: 'core.nexara.com.mx',
    aliases: ['consola.nexara.com.mx', 'console.nexara.com.mx', 'app.nexara.com.mx'],
    rootPath: '/',
    description:
      'Núcleo empresarial: usuarios, permisos, proyectos, clientes, inventario, OC, tickets, dashboards globales, auditoría, RRHH.',
    enabled: true,
  },

  // ── Ventas / CRM ──
  ventas: {
    name: 'Sales · CRM',
    publicDomain: 'sales.nexara.com.mx',
    aliases: ['ventas.nexara.com.mx', 'crm.nexara.com.mx'],
    rootPath: '/',
    description:
      'CRM: leads, pipeline Kanban, oportunidades, cotizaciones, licitaciones, agenda comercial, cuotas y comisiones.',
    enabled: true,
  },

  // ── Operaciones técnicas ──
  operacion: {
    name: 'Operations',
    publicDomain: 'ops.nexara.com.mx',
    aliases: ['operacion.nexara.com.mx'],
    rootPath: '/',
    description:
      'Operaciones técnicas: ingenieros, tickets de servicio, rutas, mantenimientos, evidencias, SLA, herramientas, viáticos, vehículos, GPS.',
    enabled: true,
  },

  // ── Administración / Finanzas ──
  contabilidad: {
    name: 'Finance',
    publicDomain: 'finance.nexara.com.mx',
    aliases: ['contabilidad.nexara.com.mx', 'admin.nexara.com.mx'],
    rootPath: '/',
    description:
      'Administración y finanzas: P&L, facturación CFDI, gastos, AR/AP, banca, OC, pagos, dashboard financiero ejecutivo.',
    enabled: true,
  },

  // ── Estudio creativo / Marketing ──
  web: {
    name: 'Studio',
    publicDomain: 'studio.nexara.com.mx',
    aliases: ['web.nexara.com.mx', 'media.nexara.com.mx'],
    rootPath: '/',
    description:
      'Estudio creativo: diseñadores, community manager, branding, campañas, inbox marketing, newsletter, contenidos.',
    enabled: true,
  },

  // ── Portal clientes empresariales ──
  tickets: {
    name: 'Client Portal',
    publicDomain: 'portal.nexara.com.mx',
    aliases: ['tickets.nexara.com.mx'],
    rootPath: '/',
    description:
      'Portal de clientes empresariales (Soriana, Sanborns, Toks): ver tickets, descargar reportes, aprobar servicios, monitorear equipos, KB pública.',
    enabled: true,
  },

  // ── Helpdesk interno ──
  support: {
    name: 'Helpdesk',
    publicDomain: 'support.nexara.com.mx',
    aliases: ['help.nexara.com.mx'],
    rootPath: '/',
    description:
      'Helpdesk interno: tickets de IT, accesos, software, facilities, KB interna y métricas SLA del equipo de soporte.',
    enabled: true,
  },

  // ── NOC / Monitoreo ──
  noc: {
    name: 'NOC',
    publicDomain: 'noc.nexara.com.mx',
    aliases: ['monitor.nexara.com.mx'],
    rootPath: '/',
    description:
      'Centro de monitoreo 24/7: uptime de cámaras, POS Toks, impresoras, IoT, alertas en vivo y telemetría histórica.',
    enabled: true,
  },

  // ── Recursos humanos ──
  people: {
    name: 'People',
    publicDomain: 'people.nexara.com.mx',
    aliases: ['rh.nexara.com.mx', 'hr.nexara.com.mx'],
    rootPath: '/',
    description:
      'Recursos Humanos dedicado: asistencia, vacaciones, organigrama, directorio interno y KPIs de RRHH para todos los empleados.',
    enabled: true,
  },

  // ── Lab / Sandbox interno ──
  lab: {
    name: 'Lab',
    publicDomain: 'lab.nexara.com.mx',
    aliases: ['dev.nexara.com.mx'],
    rootPath: '/',
    description:
      'Playground interno de desarrollo y experimentos AI: API playground, AI sandbox, feature flags, system health probes.',
    enabled: true,
  },

  // ── Integra · seguridad física ──
  integra: {
    name: 'Integra',
    publicDomain: 'integra.nexara.com.mx',
    rootPath: '/',
    description:
      'Monitoreo y control de sitios: video, accesos, eventos y alarmas.',
    enabled: true,
  },
};

/**
 * Mapa de slug interno → lista de hostnames (canónico + aliases).
 * Útil para construir reglas Traefik o validación de hosts.
 */
export function getHostsForSlug(slug: string): string[] {
  const cfg = SUBDOMAIN_CONFIG[slug];
  if (!cfg) return [];
  return [cfg.publicDomain, ...(cfg.aliases || [])];
}

/**
 * Mapa inverso: hostname → slug interno.
 * Resuelve tanto el canónico como los aliases.
 */
export function getSlugForHost(host: string): string | null {
  const cleanHost = host.toLowerCase().split(':')[0];
  for (const [slug, cfg] of Object.entries(SUBDOMAIN_CONFIG)) {
    if (cfg.publicDomain.toLowerCase() === cleanHost) return slug;
    if (cfg.aliases?.some((a) => a.toLowerCase() === cleanHost)) return slug;
  }
  return null;
}

/**
 * Devuelve si un hostname dado es alias (no canónico).
 * Sirve para redirigir 308 → publicDomain.
 */
export function getCanonicalHost(host: string): string | null {
  const cleanHost = host.toLowerCase().split(':')[0];
  for (const cfg of Object.values(SUBDOMAIN_CONFIG)) {
    if (cfg.aliases?.some((a) => a.toLowerCase() === cleanHost)) return cfg.publicDomain;
  }
  return null;
}

export function getSubdomainConfig(slug: string) {
  return SUBDOMAIN_CONFIG[slug];
}

export function getAllSubdomains() {
  return Object.keys(SUBDOMAIN_CONFIG);
}

export function getEnabledSubdomains() {
  return Object.entries(SUBDOMAIN_CONFIG)
    .filter(([, cfg]) => cfg.enabled !== false)
    .map(([slug]) => slug);
}
