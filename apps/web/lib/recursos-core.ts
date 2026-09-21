/**
 * Recursos de Core: almacén, herramientas, vehículos y organigrama.
 *
 * Las pantallas nacieron en OPS (`/ops/tools`, `/ops/vehicles`, `/ops/my-vehicles`) y en RH
 * (`/erp/warehouse`, `/erp/hr/orgchart`). Core las monta bajo `/erp` sin copiarlas: estas rutas y
 * reglas son lo que comparten las páginas nuevas y las viejas para armar sus enlaces.
 */
import { isCeoEquivalentEmail } from '@/lib/platform-accounts';
import { resolveOpsPairNav } from '@/lib/section-views';
import { hasPermission, PERMISSIONS } from '@/lib/permissions';
import type { UserAccessInput } from '@/lib/rbac/role-mapping';

export const ALMACEN_PATH = '/erp/almacen';
export const HERRAMIENTAS_PATH = '/erp/almacen/herramientas';
export const VEHICULOS_PATH = '/erp/vehiculos';
export const MIS_VEHICULOS_PATH = '/erp/vehiculos/mis-vehiculos';
export const VEHICULOS_GPS_PATH = '/erp/vehiculos/gps';
export const ORGANIGRAMA_PATH = '/erp/organigrama';

/**
 * GPS de la flotilla: solo Dirección General. Espejo de `puedeVerGpsDireccion`
 * (`apps/api/src/attendance/asistencia-confiable.ts`), que decide lo mismo en la API.
 */
export function puedeVerGpsDireccion(user?: { email?: string | null } | null): boolean {
  return isCeoEquivalentEmail(user?.email);
}

/** ¿La pantalla está montada dentro de Core (`/erp/...`)? */
export function isCoreMount(pathname: string | null | undefined): boolean {
  return Boolean(pathname && (pathname === '/erp' || pathname.startsWith('/erp/')));
}

/** Base de los enlaces de flotilla: `/erp/vehiculos` en Core, `/ops/vehicles` fuera. */
export function vehiclesBasePath(pathname: string | null | undefined): string {
  return isCoreMount(pathname) ? VEHICULOS_PATH : '/ops/vehicles';
}

/**
 * Pantalla de vehículos de cada quien en Core: quien gestiona flotilla (`resolveOpsPairNav` =
 * equipo) ve la flotilla; todos los demás piden y ven los suyos. Fuera de Core, el que no tenía
 * par (`null`) caía en la flotilla y no podía pedir nada.
 */
export function coreVehiclesHome(user: UserAccessInput | null | undefined): string {
  return resolveOpsPairNav(user, 'vehicles') === 'team' ? VEHICULOS_PATH : MIS_VEHICULOS_PATH;
}

/** ¿Puede dar de alta / editar unidades de la flotilla? Mismo permiso que POST vehicles/inventory. */
export function puedeGestionarInventarioVehiculos(
  user?: { isSuperAdmin?: boolean; permissions?: string[] | null } | null,
): boolean {
  return hasPermission(user, PERMISSIONS.VEHICLES_INVENTORY);
}