/**
 * Cantidades en español sin «pieza(s)»: «1 pieza», «3 piezas».
 * El plural se da cuando no es solo agregar «s» («actividad abierta» → «actividades abiertas»).
 */
export function contar(n: number | string, uno: string, varios?: string): string {
  return `${n} ${Number(n) === 1 ? uno : (varios ?? `${uno}s`)}`;
}

/** Solo la palabra, sin el número: `¿${n} ${palabra(n, "día")}?`. */
export function palabra(n: number, uno: string, varios?: string): string {
  return n === 1 ? uno : (varios ?? `${uno}s`);
}
