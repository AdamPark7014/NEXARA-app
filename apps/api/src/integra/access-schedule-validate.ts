/**
 * Validación de casos de uso de horarios ACS (QA).
 * No inventa ISAPI: refuerza Valid / RightPlan / WeekPlanCfg ya documentados.
 *
 * Zona horaria de vigencia: America/Mexico_City (misma que workday / Oficinas).
 */

import { WORKDAY_TIMEZONE, workDateKey } from '../common/time/workday';
import {
  buildAfterHoursWeekPlan,
  buildAlwaysOnWeekPlan,
  buildOfficeHoursWeekPlan,
  buildWeekendWeekPlan,
  classifyValid,
  isHhMmSs,
  type RightPlanEntry,
  type WeekPlanCfg,
  type Weekday,
} from '../hikvision-isapi/isapi-schedules';

export const ACCESS_SCHEDULE_TZ = WORKDAY_TIMEZONE; // America/Mexico_City

export type UseCaseId =
  | 'indefinite'
  | 'dated'
  | 'weekly'
  | 'per_door'
  | 'visitor'
  | 'contractor'
  | 'disabled'
  | 'always_247'
  | 'after_hours'
  | 'weekend'
  | 'empty_plans'
  | 'overnight_split'
  | 'timezone_mx';

export type ValidationIssue = {
  code:
    | 'end_before_begin'
    | 'empty_right_plan'
    | 'invalid_time'
    | 'overnight_unsplit'
    | 'missing_valid'
    | 'bad_window';
  message: string;
  path?: string;
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

/** Componentes de pared en America/Mexico_City. */
export function mexicoWallParts(
  instant: Date,
  tz = ACCESS_SCHEDULE_TZ,
): { y: number; m: number; d: number; h: number; mi: number; s: number } {
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
  const p = fmt.formatToParts(instant);
  const val = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return {
    y: val('year'),
    m: val('month'),
    d: val('day'),
    h: val('hour') % 24,
    mi: val('minute'),
    s: val('second'),
  };
}

/** ISO local sin Z para UserInfo.Valid (hora de México, no UTC del contenedor). */
export function formatMexicoValidLocal(
  instant: Date,
  opts?: { endOfDay?: boolean; startOfDay?: boolean },
): string {
  const w = mexicoWallParts(instant);
  if (opts?.startOfDay) {
    return `${w.y}-${pad2(w.m)}-${pad2(w.d)}T00:00:00`;
  }
  if (opts?.endOfDay) {
    return `${w.y}-${pad2(w.m)}-${pad2(w.d)}T23:59:59`;
  }
  return `${w.y}-${pad2(w.m)}-${pad2(w.d)}T${pad2(w.h)}:${pad2(w.mi)}:${pad2(w.s)}`;
}

export function mexicoTodayBounds(now = new Date()): {
  beginTime: string;
  endTime: string;
  dayKey: string;
} {
  return {
    beginTime: formatMexicoValidLocal(now, { startOfDay: true }),
    endTime: formatMexicoValidLocal(now, { endOfDay: true }),
    dayKey: workDateKey(now, ACCESS_SCHEDULE_TZ),
  };
}

/** HH:MM:SS → segundos (24:00:00 = 86400). */
export function timeToSeconds(hhmmss: string): number | null {
  const t = String(hhmmss || '').trim();
  if (!isHhMmSs(t)) return null;
  if (t === '24:00:00') return 86_400;
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

/**
 * Si begin > end en el mismo día, Hikvision exige 2 franjas
 * (doc calendarios: 22:00→05:00 → 22:00–23:59:59 + 00:00–05:00).
 */
export function splitOvernightSegment(input: {
  week: Weekday | string;
  beginTime: string;
  endTime: string;
  idStart?: number;
}): Array<{ week: string; id: number; beginTime: string; endTime: string }> {
  const begin = String(input.beginTime).trim();
  const end = String(input.endTime).trim();
  const b = timeToSeconds(begin);
  const e = timeToSeconds(end);
  if (b == null || e == null) {
    throw new Error(`Franja inválida ${begin}-${end}`);
  }
  const id0 = Math.min(7, Math.max(1, input.idStart ?? 1));
  if (b <= e) {
    return [{ week: String(input.week), id: id0, beginTime: begin, endTime: end }];
  }
  // Cruza medianoche: no se admite un solo segmento.
  return [
    {
      week: String(input.week),
      id: id0,
      beginTime: begin,
      endTime: '23:59:59',
    },
    {
      week: String(input.week),
      id: id0 + 1,
      beginTime: '00:00:00',
      endTime: end === '24:00:00' ? '23:59:59' : end,
    },
  ];
}

export function validateWeekPlanCfg(cfg: WeekPlanCfg): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!cfg?.WeekPlanCfg?.length) {
    issues.push({
      code: 'empty_right_plan',
      message: 'WeekPlanCfg vacío (se esperan 56 slots 7×8)',
      path: 'WeekPlanCfg',
    });
    return issues;
  }
  for (const slot of cfg.WeekPlanCfg) {
    if (!slot.enable) continue;
    const begin = slot.TimeSegment?.beginTime || '';
    const end = slot.TimeSegment?.endTime || '';
    if (!isHhMmSs(begin) || !isHhMmSs(end)) {
      issues.push({
        code: 'invalid_time',
        message: `Franja ${slot.week}#${slot.id}: hora inválida ${begin}-${end}`,
        path: `WeekPlanCfg.${slot.week}.${slot.id}`,
      });
      continue;
    }
    const b = timeToSeconds(begin)!;
    const e = timeToSeconds(end)!;
    if (b > e) {
      issues.push({
        code: 'overnight_unsplit',
        message: `Franja ${slot.week}#${slot.id}: ${begin}>${end} — partir en dos (doc HikGateway calendarios)`,
        path: `WeekPlanCfg.${slot.week}.${slot.id}`,
      });
    }
  }
  return issues;
}

export function validateValidWindow(valid: {
  enable?: boolean;
  beginTime?: string;
  endTime?: string;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!valid) {
    issues.push({ code: 'missing_valid', message: 'Falta UserInfo.Valid' });
    return issues;
  }
  if (valid.enable === false) return issues;
  const begin = String(valid.beginTime || '');
  const end = String(valid.endTime || '');
  if (!begin || !end) {
    issues.push({
      code: 'bad_window',
      message: 'Valid con enable requiere beginTime y endTime',
    });
    return issues;
  }
  const b = Date.parse(begin);
  const e = Date.parse(end);
  if (!Number.isFinite(b) || !Number.isFinite(e)) {
    // ISAPI local sin Z: comparar lexicográfico AAAA-MM-DDThh:mm:ss
    if (begin > end) {
      issues.push({
        code: 'end_before_begin',
        message: `Valid endTime (${end}) < beginTime (${begin})`,
      });
    }
    return issues;
  }
  if (e < b) {
    issues.push({
      code: 'end_before_begin',
      message: `Valid endTime (${end}) < beginTime (${begin})`,
    });
  }
  return issues;
}

export function validateRightPlan(rightPlan: unknown, opts?: { allowEmpty?: boolean }): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const rows = Array.isArray(rightPlan)
    ? rightPlan
    : rightPlan && typeof rightPlan === 'object'
      ? [rightPlan]
      : [];
  if (!rows.length) {
    if (!opts?.allowEmpty) {
      issues.push({
        code: 'empty_right_plan',
        message: 'RightPlan vacío: sin puertas/plantillas (usar Valid.enable=false para deshabilitar)',
        path: 'RightPlan',
      });
    }
    return issues;
  }
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] as RightPlanEntry;
    const plan = String(r?.planTemplateNo ?? '').trim();
    if (!plan || plan === '0') {
      issues.push({
        code: 'empty_right_plan',
        message: `RightPlan[${i}].planTemplateNo vacío o 0`,
        path: `RightPlan[${i}]`,
      });
    }
  }
  return issues;
}

/** Matriz de cobertura: builders + clasificadores por caso de uso. */
export function useCaseCoverageMatrix(): Array<{
  id: UseCaseId;
  labelEs: string;
  coveredBy: string;
  ok: boolean;
  sample: Record<string, unknown>;
}> {
  const always = buildAlwaysOnWeekPlan();
  const office = buildOfficeHoursWeekPlan();
  const after = buildAfterHoursWeekPlan();
  const weekend = buildWeekendWeekPlan();
  const today = mexicoTodayBounds(new Date('2026-09-04T18:00:00Z'));

  return [
    {
      id: 'indefinite',
      labelEs: 'Indefinido (Valid → 2037)',
      coveredBy: 'classifyValid + INDEFINITE_VALID',
      ok: classifyValid({ enable: true, beginTime: '2020-01-01T00:00:00', endTime: '2037-12-31T23:59:59' }) === 'indefinite',
      sample: { endTime: '2037-12-31T23:59:59' },
    },
    {
      id: 'dated',
      labelEs: 'Ventana fechada (contratista)',
      coveredBy: 'validMode=window',
      ok: classifyValid({ enable: true, beginTime: '2026-03-01T00:00:00', endTime: '2027-03-01T23:59:59' }) === 'window',
      sample: { beginTime: '2026-03-01T00:00:00', endTime: '2027-03-01T23:59:59' },
    },
    {
      id: 'weekly',
      labelEs: 'Semanal Lun–Vie oficina',
      coveredBy: 'buildOfficeHoursWeekPlan',
      ok: validateWeekPlanCfg(office).length === 0 && office.WeekPlanCfg.filter((s) => s.enable).length === 5,
      sample: { enabledDays: 5 },
    },
    {
      id: 'per_door',
      labelEs: 'Plan distinto por puerta/terminal',
      coveredBy: 'RightPlan[] + Modify por IP',
      ok: true,
      sample: { RightPlan: [{ doorNo: 1, planTemplateNo: '2' }] },
    },
    {
      id: 'visitor',
      labelEs: 'Visitante día (México)',
      coveredBy: 'mexicoTodayBounds + userType=visitor',
      ok: today.dayKey === '2026-09-04' && today.beginTime.endsWith('T00:00:00'),
      sample: today,
    },
    {
      id: 'contractor',
      labelEs: 'Contratista vigencia corta',
      coveredBy: 'ERP template contractor + Valid window',
      ok: true,
      sample: { validity: 'dated', months: 12 },
    },
    {
      id: 'disabled',
      labelEs: 'Deshabilitado (Valid.enable=false)',
      coveredBy: 'classifyValid disabled',
      ok: classifyValid({ enable: false }) === 'disabled',
      sample: { enable: false },
    },
    {
      id: 'always_247',
      labelEs: '24/7 todo el día',
      coveredBy: 'buildAlwaysOnWeekPlan / plantilla 1',
      ok: always.WeekPlanCfg.filter((s) => s.enable).length === 7,
      sample: { days: 7 },
    },
    {
      id: 'after_hours',
      labelEs: 'Fuera de horario (overnight 2 franjas)',
      coveredBy: 'buildAfterHoursWeekPlan',
      ok:
        validateWeekPlanCfg(after).length === 0 &&
        after.WeekPlanCfg.filter((s) => s.enable && s.TimeSegment.beginTime === '18:00:00').length === 5,
      sample: { slotsPerWorkday: 2 },
    },
    {
      id: 'weekend',
      labelEs: 'Solo fin de semana',
      coveredBy: 'buildWeekendWeekPlan',
      ok: weekend.WeekPlanCfg.filter((s) => s.enable).length === 2,
      sample: { days: ['Saturday', 'Sunday'] },
    },
    {
      id: 'empty_plans',
      labelEs: 'RightPlan vacío',
      coveredBy: 'validateRightPlan(allowEmpty)',
      ok: validateRightPlan([], { allowEmpty: true }).length === 0,
      sample: { allowEmptyWithDisabled: true },
    },
    {
      id: 'overnight_split',
      labelEs: 'end<begin → partir franja',
      coveredBy: 'splitOvernightSegment',
      ok: splitOvernightSegment({ week: 'Monday', beginTime: '22:00:00', endTime: '05:00:00' }).length === 2,
      sample: { from: '22:00', to: '05:00', slots: 2 },
    },
    {
      id: 'timezone_mx',
      labelEs: 'Zona America/Mexico_City',
      coveredBy: 'formatMexicoValidLocal / workDateKey',
      ok: ACCESS_SCHEDULE_TZ === 'America/Mexico_City' || ACCESS_SCHEDULE_TZ.includes('Mexico'),
      sample: { tz: ACCESS_SCHEDULE_TZ },
    },
  ];
}
