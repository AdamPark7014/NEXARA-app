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
export const NON_CORE_SUBDOMAINS: string[] = ['sales', 'crm', 'ventas', 'ops', 'operacion', 'studio', 'web', 'lab', 'dev', 'integra', 'people', 'rh', 'hr', 'contabilidad', 'finance'];