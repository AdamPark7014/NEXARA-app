/**
 * Plantillas lógicas ERP → Hikvision RightPlan / Valid.
 *
 * Capas ISAPI (verificadas HikGateway calendarios):
 *   UserRightWeekPlanCfg → UserRightPlanTemplate → UserInfo.RightPlan.planTemplateNo
 *
 * IDs de plantilla en terminal (DS-K1T):
 *   1 = acceso todo el día (fábrica)
 *   2 = horario oficina (UserRightWeekPlanCfg)
 *   3 = contratista / diurno restringido
 *   4 = fuera de horario (overnight 2 franjas)
 *   5 = fin de semana
 *
 * Override por env: INTEGRA_PLAN_ALWAYS | INTEGRA_PLAN_OFFICE |
 * INTEGRA_PLAN_CONTRACTOR | INTEGRA_PLAN_VISITOR |
 * INTEGRA_PLAN_AFTER_HOURS | INTEGRA_PLAN_WEEKEND
 */

import {
  formatMexicoValidLocal,
  mexicoTodayBounds,
} from './access-schedule-validate';

export type AccessScheduleTemplateKey =
  | 'always_on'
  | 'office_hours'
  | 'after_hours'
  | 'weekend'
  | 'contractor'
  | 'visitor'
  | 'disabled'
  | 'none';

/** Alcance de puertas en el sitio (cada ACS = 1 puerta local doorNo=1). */
export type AccessDoorScope =
  | 'all'
  | 'contractor_subset'
  | 'meeting_room'
  | 'none';

export type AccessScheduleTemplate = {
  key: AccessScheduleTemplateKey;
  label: string;
  description: string;
  /** false → no crear/empujar ficha ACS (salvo disable). */
  pushToAcs: boolean;
  userType: 'normal' | 'visitor';
  /** planTemplateNo en RightPlan (string, ISAPI). */
  planTemplateNo: string;
  doorScope: AccessDoorScope;
  doorRight: string;
  /** Vigencia: indefinite | dated (contrato) | day (visitante). */
  validity: 'indefinite' | 'dated' | 'day' | 'disabled';
};

export type AccessScheduleAssignment = AccessScheduleTemplate & {
  roleKey: string | null;
  employeeNumber: string | null;
  validEnable: boolean;
  beginTime: string;
  endTime: string;
  RightPlan: Array<{ doorNo: number; planTemplateNo: string }>;
  /** Pistas UI en español. */
  hint: string;
  integraEditorPath: string;
};

const INDEFINITE_BEGIN = '2020-01-01T00:00:00';
const INDEFINITE_END = '2037-12-31T23:59:59';

function envPlan(name: string, fallback: string): string {
  const raw = String(process.env[name] || '').trim();
  return raw || fallback;
}

export const ACCESS_SCHEDULE_TEMPLATES: Record<
  AccessScheduleTemplateKey,
  Omit<AccessScheduleTemplate, 'planTemplateNo'> & { planTemplateNo: () => string }
> = {
  always_on: {
    key: 'always_on',
    label: '24/7 · todas las puertas',
    description: 'Acceso continuo e indefinido a todos los terminales del sitio.',
    pushToAcs: true,
    userType: 'normal',
    planTemplateNo: () => envPlan('INTEGRA_PLAN_ALWAYS', '1'),
    doorScope: 'all',
    doorRight: '1',
    validity: 'indefinite',
  },
  office_hours: {
    key: 'office_hours',
    label: 'Horario de oficina · todas las puertas',
    description:
      'Empleado indefinido: plantilla de oficina (L–V) en todos los terminales. Vigencia indefinida.',
    pushToAcs: true,
    userType: 'normal',
    planTemplateNo: () => envPlan('INTEGRA_PLAN_OFFICE', '2'),
    doorScope: 'all',
    doorRight: '1',
    validity: 'indefinite',
  },
  after_hours: {
    key: 'after_hours',
    label: 'Fuera de horario · L–V nocturno',
    description:
      'Lun–Vie 18:00–08:00 (2 franjas por medianoche). Vigencia indefinida.',
    pushToAcs: true,
    userType: 'normal',
    planTemplateNo: () => envPlan('INTEGRA_PLAN_AFTER_HOURS', '4'),
    doorScope: 'all',
    doorRight: '1',
    validity: 'indefinite',
  },
  weekend: {
    key: 'weekend',
    label: 'Fin de semana · todas las puertas',
    description: 'Sábado y domingo 00:00–24:00. Vigencia indefinida.',
    pushToAcs: true,
    userType: 'normal',
    planTemplateNo: () => envPlan('INTEGRA_PLAN_WEEKEND', '5'),
    doorScope: 'all',
    doorRight: '1',
    validity: 'indefinite',
  },
  contractor: {
    key: 'contractor',
    label: 'Contratista · subset con vigencia',
    description:
      'Acceso General + Sala de Juntas; vigencia fechada (ingreso → +12 meses). Sin Gerencia/Privados.',
    pushToAcs: true,
    userType: 'normal',
    planTemplateNo: () => envPlan('INTEGRA_PLAN_CONTRACTOR', '3'),
    doorScope: 'contractor_subset',
    doorRight: '1',
    validity: 'dated',
  },
  visitor: {
    key: 'visitor',
    label: 'Visitante · Sala de Juntas (día)',
    description: 'Solo terminal Sala de Juntas; vigencia del día en curso.',
    pushToAcs: true,
    userType: 'visitor',
    planTemplateNo: () => envPlan('INTEGRA_PLAN_VISITOR', '1'),
    doorScope: 'meeting_room',
    doorRight: '1',
    validity: 'day',
  },
  disabled: {
    key: 'disabled',
    label: 'Deshabilitado',
    description: 'Usuario inactivo: Valid.enable=false en terminales (no borra ficha).',
    pushToAcs: true,
    userType: 'normal',
    planTemplateNo: () => envPlan('INTEGRA_PLAN_ALWAYS', '1'),
    doorScope: 'all',
    doorRight: '1',
    validity: 'disabled',
  },
  none: {
    key: 'none',
    label: 'Sin acceso ACS',
    description: 'No se empuja ficha a terminales Integra.',
    pushToAcs: false,
    userType: 'normal',
    planTemplateNo: () => '1',
    doorScope: 'none',
    doorRight: '',
    validity: 'disabled',
  },
};

/** Roles con acceso 24/7 a todas las puertas. */
const ALWAYS_ON_ROLES = new Set([
  'super_admin',
  'ceo',
  'dir_operaciones',
  'arquitecto',
]);

/** Roles de campo / contratista por defecto. */
const CONTRACTOR_ROLES = new Set(['ing_campo']);

/** Portal / cliente → visitante Sala de Juntas. */
const VISITOR_ROLES = new Set(['cliente']);

/** Roles internos de oficina (resto del staff). */
const OFFICE_ROLES = new Set([
  'dir_admin',
  'coord_admin',
  'administrativo',
  'coord_operaciones',
  'ing_soporte',
  'coord_ventas',
  'vendedor',
  'lider_diseno',
  'disenador',
  'rh',
  'contabilidad',
]);

function looksContractor(tipoContrato?: string | null): boolean {
  const t = String(tipoContrato || '')
    .trim()
    .toLowerCase();
  if (!t) return false;
  return /contrat|temporal|prestaci|honorari|externo|freelance|obra/.test(t);
}

function looksVisitor(tipoContrato?: string | null): boolean {
  const t = String(tipoContrato || '')
    .trim()
    .toLowerCase();
  return /visitante|invitad|guest|visita/.test(t);
}

function looksIndefinite(tipoContrato?: string | null): boolean {
  const t = String(tipoContrato || '')
    .trim()
    .toLowerCase();
  if (!t) return true;
  return /indefinid|planta|permanente|nomina|nómina/.test(t);
}

export function resolveAccessScheduleKey(input: {
  isActive?: boolean | null;
  roleKey?: string | null;
  orgRoleKey?: string | null;
  tipoContrato?: string | null;
}): AccessScheduleTemplateKey {
  if (input.isActive === false) return 'disabled';

  const role = String(input.roleKey || input.orgRoleKey || '')
    .trim()
    .toLowerCase();

  if (VISITOR_ROLES.has(role) || looksVisitor(input.tipoContrato)) return 'visitor';
  if (ALWAYS_ON_ROLES.has(role)) return 'always_on';
  if (CONTRACTOR_ROLES.has(role) || looksContractor(input.tipoContrato)) return 'contractor';
  if (OFFICE_ROLES.has(role) || looksIndefinite(input.tipoContrato) || !role) {
    return 'office_hours';
  }
  // Rol desconocido: oficina por defecto (empleados genéricos).
  return 'office_hours';
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

/** ISO local sin Z en America/Mexico_City (el contenedor corre en UTC). */
export function formatLocalValid(d: Date): string {
  return formatMexicoValidLocal(d);
}

export function resolveValidityWindow(
  validity: AccessScheduleTemplate['validity'],
  opts?: { fechaIngreso?: Date | string | null; now?: Date },
): { enable: boolean; beginTime: string; endTime: string } {
  const now = opts?.now ?? new Date();
  if (validity === 'disabled') {
    return { enable: false, beginTime: INDEFINITE_BEGIN, endTime: INDEFINITE_END };
  }
  if (validity === 'day') {
    const day = mexicoTodayBounds(now);
    return { enable: true, beginTime: day.beginTime, endTime: day.endTime };
  }
  if (validity === 'dated') {
    let y: number;
    let m: number;
    let d: number;
    if (typeof opts?.fechaIngreso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(opts.fechaIngreso)) {
      [y, m, d] = opts.fechaIngreso.slice(0, 10).split('-').map(Number);
    } else if (opts?.fechaIngreso) {
      const ingress = new Date(opts.fechaIngreso);
      if (Number.isNaN(ingress.getTime())) {
        const day = mexicoTodayBounds(now).dayKey.split('-').map(Number);
        [y, m, d] = day;
      } else {
        const local = formatMexicoValidLocal(ingress, { startOfDay: true });
        [y, m, d] = local.slice(0, 10).split('-').map(Number);
      }
    } else {
      [y, m, d] = mexicoTodayBounds(now).dayKey.split('-').map(Number);
    }
    const beginTime = `${y}-${pad2(m)}-${pad2(d)}T00:00:00`;
    const endTime = `${y + 1}-${pad2(m)}-${pad2(d)}T23:59:59`;
    return { enable: true, beginTime, endTime };
  }
  return { enable: true, beginTime: INDEFINITE_BEGIN, endTime: INDEFINITE_END };
}

export function materializeTemplate(
  key: AccessScheduleTemplateKey,
): AccessScheduleTemplate {
  const t = ACCESS_SCHEDULE_TEMPLATES[key];
  return {
    key: t.key,
    label: t.label,
    description: t.description,
    pushToAcs: t.pushToAcs,
    userType: t.userType,
    planTemplateNo: t.planTemplateNo(),
    doorScope: t.doorScope,
    doorRight: t.doorRight,
    validity: t.validity,
  };
}

/**
 * ¿Este ACS entra en el alcance del template?
 * Nombres oficiales Oficinas: Sala de Juntas, Acceso Privados, Gerencia, Acceso General.
 */
export function deviceMatchesDoorScope(
  scope: AccessDoorScope,
  device: { name?: string | null; ip?: string | null },
  opts?: { meetingRoomIps?: string[] },
): boolean {
  if (scope === 'none') return false;
  if (scope === 'all') return true;

  const name = String(device.name || '').toLowerCase();
  const ip = String(device.ip || '').trim();
  const meetingIps = new Set(
    (opts?.meetingRoomIps || String(process.env.INTEGRA_MEETING_ROOM_IPS || '').split(','))
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const isMeeting =
    /junta|meeting|sala\s*de\s*juntas/.test(name) || (ip !== '' && meetingIps.has(ip));
  const isGeneral = /acceso\s*general|general|recepci|lobby|entrada/.test(name);
  const isRestricted = /gerencia|privado|privados|vip/.test(name);

  if (scope === 'meeting_room') return isMeeting;
  if (scope === 'contractor_subset') {
    if (isRestricted) return false;
    return isMeeting || isGeneral || (!name && !isRestricted);
  }
  return true;
}

export function buildAccessScheduleAssignment(input: {
  employeeNumber?: string | null;
  isActive?: boolean | null;
  roleKey?: string | null;
  orgRoleKey?: string | null;
  tipoContrato?: string | null;
  fechaIngreso?: Date | string | null;
  now?: Date;
}): AccessScheduleAssignment {
  const key = resolveAccessScheduleKey(input);
  const template = materializeTemplate(key);
  const window = resolveValidityWindow(template.validity, {
    fechaIngreso: input.fechaIngreso,
    now: input.now,
  });
  const planNo = template.planTemplateNo;
  const roleKey = String(input.roleKey || input.orgRoleKey || '').trim() || null;
  const emp = String(input.employeeNumber || '').trim() || null;

  const hintParts = [
    `Plantilla «${template.label}»`,
    `planTemplateNo=${planNo}`,
    template.doorScope === 'all'
      ? 'todas las puertas'
      : template.doorScope === 'meeting_room'
        ? 'solo Sala de Juntas'
        : template.doorScope === 'contractor_subset'
          ? 'subset (General + Juntas)'
          : 'sin puertas',
    window.enable
      ? `vigencia ${window.beginTime.slice(0, 10)} → ${window.endTime.slice(0, 10)}`
      : 'deshabilitado en ACS',
  ];

  return {
    ...template,
    roleKey,
    employeeNumber: emp,
    validEnable: window.enable,
    beginTime: window.beginTime,
    endTime: window.endTime,
    RightPlan:
      template.doorScope === 'none'
        ? []
        : [{ doorNo: 1, planTemplateNo: planNo }],
    hint: hintParts.join(' · '),
    integraEditorPath: '/integra/people',
  };
}

/** Catálogo para UI / docs. */
export function listAccessScheduleTemplates(): AccessScheduleTemplate[] {
  return (Object.keys(ACCESS_SCHEDULE_TEMPLATES) as AccessScheduleTemplateKey[]).map(
    (k) => materializeTemplate(k),
  );
}
