/**
 * Reglas puras: denegado / fuera de horario → cola SOC.
 * Datos verificados solo desde eventos push (major/minor ACS).
 */

import { ACS_DENIED_MINORS, ACS_ENTRY_MINORS } from './acs-ops-bridge.match';
import { WORKDAY_TIMEZONE } from '../common/time/workday';

export type SocAlarmKind = 'DENIED' | 'AFTER_HOURS';

export type AlarmPolicy = {
  denialThreshold: number;
  windowMinutes: number;
  afterHoursEnabled: boolean;
  officeWeekdays: number[]; // 1=lun … 7=dom (ISO)
  officeStart: string; // HH:MM
  officeEnd: string;
  tz: string;
};

export const DEFAULT_ALARM_POLICY: AlarmPolicy = {
  denialThreshold: 3,
  windowMinutes: 60,
  afterHoursEnabled: true,
  officeWeekdays: [1, 2, 3, 4, 5],
  officeStart: '08:00',
  officeEnd: '19:00',
  tz: WORKDAY_TIMEZONE,
};

export function parseAlarmPolicy(raw: unknown): AlarmPolicy {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const hhmm = (v: unknown, fallback: string) => {
    const s = String(v ?? '').trim();
    return /^\d{1,2}:\d{2}$/.test(s) ? s.padStart(5, '0') : fallback;
  };
  const weekdays = Array.isArray(o.officeWeekdays)
    ? o.officeWeekdays.map(Number).filter((n) => n >= 1 && n <= 7)
    : DEFAULT_ALARM_POLICY.officeWeekdays;
  return {
    denialThreshold: Math.min(
      20,
      Math.max(
        1,
        num(
          o.denialThreshold ?? process.env.INTEGRA_ALARM_DENIAL_THRESHOLD,
          DEFAULT_ALARM_POLICY.denialThreshold,
        ),
      ),
    ),
    windowMinutes: Math.min(
      24 * 60,
      Math.max(5, num(o.windowMinutes, DEFAULT_ALARM_POLICY.windowMinutes)),
    ),
    afterHoursEnabled:
      o.afterHoursEnabled === false || o.afterHoursEnabled === 'false'
        ? false
        : true,
    officeWeekdays: weekdays.length ? weekdays : DEFAULT_ALARM_POLICY.officeWeekdays,
    officeStart: hhmm(o.officeStart, DEFAULT_ALARM_POLICY.officeStart),
    officeEnd: hhmm(o.officeEnd, DEFAULT_ALARM_POLICY.officeEnd),
    tz: String(o.tz || DEFAULT_ALARM_POLICY.tz).trim() || WORKDAY_TIMEZONE,
  };
}

function wallParts(instant: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const p = fmt.formatToParts(instant);
  const val = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  const hour = Number(val('hour')) % 24;
  const minute = Number(val('minute'));
  const wd = val('weekday').toLowerCase();
  const iso =
    wd.startsWith('mon')
      ? 1
      : wd.startsWith('tue')
        ? 2
        : wd.startsWith('wed')
          ? 3
          : wd.startsWith('thu')
            ? 4
            : wd.startsWith('fri')
              ? 5
              : wd.startsWith('sat')
                ? 6
                : 7;
  return { isoWeekday: iso, minutes: hour * 60 + minute };
}

function parseHm(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Entrada concedida fuera de la ventana de oficina del sitio. */
export function isAfterHoursEntry(
  occurredAt: Date,
  policy: AlarmPolicy,
): boolean {
  if (!policy.afterHoursEnabled) return false;
  const { isoWeekday, minutes } = wallParts(occurredAt, policy.tz);
  if (!policy.officeWeekdays.includes(isoWeekday)) return true;
  const start = parseHm(policy.officeStart);
  const end = parseHm(policy.officeEnd);
  if (end <= start) {
    // ventana nocturna: dentro = >= start || < end
    return !(minutes >= start || minutes < end);
  }
  return minutes < start || minutes >= end;
}

export function classifyPushForAlarm(input: {
  major: number | null;
  minor: number | null;
  occurredAt: Date;
  policy: AlarmPolicy;
}): SocAlarmKind | null {
  const { major, minor, occurredAt, policy } = input;
  if (major !== 5 || minor == null) return null;
  if ((ACS_DENIED_MINORS as readonly number[]).includes(minor)) return 'DENIED';
  if (
    (ACS_ENTRY_MINORS as readonly number[]).includes(minor) &&
    isAfterHoursEntry(occurredAt, policy)
  ) {
    return 'AFTER_HOURS';
  }
  return null;
}

export function alarmFingerprint(input: {
  kind: SocAlarmKind;
  personId?: string | null;
  doorNo?: number | null;
  deviceIp?: string | null;
}): string {
  const person = (input.personId || 'anon').trim().slice(0, 64) || 'anon';
  const door = input.doorNo != null ? String(input.doorNo) : 'x';
  const ip = (input.deviceIp || 'ip').trim().slice(0, 64) || 'ip';
  return `${input.kind}:${person}:${door}:${ip}`.slice(0, 180);
}

export function socExternalId(id: number): string {
  return `soc:${id}`;
}

export function parseSocId(externalId: string): number | null {
  const m = /^soc:(\d+)$/i.exec(String(externalId || '').trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function alarmTitle(kind: SocAlarmKind, personName?: string | null): string {
  const who = (personName || '').trim() || 'Persona desconocida';
  if (kind === 'DENIED') return `Acceso denegado · ${who}`;
  return `Entrada fuera de horario · ${who}`;
}
