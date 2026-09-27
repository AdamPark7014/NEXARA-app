import { LEGACY_TO_V2, ROLES } from '../common/rbac/roles.v2.js';

/**
 * Quién puede ver el reporte de preparación del PAC: dirección general,
 * dirección administrativa y contabilidad. Nadie más (ni siquiera los demás
 * roles con permiso de facturación, como coordinación administrativa).
 *
 * El reporte no contiene secretos, pero dice qué le falta a la facturación para
 * encenderse y qué datos fiscales están incompletos: es información de gestión.
 */
export const ROLES_PREPARACION_PAC: ReadonlySet<string> = new Set([
  ROLES.CEO,
  ROLES.DIR_ADMIN,
  ROLES.CONTABILIDAD,
]);

interface UsuarioJwt {
  roleKey?: string | null;
  orgRoleKey?: string | null;
  admin?: boolean;
  ingeniero?: boolean;
  vendedor?: boolean;
  role?: unknown;
  superadmin?: boolean;
  isSuperAdmin?: boolean;
}

/** Misma resolución de rol que `UrlAccessGuard`: `roleKey` y, si no, el puente legacy. */
function resuelveRol(user: UsuarioJwt): string | null {
  const validos = Object.values(ROLES) as string[];
  if (user.roleKey && validos.includes(user.roleKey)) return user.roleKey;
  if (user.orgRoleKey && LEGACY_TO_V2[user.orgRoleKey]) return LEGACY_TO_V2[user.orgRoleKey];
  if (user.admin) return LEGACY_TO_V2['admin'] ?? null;
  if (user.ingeniero) return LEGACY_TO_V2['ingeniero'] ?? null;
  if (user.vendedor) return LEGACY_TO_V2['vendedor'] ?? null;
  return null;
}

export function puedeVerPreparacionPac(user: UsuarioJwt | null | undefined): boolean {
  if (!user) return false;
  if (user.superadmin || user.isSuperAdmin || user.role === ROLES.SUPER_ADMIN) return true;
  const rol = resuelveRol(user);
  if (rol === ROLES.SUPER_ADMIN) return true;
  return rol !== null && ROLES_PREPARACION_PAC.has(rol);
}
