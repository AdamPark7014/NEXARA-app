import { puedeGestionarActividades, esGestorOperativo } from './puede-gestionar.js';

/**
 * Roles cuya única puerta a una actividad es la suya: la que les asignaron, la que crearon o
 * en la que están en el equipo. Su matriz de URL no tiene `/api/activities/**`, solo
 * `ACTIVIDAD_PROPIA_URL_RULES`, que desde el 07-11 incluye `GET /api/activities/:id`.
 * Para ellos el detalle se valida aquí; los demás roles siguen como estaban.
 */
export const ROLES_SOLO_ACTIVIDAD_PROPIA = new Set([
  'rh',
  'contabilidad',
  'coord_admin',
  'coord_ventas',
  'vendedor',
  'disenador',
  'dir_operaciones',
]);

type Quien = {
  id?: number;
  roleKey?: string | null;
  isSuperAdmin?: boolean;
  permissions?: string[];
} | null | undefined;

type ActividadMinima = {
  responsableId?: number | null;
  creadoPorId?: number | null;
  assignees?: Array<{ userId?: number | null; user?: { id?: number | null } | null }> | null;
  equipo?: Array<{ userId?: number | null; id?: number | null }> | null;
} | null | undefined;

/** ¿Puede abrir el detalle? Solo restringe a los roles de `ROLES_SOLO_ACTIVIDAD_PROPIA`. */
export function puedeVerDetalleActividad(user: Quien, actividad: ActividadMinima): boolean {
  if (!actividad) return true; // 404 lo decide quien llama
  if (!user || user.isSuperAdmin) return true;
  if (!user.roleKey || !ROLES_SOLO_ACTIVIDAD_PROPIA.has(user.roleKey)) return true;
  if (esGestorOperativo(user) || puedeGestionarActividades(user)) return true;
  const yo = user.id;
  if (yo == null) return false;
  if (actividad.responsableId === yo || actividad.creadoPorId === yo) return true;
  const enEquipo = (actividad.assignees ?? []).some((a) => (a.userId ?? a.user?.id) === yo);
  if (enEquipo) return true;
  return (actividad.equipo ?? []).some((a) => (a.userId ?? a.id) === yo);
}
