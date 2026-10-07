/**
 * Espejo cliente de `apps/api/src/warehouse/almacen-access.ts` (la API es la autoridad).
 *
 * Control de almacén por persona, sin cambiarle el rol (Adam, 07-10-2026: «agrégale el control
 * de almacén a Iván, no solo herramientas»).
 */
export const ALMACEN_MANAGE_EMAILS = [
  "administracion.ventas@nexara.com.mx", // Iván Camargo
] as const;

export function canManageAlmacen(email: string | null | undefined): boolean {
  const e = String(email ?? "").trim().toLowerCase();
  return (ALMACEN_MANAGE_EMAILS as readonly string[]).includes(e);
}

/** ¿Es una página del almacén de Core? */
export function esRutaDeAlmacen(pathname: string): boolean {
  const limpio = String(pathname ?? "").split(/[?#]/)[0].replace(/\/+$/, "");
  return /^\/erp\/almacen(\/|$)/.test(limpio);
}
