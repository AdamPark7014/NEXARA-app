/**
 * Configuración de subdominios
 * Define qué carpeta del panel actual corresponde a cada subdominio
 */

export const SUBDOMAIN_CONFIG: Record<
  string,
  {
    name: string;
    publicDomain: string;
    rootPath: string;
    description: string;
  }
> = {
  console: {
    name: 'Consola',
    publicDomain: 'consola.nexara.com.mx',
    rootPath: '/',
    description: 'Panel de administración general',
  },
  ventas: {
    name: 'Ventas',
    publicDomain: 'ventas.nexara.com.mx',
    rootPath: '/',
    description: 'Panel de gestión de ventas',
  },
  web: {
    name: 'Web',
    publicDomain: 'web.nexara.com.mx',
    rootPath: '/',
    description: 'Panel de contenido web',
  },
  contabilidad: {
    name: 'Contabilidad',
    publicDomain: 'contabilidad.nexara.com.mx',
    rootPath: '/',
    description: 'Panel contable',
  },
  tickets: {
    name: 'Tickets',
    publicDomain: 'tickets.nexara.com.mx',
    rootPath: '/',
    description: 'Panel de soporte de tickets',
  },
  ingenieros: {
    name: 'Ingenieros',
    publicDomain: 'ingenieros.nexara.com.mx',
    rootPath: '/',
    description: 'Panel para ingenieros',
  },
  dashboard: {
    name: 'Dashboard',
    publicDomain: 'dashboard.nexara.com.mx',
    rootPath: '/',
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
