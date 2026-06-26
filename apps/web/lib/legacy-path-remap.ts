/**
 * NEXARA · Remapeo de rutas legacy → canónicas
 * Single source of truth para middleware, page-matrix y redirects cliente.
 */

const SEGMENT_ALIASES: Record<string, string> = {
  cotizaciones: 'quotes',
  plantillas: 'templates',
  proyectos: 'projects',
  licitaciones: 'tenders',
  productos: 'products',
  clientes: 'clients',
  oportunidades: 'opportunities',
  cuotas: 'targets',
  reportes: 'reports',
  'sales-team': 'team',
  viaticos: 'viatics',
  'mis-viaticos': 'my-viatics',
  'mis-actividades': 'my-activities',
  'mis-evidencias': 'my-evidences',
  'mis-vehiculos': 'my-vehicles',
  vehiculos: 'vehicles',
  actividades: 'activities',
  evidencias: 'evidences',
  herramientas: 'tools',
  mantenimiento: 'maintenance',
  monitoreo: 'noc',
  soporte: 'support',
  reclutamiento: 'recruiting',
  asistencia: 'attendance',
  'mis-vacaciones': 'my-vacation',
  multas: 'fines',
  organigrama: 'orgchart',
  'kpis-rh': 'kpis',
  nomina: 'employee-payments',
  gastos: 'expenses',
  bancos: 'banking',
  banca: 'banking',
  contabilidad: 'accounting',
  facturacion: 'invoicing',
  almacen: 'warehouse',
  inventario: 'warehouse',
  compras: 'procurement',
  auditoria: 'audit',
  documentos: 'documents',
  exportaciones: 'exports',
  notificaciones: 'notifications-center',
  calendario: 'calendar',
  'mi-perfil': 'my-profile',
  'mi-equipo': 'team',
  'mi-area': 'orgchart',
  aprobaciones: 'approvals',
  usuarios: 'users',
  configuracion: 'settings',
  empleados: 'hr',
  sanciones: 'fines',
  paginas: 'pages',
  casos: 'cases',
  noticias: 'news',
  redes: 'social',
  contactos: 'contacts',
  boletin: 'newsletter',
  cvs: 'recruiting',
  equipos: 'assets',
  'mi-agenda': 'dashboard',
  'mi-cuota': 'targets',
  'mis-leads': 'leads',
  'mis-clientes': 'clients',
  equipo: 'team',
};

const CROSS_PANEL_REMAPS: Array<[RegExp, string]> = [
  // ── /panel/* (portal legacy) ───────────────────────────────────────────
  [/^\/panel\/asistencia(\/?.*)$/, '/erp/hr/attendance'],
  [/^\/panel\/vehiculos(\/?.*)$/, '/ops/vehicles'],
  [/^\/panel\/herramientas(\/?.*)$/, '/ops/tools'],
  [/^\/panel\/actividades(\/?.*)$/, '/ops/activities'],
  [/^\/panel\/multas(\/?.*)$/, '/erp/hr/fines'],
  [/^\/panel\/ventas(\/.*)?$/, '/crm'],
  [/^\/panel\/tickets(\/?.*)$/, '/tickets$1'],

  // ── /core/* (RBAC v1) ──────────────────────────────────────────────────
  [/^\/core\/clientes(\/.*)?$/, '/crm/clients'],
  [/^\/core\/cotizaciones(\/.*)?$/, '/crm/quotes'],
  [/^\/core\/crm-resumen(\/?.*)$/, '/crm/dashboard'],
  [/^\/core\/actividades(\/.*)?$/, '/ops/activities'],
  [/^\/core\/proyectos(\/.*)?$/, '/ops/projects'],
  [/^\/core\/mantenimiento(\/?.*)$/, '/ops/maintenance'],
  [/^\/core\/sla(\/?.*)$/, '/ops/support/sla'],
  [/^\/core\/viaticos(\/?.*)$/, '/erp/finance/viatics'],
  [/^\/core\/contabilidad(\/?.*)$/, '/erp/accounting'],
  [/^\/core\/facturacion(\/?.*)$/, '/erp/invoicing'],
  [/^\/core\/banca(\/?.*)$/, '/erp/banking'],
  [/^\/core\/gastos(\/?.*)$/, '/erp/finance/expenses'],
  [/^\/core\/compras(\/?.*)$/, '/erp/procurement'],
  [/^\/core\/inventario(\/?.*)$/, '/erp/warehouse'],
  [/^\/core\/almacen(\/?.*)$/, '/erp/warehouse'],
  [/^\/core\/catalogo(\/?.*)$/, '/crm/products'],
  [/^\/core\/empleados(\/?.*)$/, '/erp/hr'],
  [/^\/core\/nomina(\/?.*)$/, '/erp/finance/employee-payments'],
  [/^\/core\/asistencia(\/?.*)$/, '/erp/hr/attendance'],
  [/^\/core\/cvs(\/?.*)$/, '/ops/recruiting'],
  [/^\/core\/sanciones(\/?.*)$/, '/erp/hr/fines'],
  [/^\/core\/usuarios(\/?.*)$/, '/erp/users'],
  [/^\/core\/configuracion(\/?.*)$/, '/erp/settings'],
  [/^\/core\/auditoria(\/?.*)$/, '/erp/audit'],
  [/^\/core\/reportes(\/?.*)$/, '/erp/executive'],
  [/^\/core\/executive(\/?.*)$/, '/erp/executive'],
  [/^\/core\/aprobaciones(\/?.*)$/, '/erp/approvals'],
  [/^\/core\/dashboard(\/?.*)$/, '/erp/dashboard'],
  [/^\/core\/?$/, '/erp/dashboard'],

  // ── /sales/* (CRM legacy) ──────────────────────────────────────────────
  [/^\/sales\/oportunidades(\/.*)?$/, '/crm/opportunities'],
  [/^\/sales\/mis-leads(\/?.*)$/, '/crm/leads'],
  [/^\/sales\/mis-clientes(\/?.*)$/, '/crm/clients'],
  [/^\/sales\/cotizaciones(\/?.*)$/, '/crm/quotes'],
  [/^\/sales\/equipo(\/?.*)$/, '/crm/team'],
  [/^\/sales\/cuotas(\/?.*)$/, '/crm/targets'],
  [/^\/sales\/licitaciones(\/?.*)$/, '/crm/tenders'],
  [/^\/sales\/reportes(\/?.*)$/, '/crm/reports'],
  [/^\/sales\/catalogo(\/?.*)$/, '/crm/products'],
  [/^\/sales\/agenda(\/?.*)$/, '/crm/agenda'],
  [/^\/sales\/mi-cuota(\/?.*)$/, '/crm/targets'],
  [/^\/sales\/dashboard(\/?.*)$/, '/crm/dashboard'],

  // ── /ops/* español ─────────────────────────────────────────────────────
  [/^\/ops\/mis-actividades(\/?.*)$/, '/ops/my-activities'],
  [/^\/ops\/actividades(\/.*)?$/, '/ops/activities'],
  [/^\/ops\/mis-viaticos(\/?.*)$/, '/ops/my-viatics'],
  [/^\/ops\/asistencia(\/?.*)$/, '/erp/hr/attendance'],
  [/^\/ops\/mis-vehiculos(\/?.*)$/, '/ops/my-vehicles'],
  [/^\/ops\/soporte(\/?.*)$/, '/ops/support'],
  [/^\/ops\/mantenimiento(\/?.*)$/, '/ops/maintenance'],
  [/^\/ops\/proyectos(\/.*)?$/, '/ops/projects'],
  [/^\/ops\/vehiculos(\/?.*)$/, '/ops/vehicles'],
  [/^\/ops\/mi-agenda(\/?.*)$/, '/ops/dashboard'],

  // ── Cross-panel ERP/OPS ────────────────────────────────────────────────
  [/^\/erp\/cvs(\/.*)?$/, '/ops/recruiting'],
  [/^\/erp\/recruiting(\/.*)?$/, '/ops/recruiting'],
  [/^\/erp\/cotizaciones(\/.*)?$/, '/crm/quotes'],
  [/^\/erp\/quotes(\/.*)?$/, '/crm/quotes'],
  [/^\/erp\/multas(\/?.*)$/, '/erp/hr/fines'],
  [/^\/erp\/fines(\/?.*)$/, '/erp/hr/fines'],
  [/^\/erp\/sanciones(\/?.*)$/, '/erp/hr/fines'],
  [/^\/erp\/asistencia(\/?.*)$/, '/erp/hr/attendance'],
  [/^\/erp\/attendance(\/?.*)$/, '/erp/hr/attendance'],
  [/^\/erp\/lunch-breaks(\/?.*)$/, '/erp/hr/lunch-breaks'],
  [/^\/erp\/my-lunch-breaks(\/?.*)$/, '/erp/hr/lunch-breaks'],
  [/^\/erp\/my-vacation(\/?.*)$/, '/erp/hr/attendance'],
  [/^\/erp\/team(\/?.*)$/, '/erp/hr/orgchart'],
  [/^\/erp\/my-area(\/?.*)$/, '/erp/hr/orgchart'],
  [/^\/erp\/mi-area(\/?.*)$/, '/erp/hr/orgchart'],
  [/^\/erp\/orgchart(\/?.*)$/, '/erp/hr/orgchart'],
  [/^\/erp\/organigrama(\/?.*)$/, '/erp/hr/orgchart'],
  [/^\/erp\/kpis(\/?.*)$/, '/erp/hr/kpis'],
  [/^\/erp\/kpis-rh(\/?.*)$/, '/erp/hr/kpis'],
  [/^\/ops\/my-vacation(\/?.*)$/, '/erp/hr/attendance'],
  [/^\/ops\/mis-vacaciones(\/?.*)$/, '/erp/hr/attendance'],
  [/^\/erp\/viaticos(\/?.*)$/, '/erp/finance/viatics'],
  [/^\/erp\/viatics(\/?.*)$/, '/erp/finance/viatics'],
  [/^\/erp\/expenses(\/?.*)$/, '/erp/finance/expenses'],
  [/^\/erp\/employee-payments(\/?.*)$/, '/erp/finance/employee-payments'],
  [/^\/erp\/contact-messages(\/?.*)$/, '/studio/contacts'],
  [/^\/erp\/accounting\/reports(\/?.*)$/, '/erp/accounting'],
  [/^\/erp\/procurement\/dashboard(\/?.*)$/, '/erp/procurement'],
  [/^\/ops\/work-projects(\/?.*)$/, '/ops/projects'],
  [/^\/ops\/assets\/depreciation(\/?.*)$/, '/ops/assets'],
  [/^\/erp\/financial-dashboard(\/?.*)$/, '/erp/executive'],
  [/^\/erp\/dashboard\/dashboard(\/?.*)$/, '/erp/dashboard'],
  [/^\/erp\/newsletter(\/?.*)$/, '/erp/news'],
  [/^\/erp\/warehouse\/stock(\/?.*)$/, '/erp/warehouse'],
  [/^\/erp\/clients(\/.*)?$/, '/crm/clients'],
  [/^\/erp\/clientes(\/.*)?$/, '/crm/clients'],
  [/^\/erp\/empleados(\/?.*)$/, '/erp/hr'],
];

function joinRemapTarget(target: string, rest: string): string {
  if (!rest || rest === '/') return target;
  return `${target}${rest}`;
}

/**
 * Traduce paths legacy (español, /core, /sales) a rutas canónicas en
 * `apps/web/app/(panels)/*`.
 */
export function remapLegacySlugs(pathname: string): string {
  for (const [pattern, target] of CROSS_PANEL_REMAPS) {
    const match = pathname.match(pattern);
    if (!match) continue;
    const rest = match[1] || '';
    return joinRemapTarget(target, rest);
  }

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return pathname;

  const panel = segments[0];
  if (!['erp', 'crm', 'ops', 'studio', 'lab'].includes(panel)) return pathname;

  const remapped = segments.map((seg, idx) => {
    if (idx === 0) return seg;
    return SEGMENT_ALIASES[seg] || seg;
  });
  return '/' + remapped.join('/');
}

/** Prefijos legacy de panel → canónico (solo el primer segmento). */
export const LEGACY_PANEL_PREFIX_MAP: Record<string, string> = {
  '/core': '/erp',
  '/console': '/erp',
  '/consola': '/erp',
  '/contabilidad': '/erp',
  '/people': '/erp/hr',
  '/operacion': '/ops',
  '/noc': '/ops/noc',
  '/support': '/ops/support',
  '/ventas': '/crm',
  '/sales': '/crm',
  '/web': '/studio',
  '/portal': '/tickets',
};

/** Evita `/people/hr/...` → `/erp/hr/hr/...` tras el prefijo legacy. */
function dedupePanelPath(pathname: string): string {
  return pathname
    .replace(/^\/erp\/hr\/hr(\/|$)/, '/erp/hr$1')
    .replace(/^\/erp\/erp(\/|$)/, '/erp$1');
}

/** Normaliza prefijo legacy y aplica remapeo de slugs. */
export function normalizeLegacyPath(pathname: string): string {
  let clean = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  // Rutas /core/* y /sales/* tienen destinos cross-panel explícitos.
  clean = remapLegacySlugs(clean);
  for (const [legacy, canonical] of Object.entries(LEGACY_PANEL_PREFIX_MAP)) {
    if (clean === legacy) {
      clean = canonical;
      break;
    }
    if (clean.startsWith(`${legacy}/`)) {
      clean = `${canonical}${clean.slice(legacy.length)}`;
      break;
    }
  }
  clean = dedupePanelPath(clean);
  return remapLegacySlugs(clean);
}
