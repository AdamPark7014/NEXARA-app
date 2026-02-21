/**
 * Configuración de subdominios
 * Define qué carpeta del panel actual corresponde a cada subdominio
 */

export const SUBDOMAIN_CONFIG: Record<
  string,
  {
    name: string;
    publicDomain: string;
    panelPath: string;
    description: string;
  }
> = {
  console: {
    name: 'Consola',
    publicDomain: 'consola.nexara.com.mx',
    panelPath: '/panel/console',
    description: 'Panel de administración general',
  },
  ventas: {
    name: 'Ventas',
    publicDomain: 'ventas.nexara.com.mx',
    panelPath: '/panel/ventas',
    description: 'Panel de gestión de ventas',
  },
  web: {
    name: 'Web',
    publicDomain: 'web.nexara.com.mx',
    panelPath: '/panel/web',
    description: 'Panel de contenido web',
  },
  contabilidad: {
    name: 'Contabilidad',
    publicDomain: 'contabilidad.nexara.com.mx',
    panelPath: '/panel/contabilidad',
    description: 'Panel contable',
  },
  tickets: {
    name: 'Tickets',
    publicDomain: 'tickets.nexara.com.mx',
    panelPath: '/panel/tickets',
    description: 'Panel de soporte de tickets',
  },
  ingenieros: {
    name: 'Ingenieros',
    publicDomain: 'ingenieros.nexara.com.mx',
    panelPath: '/panel/ingenieros',
    description: 'Panel para ingenieros',
  },
  dashboard: {
    name: 'Dashboard',
    publicDomain: 'dashboard.nexara.com.mx',
    panelPath: '/panel/dashboard',
    description: 'Dashboard principal',
  },
};

/**
 * Obtener configuración de un subdominio
 */
export function getSubdomainConfig(slug: string) {
  return SUBDOMAIN_CONFIG[slug];
}

/**
 * Obtener todos los subdominios disponibles
 */
export function getAllSubdomains() {
  return Object.keys(SUBDOMAIN_CONFIG);
}
