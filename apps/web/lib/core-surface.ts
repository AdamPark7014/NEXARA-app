export const CORE_SURFACE_ONLY: boolean = process.env.NEXT_PUBLIC_CORE_SURFACE_ONLY !== 'false';
export const CORE_OLA1_MODULE_IDS: readonly string[] = [
  'mis-actividades',
  'pizarra',
  'asistencias',
  'chat',
  'my-profile',
  'erp-clients',
  // Cotizaciones entra a Core: sin esto el módulo existe pero el sidebar lo esconde.
  'erp-cotizaciones',
  // Proyectos (plan, cronograma, alcance, equipo y documentos), mismo motivo.
  'erp-proyectos',
  // KPIs del equipo (retardos, uniforme, horas laboradas vs productivas): vive en /erp/asistencias.
  'kpis-equipo',
  // Recursos: almacén (inventario), herramientas y vehículos para todo el personal, y el
  // organigrama de solo lectura. Antes vivían en /ops y /erp/hr, fuera de Core.
  'erp-almacen',
  'erp-herramientas',
  'erp-vehiculos',
  'erp-organigrama',
  // Hub contadora: finanzas orquestadas bajo /erp/contabilidad.
  'erp-contabilidad',
  'invoicing',
  'banking',
  'employee-payments',
  'exports',
  'expenses-admin',
  'viatics-admin',
];
export const CORE_PANEL_ID = 'erp' as const;

/** Home post-login para rol contabilidad (Core-only). */
export const CONTABILIDAD_HOME_PATH = '/erp/contabilidad';

export function isCoreOla1ModuleId(id: string): boolean {
  return CORE_OLA1_MODULE_IDS.includes(id);
}

export const CORE_HOME_PATH = '/erp/pizarra';

/** Paneles fuera de /erp que en Core-only no se abren (links viejos, notificaciones, push, chat). */
const NON_ERP_PANEL_RE =
  /^\/(ops|crm|studio|lab|integra|finance|hr|sales|console|consola|contabilidad|people|operacion|noc|support|ventas)(\/|$)/;

/**
 * Módulos que se mudaron a Core con el mismo contenido: la ruta vieja abre la nueva y conserva
 * el id (y, donde se usa, la query: `?highlight=`, `?tab=`, `?productId=`).
 */
const MOVED_TO_CORE: ReadonlyArray<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^\/ops\/(?:vehicles|vehiculos)\/(\d+)(?:\/.*)?$/, (m) => `/erp/vehiculos/${m[1]}`],
  [/^\/ops\/(?:vehicles|vehiculos)$/, () => '/erp/vehiculos'],
  [/^\/ops\/(?:my-vehicles|mis-vehiculos)(?:\/.*)?$/, () => '/erp/vehiculos/mis-vehiculos'],
  [/^\/ops\/(?:tools|herramientas)(?:\/.*)?$/, () => '/erp/almacen/herramientas'],
  [/^\/erp\/warehouse(?:\/.*)?$/, () => '/erp/almacen'],
  [/^\/erp\/hr\/orgchart(?:\/.*)?$/, () => '/erp/organigrama'],
];

/** Core-only: la ruta nueva de un módulo que se mudó a /erp, o null si no es uno de ellos. */
export function coreMovedModulePath(pathname: string): string | null {
  const clean = pathname.replace(/\/+$/, '') || '/';
  for (const [re, target] of MOVED_TO_CORE) {
    const m = clean.match(re);
    if (m) return target(m);
  }
  return null;
}

/**
 * Core-only: destino dentro de /erp para una ruta de otro panel, o null si no aplica.
 * Detalle de actividad, evidencias y proyecto conservan el id; «Mi perfil» y «Mis
 * actividades» van a su equivalente; vehículos, herramientas, almacén y organigrama abren su
 * página de Core ({@link coreMovedModulePath}); todo lo demás cae en CORE_HOME_PATH.
 */
export function coreSurfaceRedirect(
  pathname: string,
  search?: URLSearchParams | string | null,
): string | null {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const moved = coreMovedModulePath(clean);
  if (moved) return moved;
  if (!NON_ERP_PANEL_RE.test(clean)) return null;

  const act = clean.match(/^\/ops\/(?:activities|actividades)\/(\d+)(\/.*)?$/);
  if (act) {
    return /^\/(evidences|evidencias)(\/|$)/.test(act[2] || '')
      ? `/erp/actividades/${act[1]}/evidencias`
      : `/erp/actividades/${act[1]}`;
  }

  // Proyectos operativos: el mismo registro vive ahora en /erp/proyectos, con el mismo id.
  const proyecto = clean.match(/^\/ops\/(?:projects|proyectos)(?:\/(\d+))?(?:\/.*)?$/);
  if (proyecto) {
    return proyecto[1] ? `/erp/proyectos/${proyecto[1]}` : '/erp/proyectos';
  }

  const params = typeof search === 'string' ? new URLSearchParams(search) : (search ?? null);
  const activityId = Number(params?.get('activityId'));
  if (Number.isInteger(activityId) && activityId > 0) {
    if (/^\/ops\/(my-evidences|mis-evidencias|evidences|evidencias)$/.test(clean)) {
      return `/erp/actividades/${activityId}/evidencias`;
    }
    if (/^\/ops\/(my-activities|mis-actividades|activities|actividades)$/.test(clean)) {
      return `/erp/actividades/${activityId}`;
    }
  }

  if (/\/my-profile$/.test(clean)) return '/erp/my-profile';
  if (/^\/ops\/(my-activities|mis-actividades)$/.test(clean)) return '/erp/mis-actividades';
  return CORE_HOME_PATH;
}
export const NON_CORE_SUBDOMAINS: string[] = ['sales', 'crm', 'ventas', 'ops', 'operacion', 'studio', 'web', 'lab', 'dev', 'integra', 'people', 'rh', 'hr', 'contabilidad', 'finance'];