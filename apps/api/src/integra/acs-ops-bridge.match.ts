/**
 * Reglas puras ACS → Operaciones.
 * Identidad: employeeNumber / personId (sin inventar Face ID).
 */

export const ACS_ENTRY_MINORS = [1, 75] as const;
export const ACS_EXIT_MINORS = [76] as const;
export const ACS_DENIED_MINORS = [21, 22, 23, 24, 27, 28, 29, 31, 32] as const;

export type AcsOpsDirection = 'entry' | 'exit' | 'denied' | null;

export function acsOpsDirection(major: number | null, minor: number | null): AcsOpsDirection {
  if (major !== 5 || minor == null) return null;
  if ((ACS_EXIT_MINORS as readonly number[]).includes(minor)) return 'exit';
  if ((ACS_ENTRY_MINORS as readonly number[]).includes(minor)) return 'entry';
  if ((ACS_DENIED_MINORS as readonly number[]).includes(minor)) return 'denied';
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
