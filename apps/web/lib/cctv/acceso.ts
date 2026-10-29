/**
 * Quién usa el Diseñador de videovigilancia (espejo de `apps/api/src/cctv-disenos/acceso-cctv.ts`;
 * la API es la autoridad y la página le pregunta a `GET cctv-disenos/acceso`).
 *
 * Regla de Adam (29-10-2026): los encargados de área y el arquitecto sí; los ingenieros de soporte
 * y los instaladores no; los encargados de instalación (David) y de soporte (José Antonio) sí.
 * José Antonio comparte rol con su equipo: la API lo deja pasar por tener gente a cargo y el menú lo
 * reconoce por la lista de encargados de área.
 */
import { isAreaManagerEmail } from "@/lib/activity-kinds";
import { resolveV2RoleKey, type UserAccessInput } from "@/lib/rbac/role-mapping";
import { ROLES, type RoleKey } from "@/lib/rbac/roles";

/** Roles que entran siempre. */
export const ROLES_DISENO_CCTV: ReadonlySet<RoleKey> = new Set<RoleKey>([
  ROLES.SUPER_ADMIN,
  ROLES.CEO,
  ROLES.DIR_OPERACIONES,
  ROLES.DIR_ADMIN,
  ROLES.COORD_OPERACIONES,
  ROLES.COORD_ADMIN,
  ROLES.COORD_VENTAS,
  ROLES.ARQUITECTO,
  ROLES.ADMINISTRATIVO,
  ROLES.ENC_SOPORTE,
]);

/** ¿Lleva el diseñador en su menú? */
export function veDisenadorCctv(user: (UserAccessInput & { email?: string | null }) | null | undefined): boolean {
  if (!user) return false;
  const rol = resolveV2RoleKey(user);
  if (!rol) return false;
  if (ROLES_DISENO_CCTV.has(rol)) return true;
  if (rol === ROLES.ING_CAMPO) return false;
  return rol === ROLES.ING_SOPORTE && isAreaManagerEmail(user.email);
}
