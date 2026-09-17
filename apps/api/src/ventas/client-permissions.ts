/**
 * Quién puede agregar, editar, desactivar y eliminar clientes del padrón (Core y CRM).
 *
 * Ver clientes sigue las reglas de sector (`client-sectors.ts`); esto solo decide quién los
 * modifica. Agregar y editar: quien tiene gente a su cargo (alguien con `managerId` = él),
 * los roles administrativos y dirección general. Desactivar y eliminar: solo Christian
 * (y su equivalente de pruebas); la cuenta de desarrollo conserva el acceso técnico total.
 */
import { isCeoEquivalentEmail, isDeveloperSuperAdminEmail } from '../common/platform-accounts.js';

/** Roles v2 administrativos que dan de alta y corrigen clientes. */
export const CLIENT_ADMIN_ROLE_KEYS: readonly string[] = [
  'coord_admin',
  'dir_admin',
  'administrativo',
  'contabilidad',
  'rh',
  'coord_operaciones',
  'dir_operaciones',
];

export const CLIENT_STATUS_ACTIVE = 'Activo';
export const CLIENT_STATUS_INACTIVE = 'Inactivo';

export const CLIENT_MANAGE_FORBIDDEN =
  'Solo quien tiene personal a su cargo, Administración o Dirección puede agregar o editar clientes';
export const CLIENT_DELETE_FORBIDDEN = 'Solo Christian (Dirección General) puede eliminar clientes';
export const CLIENT_DEACTIVATE_FORBIDDEN =
  'Solo Christian (Dirección General) puede desactivar o reactivar clientes';

export type ClientActor = {
  id?: number | null;
  email?: string | null;
  roleKey?: string | null;
};

export type ClientPermissions = {
  puedeAgregar: boolean;
  puedeEditar: boolean;
  puedeDesactivar: boolean;
  puedeEliminar: boolean;
};

/** Christian, su equivalente de pruebas o la cuenta de desarrollo (acceso técnico total). */
export function isClientOwnerAuthority(actor?: ClientActor | null): boolean {
  return isCeoEquivalentEmail(actor?.email) || isDeveloperSuperAdminEmail(actor?.email);
}

/** Desactivar/reactivar y eliminar: solo dirección general. */
export function canDeleteOrDeactivateClient(actor?: ClientActor | null): boolean {
  return isClientOwnerAuthority(actor);
}

/** Agregar y editar: jefes (con personal a cargo), roles administrativos y dirección general. */
export function canManageClients(actor: ClientActor | null | undefined, hasDirectReports: boolean): boolean {
  if (!actor) return false;
  if (isClientOwnerAuthority(actor)) return true;
  const roleKey = String(actor.roleKey || '').trim().toLowerCase();
  if (roleKey && CLIENT_ADMIN_ROLE_KEYS.includes(roleKey)) return true;
  return hasDirectReports;
}

export function clientPermissions(actor: ClientActor | null | undefined, hasDirectReports: boolean): ClientPermissions {
  const manage = canManageClients(actor, hasDirectReports);
  const owner = canDeleteOrDeactivateClient(actor);
  return { puedeAgregar: manage, puedeEditar: manage, puedeDesactivar: owner, puedeEliminar: owner };
}

/** «Inactivo» (o «inactive») sin importar mayúsculas ni espacios. */
export function isInactiveClientStatus(status?: string | null): boolean {
  const s = String(status ?? '')
    .trim()
    .toLowerCase();
  return s === 'inactivo' || s === 'inactiva' || s === 'inactive';
}
