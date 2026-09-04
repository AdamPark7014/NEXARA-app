/**
 * Empareja identidad ERP ↔ ACS Integra sin inventar biometría.
 *
 * Claves candidatas ERP: User.employeeNumber y UserCompany.employeeNumber.
 * Claves ACS: personId (employeeNoString del terminal) y personCode del espejo.
 * La nómina sigue saliendo del checador ERP; el ACS solo enriquece / contrasta.
 * La sugerencia de checador es opt-in (RH aplica): no escribe sola.
 */

import { WORKDAY_TIMEZONE } from '../common/time/workday.js';

export type HybridLinkStatus = 'linked' | 'erp_only' | 'acs_only';

export type HybridFlag =
  | 'sin_numero_empleado'
  | 'acs_sin_checador'
  | 'checador_sin_acs'
  | 'acs_sin_salida'
  | 'erp_sin_salida'
  | 'desfase_entrada'
  | 'desfase_salida'
  | 'retardo';

export type HybridSuggestion = {
  action: 'aplicar_entrada_acs';
  at: string;
  door: string | null;
  note: string;
};

export type ScheduleLateKey =
  | 'office_hours'
  | 'contractor'
  | 'always_on'
  | 'visitor'
  | 'disabled'
  | 'none'
  | string
  | null
  | undefined;

export function normalizeIdentityKey(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

/** Todas las claves normalizadas con las que un empleado ERP puede vincularse al ACS. */
export function erpIdentityKeys(opts: {
  employeeNumber?: string | null;
  companyEmployeeNumber?: string | null;
}): string[] {
  const keys = new Set<string>();
  for (const raw of [opts.employeeNumber, opts.companyEmployeeNumber]) {
    const k = normalizeIdentityKey(raw);
    if (k) keys.add(k);
  }
  return [...keys];
}

/** Claves normalizadas de una jornada ACS. */
export function acsIdentityKeys(opts: {
  personId?: string | null;
  personCode?: string | null;
}): string[] {
  const keys = new Set<string>();
  for (const raw of [opts.personId, opts.personCode]) {
    const k = normalizeIdentityKey(raw);
    if (k) keys.add(k);
  }
  return [...keys];
}

export function findAcsMatchKey(
  erpKeys: string[],
  acsByKey: Map<string, unknown>,
): string | null {
  for (const k of erpKeys) {
    if (acsByKey.has(k)) return k;
  }
  return null;
}

/** Desfase > 30 min entre checador y primer/último acceso ACS. */
export const HYBRID_SKEW_MS = 30 * 60_000;

/** Gracia de llegada vs horario de plantilla (minutos). */
export const RETARDO_GRACE_MINUTES = 15;

/**
 * Hora de entrada esperada (HH:MM) según plantilla ACS ERP.
 * Oficina 09:00 · contratista 08:00 · 24/7 y visitante no marcan retardo.
 */
export function expectedStartHm(scheduleKey?: ScheduleLateKey): string | null {
  const key = String(scheduleKey || '').trim().toLowerCase();
  if (key === 'office_hours') return '09:00';
  if (key === 'contractor') return '08:00';
  return null;
}

/** ¿El instante cae después de expectedHm + gracia, en la zona de jornada? */
export function isLateVsSchedule(
  atIso: string | null | undefined,
  scheduleKey?: ScheduleLateKey,
  opts?: { graceMinutes?: number; tz?: string },
): boolean {
  if (!atIso) return false;
  const hm = expectedStartHm(scheduleKey);
  if (!hm) return false;
  const at = new Date(atIso);
  if (Number.isNaN(at.getTime())) return false;

  const tz = opts?.tz || WORKDAY_TIMEZONE;
  const grace = (opts?.graceMinutes ?? RETARDO_GRACE_MINUTES) * 60_000;
  const [hh, mm] = hm.split(':').map((n) => Number(n));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return false;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const val = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const y = val('year');
  const mo = val('month');
  const d = val('day');

  // Construye el instante UTC de expectedHm en la zona (misma técnica que workday).
  const asUtc = Date.UTC(y, mo - 1, d, hh, mm, 0);
  const probe = new Date(asUtc);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const pp = fmt.formatToParts(probe);
  const pv = (t: string) => Number(pp.find((p) => p.type === t)?.value ?? 0);
  const localAsUtc = Date.UTC(
    pv('year'),
    pv('month') - 1,
    pv('day'),
    pv('hour') % 24,
    pv('minute'),
    pv('second'),
  );
  const offset = localAsUtc - (probe.getTime() - probe.getMilliseconds());
  const expectedUtc = new Date(asUtc - offset);

  return at.getTime() > expectedUtc.getTime() + grace;
}

/** Sugerencia de entrada ERP desde el primer acceso ACS del día (no auto-escribe). */
export function buildAcsCheckInSuggestion(opts: {
  hasErp: boolean;
  hasUser: boolean;
  acsFirstAt?: string | null;
  acsFirstDoor?: string | null;
}): HybridSuggestion | null {
  if (opts.hasErp || !opts.hasUser || !opts.acsFirstAt) return null;
  return {
    action: 'aplicar_entrada_acs',
    at: opts.acsFirstAt,
    door: opts.acsFirstDoor ?? null,
    note: 'Primera puerta del día sugerida como entrada de checador (nómina). Requiere confirmación de RH.',
  };
}

export function hybridTimeFlags(opts: {
  erpCheckIn?: string | null;
  erpCheckOut?: string | null;
  erpOpen?: boolean;
  acsFirstAt?: string | null;
  acsLastAt?: string | null;
  acsMinutes?: number | null;
  acsPasses?: number;
  scheduleKey?: ScheduleLateKey;
}): HybridFlag[] {
  const flags: HybridFlag[] = [];
  const hasErp = Boolean(opts.erpCheckIn);
  const hasAcs = Boolean(opts.acsFirstAt);

  if (hasAcs && !hasErp) flags.push('acs_sin_checador');
  if (hasErp && !hasAcs) flags.push('checador_sin_acs');
  if (hasAcs && (opts.acsMinutes == null || (opts.acsPasses ?? 0) <= 1)) {
    flags.push('acs_sin_salida');
  }
  if (hasErp && !opts.erpCheckOut && !opts.erpOpen) {
    flags.push('erp_sin_salida');
  }
  if (opts.erpCheckIn && opts.acsFirstAt) {
    const delta = Math.abs(
      new Date(opts.erpCheckIn).getTime() - new Date(opts.acsFirstAt).getTime(),
    );
    if (delta > HYBRID_SKEW_MS) flags.push('desfase_entrada');
  }
  if (opts.erpCheckOut && opts.acsLastAt && (opts.acsPasses ?? 0) > 1) {
    const delta = Math.abs(
      new Date(opts.erpCheckOut).getTime() - new Date(opts.acsLastAt).getTime(),
    );
    if (delta > HYBRID_SKEW_MS) flags.push('desfase_salida');
  }

  // Retardo: primera señal del día (checador o puerta) vs horario de plantilla.
  const arrival = opts.erpCheckIn || opts.acsFirstAt || null;
  if (isLateVsSchedule(arrival, opts.scheduleKey)) {
    flags.push('retardo');
  }

  return flags;
}
