import { PERMISSIONS } from '../common/permissions.js';

const ROLES_GESTION_OPERATIVA = new Set(['ceo', 'dir_admin', 'dir_operaciones', 'arquitecto', 'coord_operaciones', 'coord_admin']);

type QuienAsigna = { isSuperAdmin?: boolean; permissions?: string[] | null; roleKey?: string | null } | null | undefined;

export function esGestorOperativo(user: QuienAsigna): boolean {
  if (!user) return false;
  if (user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN)) return true;
  return Boolean(user.roleKey && ROLES_GESTION_OPERATIVA.has(user.roleKey));
}

/** ¿Puede asignar actividades a otra persona? Una sola regla para el alta y para los formatos. */
export function puedeGestionarActividades(user: QuienAsigna): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  if (user.permissions?.includes(PERMISSIONS.ACTIVITIES_MANAGE)) return true;
  if (user.roleKey === 'enc_soporte') return true;
  return esGestorOperativo(user);
}
