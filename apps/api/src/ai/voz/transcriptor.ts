/**
 * Voz a texto con nuestro propio servidor (whisper.cpp en el contenedor `transcriptor`).
 *
 * Nada sale de nuestra red: el audio va del API al transcriptor por la red interna de
 * Docker y no hay proveedor ni clave de por medio. Aquí solo va la lógica pura; la llamada
 * HTTP vive en `TranscriptorService`.
 */

/** Marcas que whisper escribe cuando no hay voz: no son parte de lo dicho. */
const MARCAS_SIN_VOZ =
  /\[(?:BLANK_AUDIO|MUSIC|M[UÚ]SICA|SILENCIO|SILENCE|INAUDIBLE|NOISE|RUIDO|APLAUSOS|RISAS)[^\]]*\]|\((?:m[uú]sica|silencio|inaudible|ruido|aplausos|risas)[^)]*\)|\*(?:m[uú]sica|silencio|ruido)[^*]*\*/gi;

/** Frases que whisper inventa en español sobre silencio o ruido (vienen de subtítulos). */
const FRASES_INVENTADAS = /subt[ií]tulos (?:realizados )?por la comunidad de amara\.org\.?/gi;

/** Deja solo lo dicho: sin marcas de silencio, frases inventadas ni espacios de sobra. */
export function limpiarTextoWhisper(texto: string): string {
  return String(texto ?? '')
    .replace(MARCAS_SIN_VOZ, ' ')
    .replace(FRASES_INVENTADAS, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * Vocabulario de la empresa para whisper: con él escribe bien marcas, siglas y clientes que
 * sin contexto confunde («Hikvision», «NVR», «IPADE»). Corto a propósito: un prompt largo
 * hace que whisper lo repita sobre los silencios. `TRANSCRIPTOR_PROMPT` lo reemplaza.
 */
export const PROMPT_TRANSCRIPTOR =
  'Junta de trabajo de NEXARA, integrador de seguridad en México. Se habla de actividades, ' +
  'cotizaciones, clientes y sucursales: CCTV, cámaras Hikvision, NVR, DVR, control de acceso, ' +
  'cableado, fibra, Banorte, IPADE, Integra.';

export function promptTranscriptor(env: NodeJS.ProcessEnv = process.env): string {
  return (env.TRANSCRIPTOR_PROMPT || '').trim() || PROMPT_TRANSCRIPTOR;
}

/** Formatos que graban los navegadores (Chrome/Edge/Firefox: webm u ogg; Safari: mp4). */
const EXTENSIONES: Record<string, string> = {
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'video/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
};

/** Extensión segura para guardar el audio, o null si el formato no es de audio. */
export function extensionAudio(mime: string | null | undefined): string | null {
  const base = String(mime ?? '').split(';')[0].trim().toLowerCase();
  return EXTENSIONES[base] ?? null;
}

export const EXTENSIONES_AUDIO = [...new Set(Object.values(EXTENSIONES))];
