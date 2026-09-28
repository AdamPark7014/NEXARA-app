/**
 * Quién puede agregar, editar, desactivar y eliminar clientes del padrón (Core y CRM).
 *
 * Ver clientes sigue las reglas de sector (`client-sectors.ts`); esto solo decide quién los
 * modifica. Agregar y editar: coordinación y gerencia (y la encargada comercial, rol
 * `administrativo`), más quien tiene gente a su cargo salvo que su rol sea operativo.
 * Un ingeniero o un operativo no da de alta clientes aunque tenga personal reportándole,
 * con una excepción: al crear una actividad de servicio puede dar de alta rápido un
 * cliente CORPORATIVO con solo nombre y contacto (correo y teléfono). No edita el
 * padrón ni captura RFC ni datos fiscales.
 * Desactivar y eliminar: solo Christian (y su equivalente de pruebas); la cuenta de
 * desarrollo conserva el acceso técnico total.
 */
import { isCeoEquivalentEmail, isDeveloperSuperAdminEmail } from '../common/platform-accounts.js';

/**
 * Roles que agregan y corrigen clientes aunque no tengan gente a su cargo.
 * Incluye coordinación, gerencia y el rol de la encargada comercial (`administrativo`).
 */
export const CLIENT_ADMIN_ROLE_KEYS: readonly string[] = [
  'ceo',
  'dir_admin',
  'dir_operaciones',
  'coord_admin',
  'coord_operaciones',
  'coord_ventas',
  'arquitecto',
  'enc_soporte',
  'administrativo',
  'contabilidad',
  'rh',
];

/**
 * Ingenieros y operativos: nunca agregan ni editan clientes, ni con gente a su cargo.
 * `ing_soporte` es el rol de los ingenieros de soporte (y del encargado de soporte que
 * comparte esa clave); el alta de ese puesto vive en `enc_soporte`.
 */
export const CLIENT_OPERATIONAL_ROLE_KEYS: readonly string[] = [
  'ing_campo',
  'ing_soporte',
  'disenador',
  'vendedor',
  'cliente',
];

export const CLIENT_STATUS_ACTIVE = 'Activo';
export const CLIENT_STATUS_INACTIVE = 'Inactivo';

export const CLIENT_MANAGE_FORBIDDEN =
  'Solo coordinación, gerencia y la encargada comercial pueden agregar o editar clientes';
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
  /** Operativo: alta rápida de cliente corporativo (nombre y contacto) desde una actividad de servicio. */
  puedeAltaRapidaCorporativa: boolean;
};

/** Christian, su equivalente de pruebas o la cuenta de desarrollo (acceso técnico total). */
export function isClientOwnerAuthority(actor?: ClientActor | null): boolean {
  return isCeoEquivalentEmail(actor?.email) || isDeveloperSuperAdminEmail(actor?.email);
}

/** Desactivar/reactivar y eliminar: solo dirección general. */
export function canDeleteOrDeactivateClient(actor?: ClientActor | null): boolean {
  return isClientOwnerAuthority(actor);
}

export function isOperationalClientRole(roleKey?: string | null): boolean {
  const key = String(roleKey || '').trim().toLowerCase();
  return Boolean(key) && CLIENT_OPERATIONAL_ROLE_KEYS.includes(key);
}

/** Agregar y editar: coordinación, gerencia y encargada comercial. Un operativo no, ni siendo jefe. */
export function canManageClients(actor: ClientActor | null | undefined, hasDirectReports: boolean): boolean {
  if (!actor) return false;
  if (isClientOwnerAuthority(actor)) return true;
  const roleKey = String(actor.roleKey || '').trim().toLowerCase();
  if (isOperationalClientRole(roleKey)) return false;
  if (roleKey && CLIENT_ADMIN_ROLE_KEYS.includes(roleKey)) return true;
  return hasDirectReports;
}

/**
 * Alta rápida desde una actividad de servicio: solo operativos, y solo un cliente
 * corporativo con nombre y contacto. No abre el padrón ni la edición.
 */
export function canQuickCreateCorporateClient(actor?: ClientActor | null): boolean {
  if (!actor || !isOperationalClientRole(actor.roleKey)) return false;
  return !canManageClients(actor, false);
}

export function clientPermissions(actor: ClientActor | null | undefined, hasDirectReports: boolean): ClientPermissions {
  const manage = canManageClients(actor, hasDirectReports);
  const owner = canDeleteOrDeactivateClient(actor);
  return {
    puedeAgregar: manage,
    puedeEditar: manage,
    puedeDesactivar: owner,
    puedeEliminar: owner,
    puedeAltaRapidaCorporativa: canQuickCreateCorporateClient(actor),
  };
}

/** «Inactivo» (o «inactive») sin importar mayúsculas ni espacios. */
export function isInactiveClientStatus(status?: string | null): boolean {
  const s = String(status ?? '')
    .trim()
    .toLowerCase();
  return s === 'inactivo' || s === 'inactiva' || s === 'inactive';
}
