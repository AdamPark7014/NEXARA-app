import type { ModuleId } from '@/lib/access-matrix';

/**
 * Modo de navegación NEXARA.
 * operativo (default) = menú corto; avanzado = muestra módulos/insights ruidosos.
 * Persistido en localStorage nxNavMode.
 */

export const NAV_MODE_STORAGE_KEY = 'nxNavMode';
export type NavMode = 'operativo' | 'avanzado';

export const ADVANCED_ONLY_MODULE_IDS = [
  'architecture',
  'bi',
  'kb',
  'news',
  'exports',
  'kpis-hr',
  'crm-reports',
  'ops-cvs',
  'calendar',
  'facilities-access',
  'ops-service-clients',
] as const;

export type AdvancedOnlyModuleId = (typeof ADVANCED_ONLY_MODULE_IDS)[number];

export function isAdvancedOnlyModuleId(id: string): boolean {
  return (ADVANCED_ONLY_MODULE_IDS as readonly string[]).includes(id);
}

/** Orden de grupos del sidebar ERP (operativo). */
export const ERP_GROUP_ORDER = [
  'Hoy',
  // Almacén, herramientas, vehículos y organigrama (Core).
  'Recursos',
  'Actividades',
  'Gobierno',
  'Inventario',
  'Sistema',
  'Mi cuenta',
] as const;

/** Orden de grupos del sidebar FINANZAS (operativo). */
export const FINANCE_GROUP_ORDER = ['Finanzas', 'Sistema'] as const;

/** Orden de grupos del sidebar PERSONAS (operativo). */
export const HR_GROUP_ORDER = ['Personas', 'Mi cuenta'] as const;

/** Orden de grupos del sidebar SERVICIOS (operativo). */
export const OPS_GROUP_ORDER = [
  'Tablero',
  'Campo',
  'Servicio continuo',
  'Monitoreo y soporte',
  'Personas',
  'Mi cuenta',
] as const;

export function sortSidebarGroups<T extends { title: string; items: unknown[] }>(groups: T[], panel?: string): T[] {
  let order: string[];
  switch (panel) {
    case 'finance':
      order = [...FINANCE_GROUP_ORDER];
      break;
    case 'hr':
      order = [...HR_GROUP_ORDER];
      break;
    case 'ops':
      order = [...OPS_GROUP_ORDER];
      break;
    default:
      order = [...ERP_GROUP_ORDER];
  }
  return [...groups].sort((a, b) => {
    const ia = order.indexOf(a.title);
    const ib = order.indexOf(b.title);
    const sa = ia === -1 ? 999 : ia;
    const sb = ib === -1 ? 999 : ib;
    return sa - sb;
  });
}

export function readNavMode(): NavMode {
  if (typeof window === 'undefined') return 'operativo';
  try {
    const v = window.localStorage.getItem(NAV_MODE_STORAGE_KEY);
    return v === 'avanzado' ? 'avanzado' : 'operativo';
  } catch {
    return 'operativo';
  }
}

export function writeNavMode(mode: NavMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NAV_MODE_STORAGE_KEY, mode);
    window.dispatchEvent(new CustomEvent('nx-nav-mode', { detail: mode }));
  } catch { /* ignore */ }
}

export function isNavAdvanced(): boolean {
  return readNavMode() === 'avanzado';
}

/** Hook-friendly: lee modo y se suscribe a cambios. */
export function subscribeNavMode(cb: (mode: NavMode) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === NAV_MODE_STORAGE_KEY) cb(readNavMode());
  };
  const onCustom = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    cb(detail === 'avanzado' ? 'avanzado' : 'operativo');
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('nx-nav-mode', onCustom as EventListener);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('nx-nav-mode', onCustom as EventListener);
  };
}

/** Type guard compatible con ModuleId. */
export function isAdvancedOnlyModule(id: ModuleId | string): boolean {
  return isAdvancedOnlyModuleId(id);
}