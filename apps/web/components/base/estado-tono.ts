import type { Tone } from "./piezas";

/**
 * Un solo mapa estado → tono para actividades, cotizaciones, asistencias y almacén.
 * Recibe el código del backend («EN_PROCESO», «VENCIDA») o la etiqueta ya legible
 * («En revisión», «Retardo 12 min») y devuelve el tono de la insignia.
 *
 * Tonos: success = hecho · warning = riesgo · danger = atraso o rechazo ·
 * info = en marcha · violet = esperando revisión · neutral = sin empezar o cancelado.
 */
export const STATUS_TONE_RULES: ReadonlyArray<readonly [RegExp, Tone]> = [
  [/cancelad/i, "neutral"],
  [/rechazad|regresaron|denegad/i, "danger"],
  [/atrasad|retrasad|vencid|\bfalta\b|faltó|sin señal|\berror\b|fallid|\bfalla\b/i, "danger"],
  [/\bvence\b|por vencer|retardo|riesgo|stock bajo|bajo m[ií]nimo/i, "warning"],
  [/validar|revisi[oó]n|por aprobar|aprobaci[oó]n/i, "violet"],
  [/proceso|en curso|enviad|en comida|traslado|en camino/i, "info"],
  [/finalizad|completad|aprobad|aceptad|terminad|\bhech[oa]s?\b|pagad|a tiempo|geocerca|\bactiv[oa]\b|presente/i, "success"],
  [/borrador|pendiente|por empezar|programad|nuev[oa]/i, "neutral"],
];

/** «EN_PROCESO» → «En proceso»; una etiqueta ya legible pasa tal cual. */
function humanizar(status: string): string {
  const t = status.trim();
  if (!/^[A-Z0-9_]+$/.test(t)) return t;
  const plano = t.replace(/_+/g, " ").toLowerCase();
  return plano.charAt(0).toUpperCase() + plano.slice(1);
}

export function statusTone(status?: string | null): { tone: Tone; label: string } {
  const texto = (status ?? "").replace(/_/g, " ");
  for (const [re, tone] of STATUS_TONE_RULES) {
    if (re.test(texto)) return { tone, label: humanizar(status ?? "") };
  }
  return { tone: "neutral", label: status ? humanizar(status) : "—" };
}
