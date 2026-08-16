/**
 * Tope de filas para los `findMany` que no piden `take`.
 *
 * En el código hay 252 métodos que consultan sin límite, 189 de ellos colgados
 * de un `@Get`. Hoy no duele —la tabla mayor tiene 15 mil filas— pero cada uno
 * es una consulta que crece con el negocio hasta que un día trae la tabla
 * entera a memoria y tumba el proceso.
 *
 * Ponerles paginación a los 189 cambiaría la forma de la respuesta (de arreglo
 * a `{data, meta}`) y rompería las pantallas que hoy esperan un arreglo. Este
 * tope es la otra mitad: acota **todos** de golpe sin tocar el contrato.
 *
 * Dos decisiones deliberadas:
 *
 *   - El tope es alto (5000 por defecto). Con los datos de hoy no recorta nada;
 *     está para evitar la caída, no para paginar.
 *   - Cuando recorta, **avisa**. Un recorte silencioso es peor que la consulta
 *     sin límite: daría respuestas incompletas que nadie sabría interpretar.
 *     El aviso dice qué modelo fue, y ese modelo es el que necesita paginación
 *     de verdad.
 *
 * Limitación conocida: sólo alcanza al `findMany` de primer nivel. Las
 * relaciones traídas con `include` no pasan por el middleware, así que un
 * `include: { items: true }` sigue sin tope.
 */

export const DEFAULT_ROW_CAP = 5000;

/** Permite ajustarlo por entorno sin recompilar. */
export function resolveRowCap(raw = process.env.PRISMA_MAX_ROWS): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_ROW_CAP;
}

/**
 * ¿Hay que aplicar tope a esta consulta?
 *
 * No, si el llamador ya decidió un `take`: ahí sabe lo que pide. Tampoco a las
 * acciones que no devuelven listas.
 */
export function shouldCap(action: string, args: unknown): boolean {
  if (action !== 'findMany') return false;
  const a = args as { take?: unknown } | undefined;
  return a?.take === undefined || a?.take === null;
}

/**
 * `take` que se inyecta: uno más que el tope.
 *
 * Ese registro de más no se devuelve; sirve para distinguir "vinieron
 * justo 5000" de "había más y se cortó", y así avisar sólo cuando toca.
 */
export function probeTake(cap: number): number {
  return cap + 1;
}

export type CapResult<T> = { rows: T[]; truncated: boolean };

/** Recorta al tope y dice si sobraba. */
export function applyCap<T>(rows: T[], cap: number): CapResult<T> {
  if (rows.length <= cap) return { rows, truncated: false };
  return { rows: rows.slice(0, cap), truncated: true };
}
