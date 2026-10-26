/**
 * Prefijo de las páginas del sitio nuevo. Mientras el dueño lo aprobaba vivió en /propuesta; desde el 26-10-2026
 * está en la raíz y la base queda vacía. Todas las ligas del sistema pasan por `ruta()` para poder volver a
 * montar una versión de prueba bajo un prefijo sin tocar cada liga.
 */
export const BASE_SITIO = "";

/** Páginas que ya existen en el sistema nuevo; el resto (blog, soluciones, cobertura) sigue en el sitio anterior. */
const PROPIAS = new Set(["/", "/servicios", "/proyectos", "/nosotros", "/contacto"]);

export function ruta(href: string): string {
  if (!BASE_SITIO || !href.startsWith("/")) return href;
  const corte = href.search(/[?#]/);
  const camino = corte === -1 ? href : href.slice(0, corte);
  const resto = corte === -1 ? "" : href.slice(corte);
  if (!PROPIAS.has(camino)) return href;
  return camino === "/" ? `${BASE_SITIO}${resto}` : `${BASE_SITIO}${camino}${resto}`;
}
