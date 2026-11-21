/**
 * Cantidades en español sin «pieza(s)»: «1 pieza», «3 piezas». El plural se da cuando no basta
 * agregar «s» («número de serie» → «números de serie»). Espejo en la web: `apps/web/lib/plural.ts`.
 */
export function contarEs(n: number, uno: string, varios?: string): string {
  return `${n} ${n === 1 ? uno : (varios ?? `${uno}s`)}`;
}
