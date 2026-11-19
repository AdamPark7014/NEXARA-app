import { hasPermission, PERMISSIONS } from "@/lib/permissions";

/**
 * «Editar» en el detalle de una actividad: lo decide el permiso que exige el PATCH
 * (`activities.manage`), no el rol. Antes ing_campo veía el botón y el guardado daba 403.
 * El responsable sigue iniciando y terminando la suya sin este permiso.
 */
export function puedeEditarActividad(user: Parameters<typeof hasPermission>[0] & { isSuperAdmin?: boolean } | null | undefined): boolean {
  if (!user) return false;
  return Boolean(user.isSuperAdmin) || hasPermission(user, PERMISSIONS.ACTIVITIES_MANAGE);
}
