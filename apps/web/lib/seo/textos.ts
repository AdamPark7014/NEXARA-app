/**
 * Google corta la descripción a ~155–160 caracteres y el título a ~60. Estas funciones recortan en una frontera de
 * palabra para que el corte no quede a media palabra.
 */

export function recortarDescripcion(texto: string, max = 158): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (limpio.length <= max) return limpio;
  const corte = limpio.slice(0, max - 1);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > max * 0.6 ? corte.slice(0, espacio) : corte).replace(/[\s,;:.—-]+$/, "")}…`;
}

/** El título largo deja fuera el remate («en Puebla y CDMX») antes que la marca. */
export function tituloConRemate(base: string, remate: string, max = 70): string {
  const completo = `${base} ${remate} | NEXARA`;
  return completo.length <= max ? completo : `${base} | NEXARA`;
}
