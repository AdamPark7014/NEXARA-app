/** Minúsculas, sin acentos ni ñ («mañana» → «manana»), sin signos y con un solo espacio. */
export function normalizarTexto(s: string | null | undefined): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Mención del asistente: la pastilla `[@Asistente](user:0)` o `@asistente` escrito a mano. */
export const MENCION_ASISTENTE = /\[@?asistente[^\]]*\]\(user:0\)|(^|\s)@asistente\b/i;

/**
 * La pregunta tal como la leen las reglas: sin la mención al asistente y con las pastillas de
 * persona/liga como su texto visible (`[@Raúl Pérez](user:7)` → `@Raúl Pérez`).
 */
export function preguntaLimpia(markup: string): string {
  return String(markup ?? '')
    .replace(/\[@?asistente[^\]]*\]\(user:0\)/gi, ' ')
    .replace(/(^|\s)@asistente\b[,:]?/gi, ' ')
    .replace(/\[([^\]\n]+)\]\((?:\/[^)\s]*|user:\d+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
