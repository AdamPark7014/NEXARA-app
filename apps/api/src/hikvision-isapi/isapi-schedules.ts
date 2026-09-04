import type { HikvisionIsapiClient } from './isapi.client';
import { modifyUserInfo, type UserInfoWrite } from './isapi-acs';

/**
 * Horarios de permiso ACS (User Permission Schedule) — verificado en
 * HikGateway Postman «Calendarios» + demo calendarios + sonda Oficinas
 * NEXARA DS-K1T (.160–.163), 2026-09-04.
 *
 * Tres capas (no inventadas):
 * 1. `UserRightWeekPlanCfg/<id>` — franjas por día (7×8)
 * 2. `UserRightPlanTemplate/<id>` — nombre + weekPlanNo
 * 3. `UserInfo.RightPlan[].planTemplateNo` — asignación por puerta
 * + `UserInfo.Valid` { enable, beginTime, endTime } — vigencia calendario
 *
 * En Oficinas cada terminal es 1 puerta (`doorNo: 1`). Distinto plan por
 * lugar = distinto `planTemplateNo` en el UserInfo de cada IP.
 */

export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export type TimeSegment = { beginTime: string; endTime: string };

export type WeekPlanSlot = {
  week: Weekday | string;
  id: number;
  enable: boolean;
  TimeSegment: TimeSegment;
};

export type WeekPlanCfg = {
  enable: boolean;
  WeekPlanCfg: WeekPlanSlot[];
};

export type PlanTemplate = {
  enable: boolean;
  templateName: string;
  weekPlanNo: number;
  holidayGroupNo?: string;
};

export type RightPlanEntry = {
  doorNo: number;
  planTemplateNo: string;
};

/** Vigencia ISAPI típica en DS-K1T (indefinido / «siempre»). */
export const INDEFINITE_VALID = {
  enable: true,
  beginTime: '2020-01-01T00:00:00',
  endTime: '2037-12-31T23:59:59',
  timeType: 'local' as const,
};

export type ValidMode = 'indefinite' | 'window' | 'disabled';

export type AccessPresetKey =
  | 'always'
  | 'never'
  | 'office_hours'
  | 'after_hours'
  | 'weekend'
  | 'visitor_today'
  | 'contractor';

const TIME_RE = /^([01]\d|2[0-4]):[0-5]\d:[0-5]\d$/;

export function isHhMmSs(v: string): boolean {
  if (!TIME_RE.test(v)) return false;
  // 24:00:00 lo usa el firmware de fábrica para «todo el día».
  if (v.startsWith('24:') && v !== '24:00:00') return false;
  return true;
}

function asArray<T>(v: T | T[] | null | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Rellena 7 días × 8 franjas (56). Las no listadas quedan apagadas. */
export function buildWeekPlanCfg(
  enabled: Array<{ week: Weekday | string; id?: number; beginTime: string; endTime: string }>,
  planEnable = true,
): WeekPlanCfg {
  const byKey = new Map<string, TimeSegment>();
  for (const seg of enabled) {
    const id = Math.min(8, Math.max(1, Math.floor(seg.id ?? 1) || 1));
    const begin = String(seg.beginTime || '').trim();
    const end = String(seg.endTime || '').trim();
    if (!isHhMmSs(begin) || !isHhMmSs(end)) {
      throw new Error(`Franja inválida ${seg.week} ${begin}-${end} (HH:MM:SS)`);
    }
    byKey.set(`${seg.week}:${id}`, { beginTime: begin, endTime: end });
  }
  const WeekPlanCfg: WeekPlanSlot[] = [];
  for (const week of WEEKDAYS) {
    for (let id = 1; id <= 8; id++) {
      const seg = byKey.get(`${week}:${id}`);
      WeekPlanCfg.push({
        week,
        id,
        enable: Boolean(seg),
        TimeSegment: seg || { beginTime: '00:00:00', endTime: '00:00:00' },
      });
    }
  }
  return { enable: planEnable, WeekPlanCfg };
}

/** Plantilla de fábrica: 00:00–24:00 todos los días (verificado .160). */
export function buildAlwaysOnWeekPlan(): WeekPlanCfg {
  return buildWeekPlanCfg(
    WEEKDAYS.map((week) => ({ week, id: 1, beginTime: '00:00:00', endTime: '24:00:00' })),
    true,
  );
}

/** Lun–Vie 08:00–18:00 (oficina típica). */
export function buildOfficeHoursWeekPlan(
  beginTime = '08:00:00',
  endTime = '18:00:00',
): WeekPlanCfg {
  const work: Weekday[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  return buildWeekPlanCfg(
    work.map((week) => ({ week, id: 1, beginTime, endTime })),
    true,
  );
}

/** Lun–Vie 18:00–24:00 + 00:00–08:00 (cruza medianoche en 2 franjas). */
export function buildAfterHoursWeekPlan(): WeekPlanCfg {
  const work: Weekday[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const segs: Array<{ week: Weekday; id: number; beginTime: string; endTime: string }> = [];
  for (const week of work) {
    segs.push({ week, id: 1, beginTime: '18:00:00', endTime: '24:00:00' });
    segs.push({ week, id: 2, beginTime: '00:00:00', endTime: '08:00:00' });
  }
  return buildWeekPlanCfg(segs, true);
}

/** Solo sábado y domingo 00:00–24:00. */
export function buildWeekendWeekPlan(): WeekPlanCfg {
  return buildWeekPlanCfg(
    (['Saturday', 'Sunday'] as Weekday[]).map((week) => ({
      week,
      id: 1,
      beginTime: '00:00:00',
      endTime: '24:00:00',
    })),
    true,
  );
}

export function classifyValid(valid?: {
  enable?: boolean;
  beginTime?: string;
  endTime?: string;
} | null): ValidMode {
  if (!valid || valid.enable === false) return 'disabled';
  const end = String(valid.endTime || '');
  // «Indefinido» = enable + fin ≥ 2036 (fábrica ~+10 años o DEFAULT 2037).
  if (/^203[6-9]-|^20[4-9]\d-/.test(end) || end.startsWith('2037-12-31')) {
    return 'indefinite';
  }
  return 'window';
}

export function validFromMode(
  mode: ValidMode,
  opts?: { beginTime?: string; endTime?: string },
): UserInfoWrite['Valid'] & { timeType?: string } {
  if (mode === 'disabled') {
    return {
      enable: false,
      beginTime: opts?.beginTime || INDEFINITE_VALID.beginTime,
      endTime: opts?.endTime || INDEFINITE_VALID.endTime,
      timeType: 'local',
    };
  }
  if (mode === 'indefinite') {
    return { ...INDEFINITE_VALID };
  }
  const begin = opts?.beginTime?.trim();
  const end = opts?.endTime?.trim();
  if (!begin || !end) {
    throw new Error('validMode=window requiere beginTime y endTime');
  }
  return { enable: true, beginTime: begin, endTime: end, timeType: 'local' };
}

export async function getWeekPlan(
  client: HikvisionIsapiClient,
  id: number,
): Promise<WeekPlanCfg | null> {
  const n = Math.floor(id);
  if (n < 1) return null;
  try {
    const raw = await client.get(`/ISAPI/AccessControl/UserRightWeekPlanCfg/${n}?format=json`);
    const statusCode = Number((raw as Record<string, unknown>).statusCode);
    const sub = String((raw as Record<string, unknown>).subStatusCode ?? '');
    if (statusCode === 4 || sub === 'notSupport') return null;
    const block = (raw.UserRightWeekPlanCfg ?? raw) as unknown as WeekPlanCfg;
    if (!block || !Array.isArray(block.WeekPlanCfg)) return null;
    return {
      enable: Boolean(block.enable),
      WeekPlanCfg: block.WeekPlanCfg,
    };
  } catch {
    return null;
  }
}

export async function putWeekPlan(
  client: HikvisionIsapiClient,
  id: number,
  cfg: WeekPlanCfg,
): Promise<void> {
  const n = Math.floor(id);
  if (n < 1) throw new Error('weekPlan id inválido');
  await client.putJson(`/ISAPI/AccessControl/UserRightWeekPlanCfg/${n}?format=json`, {
    UserRightWeekPlanCfg: {
      enable: cfg.enable !== false,
      WeekPlanCfg: cfg.WeekPlanCfg,
    },
  });
}

export async function getPlanTemplate(
  client: HikvisionIsapiClient,
  id: number,
): Promise<(PlanTemplate & { id: number }) | null> {
  const n = Math.floor(id);
  if (n < 1) return null;
  try {
    const raw = await client.get(`/ISAPI/AccessControl/UserRightPlanTemplate/${n}?format=json`);
    const statusCode = Number((raw as Record<string, unknown>).statusCode);
    const sub = String((raw as Record<string, unknown>).subStatusCode ?? '');
    if (statusCode === 4 || sub === 'notSupport') return null;
    const block = (raw.UserRightPlanTemplate ?? raw) as unknown as PlanTemplate;
    if (!block || typeof block !== 'object') return null;
    return {
      id: n,
      enable: Boolean(block.enable),
      templateName: String(block.templateName ?? ''),
      weekPlanNo: num(block.weekPlanNo, 0),
      holidayGroupNo:
        block.holidayGroupNo != null && String(block.holidayGroupNo) !== ''
          ? String(block.holidayGroupNo)
          : '',
    };
  } catch {
    return null;
  }
}

export async function putPlanTemplate(
  client: HikvisionIsapiClient,
  id: number,
  tmpl: PlanTemplate,
): Promise<void> {
  const n = Math.floor(id);
  if (n < 1) throw new Error('template id inválido');
  await client.putJson(`/ISAPI/AccessControl/UserRightPlanTemplate/${n}?format=json`, {
    UserRightPlanTemplate: {
      enable: tmpl.enable !== false,
      templateName: String(tmpl.templateName || `Plantilla ${n}`).slice(0, 32),
      weekPlanNo: Math.floor(tmpl.weekPlanNo) || n,
      holidayGroupNo: tmpl.holidayGroupNo != null ? String(tmpl.holidayGroupNo) : '',
    },
  });
}

/**
 * Lista plantillas 1..maxId (GET consecutivos). En DS-K1T Oficinas: 32.
 * Para UI: no hace falta drenar 32 week plans completos en el listado.
 */
export async function listPlanTemplates(
  client: HikvisionIsapiClient,
  maxId = 32,
): Promise<Array<PlanTemplate & { id: number }>> {
  const out: Array<PlanTemplate & { id: number }> = [];
  const limit = Math.min(Math.max(1, maxId), 64);
  for (let id = 1; id <= limit; id++) {
    const t = await getPlanTemplate(client, id);
    if (!t) {
      // Hueco o fin de rango soportado
      if (id > 3 && out.length > 0 && id > out[out.length - 1].id + 1) break;
      continue;
    }
    out.push(t);
  }
  return out;
}

/** Resumen ligero de week plans (enable + franjas activas). */
export async function listWeekPlanSummaries(
  client: HikvisionIsapiClient,
  maxId = 32,
): Promise<
  Array<{
    id: number;
    enable: boolean;
    enabledSegments: Array<{ week: string; id: number; beginTime: string; endTime: string }>;
  }>
> {
  const out: Array<{
    id: number;
    enable: boolean;
    enabledSegments: Array<{ week: string; id: number; beginTime: string; endTime: string }>;
  }> = [];
  const limit = Math.min(Math.max(1, maxId), 64);
  for (let id = 1; id <= limit; id++) {
    const w = await getWeekPlan(client, id);
    if (!w) {
      if (id > 3 && out.length > 0) break;
      continue;
    }
    out.push({
      id,
      enable: w.enable,
      enabledSegments: w.WeekPlanCfg.filter((s) => s.enable).map((s) => ({
        week: String(s.week),
        id: num(s.id, 1),
        beginTime: s.TimeSegment?.beginTime || '00:00:00',
        endTime: s.TimeSegment?.endTime || '00:00:00',
      })),
    });
  }
  return out;
}

export function parseRightPlan(raw: unknown): RightPlanEntry[] {
  return asArray(raw as RightPlanEntry | RightPlanEntry[])
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({
      doorNo: num((r as RightPlanEntry).doorNo, 1) || 1,
      planTemplateNo: String((r as RightPlanEntry).planTemplateNo ?? '1'),
    }));
}

/** Escribe RightPlan + Valid en un terminal (Modify). */
export async function assignUserAccess(
  client: HikvisionIsapiClient,
  opts: {
    employeeNo: string;
    name: string;
    userType?: string;
    gender?: string;
    doorRight?: string;
    Valid?: UserInfoWrite['Valid'];
    rightPlan: RightPlanEntry[];
  },
): Promise<void> {
  const Valid = opts.Valid
    ? {
        enable: opts.Valid.enable !== false,
        beginTime: opts.Valid.beginTime || INDEFINITE_VALID.beginTime,
        endTime: opts.Valid.endTime || INDEFINITE_VALID.endTime,
      }
    : undefined;
  await modifyUserInfo(client, {
    employeeNo: opts.employeeNo,
    name: opts.name,
    userType: opts.userType,
    gender: opts.gender,
    doorRight: opts.doorRight ?? '1',
    Valid,
    RightPlan: opts.rightPlan.map((r) => ({
      doorNo: r.doorNo || 1,
      planTemplateNo: String(r.planTemplateNo),
    })),
  });
}

/**
 * Asegura week plan + plantilla para un preset de franjas.
 * No pisa el slot 1 (fábrica 24/7) salvo `forceSlot1`.
 */
export async function ensurePresetTemplate(
  client: HikvisionIsapiClient,
  opts: {
    preset: Exclude<AccessPresetKey, 'always' | 'never' | 'visitor_today' | 'contractor'>;
    templateId?: number;
    weekPlanId?: number;
    officeBegin?: string;
    officeEnd?: string;
  },
): Promise<{ templateId: number; weekPlanId: number; templateName: string }> {
  const templateId = Math.min(32, Math.max(2, Math.floor(opts.templateId ?? 2) || 2));
  const weekPlanId = Math.min(32, Math.max(2, Math.floor(opts.weekPlanId ?? templateId) || templateId));
  let cfg: WeekPlanCfg;
  let templateName: string;
  switch (opts.preset) {
    case 'office_hours':
      cfg = buildOfficeHoursWeekPlan(opts.officeBegin, opts.officeEnd);
      templateName = 'Horario oficina';
      break;
    case 'after_hours':
      cfg = buildAfterHoursWeekPlan();
      templateName = 'Fuera de horario';
      break;
    case 'weekend':
      cfg = buildWeekendWeekPlan();
      templateName = 'Fin de semana';
      break;
    default:
      throw new Error(`Preset de franjas no soportado: ${opts.preset}`);
  }
  await putWeekPlan(client, weekPlanId, cfg);
  await putPlanTemplate(client, templateId, {
    enable: true,
    templateName,
    weekPlanNo: weekPlanId,
    holidayGroupNo: '',
  });
  return { templateId, weekPlanId, templateName };
}

export const ACCESS_SCHEDULE_MODEL_ES = {
  layers: [
    {
      id: 'weekPlan',
      endpoint: 'GET/PUT /ISAPI/AccessControl/UserRightWeekPlanCfg/<id>',
      meaning:
        'Horario semanal: hasta 8 franjas (HH:MM:SS) por día, lunes a domingo. El ID 1 de fábrica es 00:00–24:00 todos los días.',
    },
    {
      id: 'template',
      endpoint: 'GET/PUT /ISAPI/AccessControl/UserRightPlanTemplate/<id>',
      meaning:
        'Plantilla con nombre que apunta a un weekPlanNo (+ festivos opcionales). Es lo que se asigna a personas.',
    },
    {
      id: 'rightPlan',
      endpoint: 'PUT /ISAPI/AccessControl/UserInfo/Modify → RightPlan[]',
      meaning:
        'Por puerta del terminal: { doorNo, planTemplateNo }. En DS-K1T de Oficinas doorNo=1; distinto lugar = distinto equipo.',
    },
    {
      id: 'valid',
      endpoint: 'UserInfo.Valid { enable, beginTime, endTime }',
      meaning:
        'Vigencia calendario. Indefinido ≈ enable + endTime lejano (2037). Deshabilitado = enable:false. Visitante/contratista = ventana corta.',
    },
  ],
  verified: {
    devices: 'DS-K1T Oficinas .160–.163',
    maxIds: 32,
    factoryTemplate1: '24/7 (weekPlan 1)',
  },
  useCases: {
    indefinite: 'Valid.enable=true + endTime ≥ 2036/2037 + plantilla 1 (o franjas)',
    window: 'Valid beginTime/endTime concretos',
    weekly: 'WeekPlanCfg + plantilla + RightPlan.planTemplateNo',
    always247: 'Plantilla 1 / week plan 00:00–24:00',
    never: 'Valid.enable=false',
    perDoor: 'RightPlan por doorNo; entre terminales, Modify distinto por IP',
    contractor: 'Valid endTime cercano',
    visitorDayPass: 'Valid del día + plantilla deseada',
    afterHoursOrWeekend: 'Preset week plan en slot ≥2 + asignar plantilla',
  },
} as const;
