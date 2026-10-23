/**
 * Grabación de reuniones con transcripción propia.
 *
 * La web graba la junta en partes de ~1 minuto (cada parte es un archivo de audio completo) y
 * las sube conforme salen, con su posición en la grabación. El API guarda el audio en una
 * carpeta privada solo hasta transcribirlo (whisper propio, en la cola) y lo borra: lo que queda
 * es el texto de cada parte en `meeting_recording_parts`. Las notas por tramo y la minuta viven
 * en `meeting_recordings` (ver `minuta-ia.ts`).
 */

/** Un minuto por parte: 3 horas son 180 partes. */
export const MAX_PARTES = 9_999;

/** Texto pegado: se parte en tramos de este tamaño para que se anote igual que una grabación. */
export const PALABRAS_POR_PARTE_PEGADA = 700;

/** Carpeta privada (nunca se sirve por `/uploads`) con el audio que espera transcripción. */
export function carpetaGrabacion(companyId: number, meetingId: number): string {
  return `grabaciones-reuniones/${companyId}/${meetingId}`;
}

export function nombreParte(parte: number, extension: string): string {
  return `parte-${String(parte).padStart(4, '0')}.${extension}`;
}

/** Milisegundos enviados por la web: entero no negativo o null. */
export function msValidos(valor: unknown, maximo: number): number | null {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Math.round(Number(valor));
  return Number.isFinite(n) && n >= 0 && n <= maximo ? n : null;
}

/** Texto pegado → partes de ~700 palabras cortadas en fin de línea o de frase. */
export function partirTexto(texto: string, porParte = PALABRAS_POR_PARTE_PEGADA): string[] {
  const lineas = texto
    .replace(/\r/g, '')
    .split(/\n+|(?<=[.!?])\s+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const partes: string[] = [];
  let actual: string[] = [];
  let palabras = 0;
  for (const linea of lineas) {
    const n = linea.split(/\s+/).length;
    if (palabras && palabras + n > porParte) {
      partes.push(actual.join(' '));
      actual = [];
      palabras = 0;
    }
    actual.push(linea);
    palabras += n;
  }
  if (actual.length) partes.push(actual.join(' '));
  return partes;
}

export type ResumenPartes = {
  total: number;
  listas: number;
  pendientes: number;
  conError: number;
  /** Número de la última parte recibida (para seguir la numeración al retomar). */
  ultima: number;
  /** Tiempo grabado (suma de las partes). */
  duracionMs: number;
  palabras: number;
};

export function resumirPartes(
  partes: Array<{ parte: number; estado: string; duracionMs: number | null; palabras: number }>,
): ResumenPartes {
  const cuenta = (e: string) => partes.filter((p) => p.estado === e).length;
  return {
    total: partes.length,
    listas: cuenta('LISTA'),
    pendientes: cuenta('PENDIENTE'),
    conError: cuenta('ERROR'),
    ultima: partes.reduce((m, p) => Math.max(m, p.parte), 0),
    duracionMs: partes.reduce((s, p) => s + (p.duracionMs ?? 0), 0),
    palabras: partes.reduce((s, p) => s + (p.palabras ?? 0), 0),
  };
}
