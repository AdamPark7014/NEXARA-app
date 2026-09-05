/**
 * Reglas puras ACS → Operaciones.
 * Identidad: employeeNumber / personId (sin inventar Face ID).
 */

import {
  ACS_MAJOR_DEVICE,
  isAcsDenied,
  isAcsGranted,
  minorsDe,
} from './integra-acs-codes';

/**
 * Estas listas se mantienen exportadas por compatibilidad, pero ya NO son la
 * fuente: la fuente es `integra-acs-codes.ts`. Estaban copiadas en tres
 * archivos y las tres copias fallaban igual.
 */
export const ACS_ENTRY_MINORS = minorsDe('granted');
export const ACS_DENIED_MINORS = minorsDe('denied');

/**
 * VACÍA, y a propósito.
 *
 * Antes era `[76]`, pero el `76` es **fallo de autenticación facial**, no
 * salida concedida: 48 de 48 traen `FaceRect` y 0 de 48 traen persona.
 * Comprobado contra 47.343 eventos reales.
 *
 * Consecuencia incómoda que conviene tener escrita: **este hardware no emite
 * ninguna señal de salida por ACS**. El terminal no distingue entrar de salir;
 * un pase es un pase. Nunca la emitió — cero de cuatro filas de `Activity`
 * tienen `acsExitedAt`, precisamente porque el único minor que la producía
 * jamás traía persona.
 *
 * Se deja vacía en vez de inventar una: las salidas siguen deduciéndose por el
 * heurístico `toggle_exit` de `acs-ops-bridge.service`, que al menos es honesto
 * sobre lo que es. Cerrar jornadas con un fallo de reconocimiento facial sería
 * peor que no cerrarlas.
 */
export const ACS_EXIT_MINORS: readonly number[] = [];

export type AcsOpsDirection = 'entry' | 'exit' | 'denied' | null;

export function acsOpsDirection(major: number | null, minor: number | null): AcsOpsDirection {
  if (major !== ACS_MAJOR_DEVICE || minor == null) return null;
  if (ACS_EXIT_MINORS.includes(minor)) return 'exit';
  if (isAcsGranted(major, minor)) return 'entry';
  if (isAcsDenied(major, minor)) return 'denied';
  return null;
}

/** Puerta Acceso General (Oficinas NEXARA) u homónimos. */
export function isAccesoGeneralDoor(deviceName?: string | null): boolean {
  if (!deviceName) return false;
  return /acceso\s*general|general\s*access|recepci[oó]n|lobby|entrada\s*principal/i.test(
    deviceName.trim(),
  );
}

export function normalizeEmpKey(value?: string | null): string | null {
  if (value == null) return null;
  const t = String(value).trim();
  if (!t) return null;
  return t.toLowerCase();
}

/** Día civil en zona (YYYY-MM-DD). */
export function dayKeyInTz(date: Date, tz = 'America/Mexico_City'): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function formatAcsEntryHint(at: Date, tz = 'America/Mexico_City'): string {
  const hhmm = new Intl.DateTimeFormat('es-MX', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
  return `Entró por ACS a las ${hhmm}`;
}

/** ¿La actividad “cae” hoy (asignación / entrega / inicio / máxima)? */
export function activityTouchesDay(
  activity: {
    fechaAsignacion?: Date | string | null;
    fechaEntregaEsperada?: Date | string | null;
    fechaInicio?: Date | string | null;
    fechaMaxima?: Date | string | null;
  },
  day: string,
  tz = 'America/Mexico_City',
): boolean {
  const keys = [
    activity.fechaAsignacion,
    activity.fechaEntregaEsperada,
    activity.fechaInicio,
    activity.fechaMaxima,
  ];
  for (const raw of keys) {
    if (!raw) continue;
    const d = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    if (dayKeyInTz(d, tz) === day) return true;
  }
  return false;
}

export function pickTodayActivityId(
  candidates: Array<{
    id: number;
    fechaEntregaEsperada?: Date | string | null;
    fechaAsignacion?: Date | string | null;
    fechaInicio?: Date | string | null;
    acsEnteredAt?: Date | string | null;
  }>,
  day: string,
  tz = 'America/Mexico_City',
): number | null {
  if (!candidates.length) return null;
  const touching = candidates.filter((c) => activityTouchesDay(c, day, tz));
  const pool = touching.length ? touching : candidates;
  pool.sort((a, b) => {
    const aStamp = a.acsEnteredAt ? 1 : 0;
    const bStamp = b.acsEnteredAt ? 1 : 0;
    if (aStamp !== bStamp) return aStamp - bStamp; // preferir sin sello aún
    const aDue = a.fechaEntregaEsperada
      ? new Date(a.fechaEntregaEsperada).getTime()
      : Number.MAX_SAFE_INTEGER;
    const bDue = b.fechaEntregaEsperada
      ? new Date(b.fechaEntregaEsperada).getTime()
      : Number.MAX_SAFE_INTEGER;
    return aDue - bDue;
  });
  return pool[0]?.id ?? null;
}
