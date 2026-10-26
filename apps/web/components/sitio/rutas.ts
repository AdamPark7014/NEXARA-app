/**
 * Mientras el dueño aprueba el rediseño, sus páginas viven bajo /propuesta. Todas las ligas del sistema
 * nuevo pasan por `ruta()`: al publicarlo en `(public)` basta con dejar BASE_SITIO en "".
 */
export const BASE_SITIO = "/propuesta";

/** Páginas que ya existen en el sistema nuevo; el resto (blog, soluciones, cobertura) sigue en el sitio actual. */
const PROPIAS = new Set(["/", "/servicios", "/proyectos", "/nosotros", "/contacto"]);

export function ruta(href: string): string {
  if (!BASE_SITIO || !href.startsWith("/")) return href;
  const corte = href.search(/[?#]/);
  const camino = corte === -1 ? href : href.slice(0, corte);
  const resto = corte === -1 ? "" : href.slice(corte);
  if (!PROPIAS.has(camino)) return href;
  return camino === "/" ? `${BASE_SITIO}${resto}` : `${BASE_SITIO}${camino}${resto}`;
}
