export const CORE_SURFACE_ONLY: boolean = process.env.NEXT_PUBLIC_CORE_SURFACE_ONLY !== 'false';
export const CORE_OLA1_MODULE_IDS: readonly string[] = [
  'mis-actividades',
  'pizarra',
  'asistencias',
  'chat',
  'my-profile',
  'erp-clients',
];
export const CORE_PANEL_ID = 'erp' as const;

export function isCoreOla1ModuleId(id: string): boolean {
  return CORE_OLA1_MODULE_IDS.includes(id);
}

export const CORE_HOME_PATH = '/erp/pizarra';

/** Paneles fuera de /erp que en Core-only no se abren (links viejos, notificaciones, push, chat). */
const NON_ERP_PANEL_RE =
  /^\/(ops|crm|studio|lab|integra|finance|hr|sales|console|consola|contabilidad|people|operacion|noc|support|ventas)(\/|$)/;

/**
 * Core-only: destino dentro de /erp para una ruta de otro panel, o null si no aplica.
 * Detalle de actividad y evidencias conservan el id; «Mi perfil» y «Mis actividades»
 * van a su equivalente; todo lo demás cae en CORE_HOME_PATH.
 */
export function coreSurfaceRedirect(
  pathname: string,
  search?: URLSearchParams | string | null,
): string | null {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (!NON_ERP_PANEL_RE.test(clean)) return null;

  const act = clean.match(/^\/ops\/(?:activities|actividades)\/(\d+)(\/.*)?$/);
  if (act) {
    return /^\/(evidences|evidencias)(\/|$)/.test(act[2] || '')
      ? `/erp/actividades/${act[1]}/evidencias`
      : `/erp/actividades/${act[1]}`;
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