/**
 * Grabación de reuniones con transcripción propia.
 *
 * La web graba la junta en partes de unos minutos (cada parte es un archivo de audio
 * completo) y las sube conforme salen. El API guarda cada parte en disco y la manda a la
 * cola; el trabajo la pasa por nuestro transcriptor (whisper) y deja el texto junto al audio.
 * El estado se lee del propio disco, sin tablas nuevas:
 *
 *   parte-0001.webm → en cola o transcribiéndose
 *   parte-0001.txt  → lista (el audio se borra, salvo GRABACION_CONSERVAR_AUDIO=1)
 *   parte-0001.err  → no se pudo transcribir
 */
import { EXTENSIONES_AUDIO } from '../ai/voz/transcriptor.js';

/** Cinco minutos por parte dan ~1000 partes antes de llenar 4 dígitos: de sobra. */
export const MAX_PARTES = 9_999;

/** Carpeta privada (nunca se sirve por `/uploads`) de una reunión. */
export function carpetaGrabacion(companyId: number, meetingId: number): string {
  return `grabaciones-reuniones/${companyId}/${meetingId}`;
}

export function nombreParte(parte: number, extension: string): string {
  return `parte-${String(parte).padStart(4, '0')}.${extension}`;
}

export type EstadoParte = 'pendiente' | 'lista' | 'error';

export type ParteGrabacion = { parte: number; estado: EstadoParte; error?: string };

const PATRON = /^parte-(\d{4})\.([a-z0-9]+)$/;

/**
 * Estado de cada parte según los archivos de la carpeta. Si una parte tiene texto, está
 * lista aunque quede el audio (se conserva con GRABACION_CONSERVAR_AUDIO=1).
 */
export function partesDesdeArchivos(archivos: string[]): ParteGrabacion[] {
  const porParte = new Map<number, Set<string>>();
  for (const nombre of archivos) {
    const m = PATRON.exec(nombre);
    if (!m) continue;
    const ext = m[2];
    if (ext !== 'txt' && ext !== 'err' && !EXTENSIONES_AUDIO.includes(ext)) continue;
    const n = Number(m[1]);
    if (!porParte.has(n)) porParte.set(n, new Set());
    porParte.get(n)!.add(ext);
  }
  return [...porParte.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([parte, exts]) => ({
      parte,
      estado: exts.has('txt') ? 'lista' : exts.has('err') ? 'error' : 'pendiente',
    }));
}

/** Texto completo de la junta: las partes en orden, separadas por un salto de línea. */
export function unirTranscripcion(textos: Array<{ parte: number; texto: string }>): string {
  return [...textos]
    .sort((a, b) => a.parte - b.parte)
    .map((t) => t.texto.trim())
    .filter(Boolean)
    .join('\n');
}

export function resumenGrabacion(partes: ParteGrabacion[]) {
  const cuenta = (e: EstadoParte) => partes.filter((p) => p.estado === e).length;
  return {
    total: partes.length,
    listas: cuenta('lista'),
    pendientes: cuenta('pendiente'),
    conError: cuenta('error'),
    /** Todo lo subido ya pasó por el transcriptor (bien o con error). */
    terminada: partes.length > 0 && cuenta('pendiente') === 0,
  };
}
