/**
 * Qué opción del menú está activa para una ruta.
 *
 * Una opción cuenta si la ruta es la suya o cuelga de ella; si varias cuentan gana la más específica.
 * Sin esto, en `/erp/asistencias/indicadores` se marcaban a la vez «Asistencias» y «KPIs del equipo».
 */
export function rutaActivaDelMenu(pathname: string | null | undefined, targets: string[]): string | null {
  if (!pathname) return null;
  let mejor: string | null = null;
  for (const target of targets) {
    if (!target) continue;
    const coincide = pathname === target || pathname.startsWith(`${target}/`);
    if (coincide && (mejor === null || target.length > mejor.length)) mejor = target;
  }
  return mejor;
}
