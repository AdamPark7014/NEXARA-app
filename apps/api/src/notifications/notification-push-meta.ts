/**
 * Metadatos de push eficientes: canal Android, collapse key FCM, prioridad.
 * Una misma entidad/acción colapsa en la bandeja en vez de spamear.
 */

import { WORKDAY_TIMEZONE } from '../common/time/workday.js';

export type PushRoutingChannel =
  | 'default'
  | 'alerts'
  | 'tickets'
  | 'gps'
  | 'ops'
  | 'chat'
  | 'approvals'
  | 'attendance';

export function channelForCategory(category?: string | null): PushRoutingChannel {
  const c = (category || '').toLowerCase();
  if (c.includes('attendance') || c.includes('lunch') || c.includes('asistencia') || c.includes('comida')) {
    return 'attendance';
  }
  if (c.includes('ticket') || c.includes('support') || c.includes('alarm')) return 'tickets';
  if (c.includes('gps')) return 'gps';
  if (c.includes('chat') || c.includes('mention')) return 'chat';
  if (c.includes('approv') || c.includes('workflow')) return 'approvals';
  if (
    c.includes('activit') ||
    c.includes('evidence') ||
    c.includes('viatic') ||
    c.includes('ops') ||
    c.includes('vehicle') ||
    c.includes('tool')
  ) {
    return 'ops';
  }
  if (c.includes('security') || c.includes('alert') || c.includes('critical')) return 'alerts';
  return 'default';
}

/** Clave estable para reemplazar push previos de la misma entidad/acción. */
export function buildCollapseKey(opts: {
  event?: string | null;
  type?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  userId?: number | null;
}): string {
  const event = (opts.event || opts.type || 'notice').toString().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  const ent = (opts.entityType || 'x').toString().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  const id = opts.entityId != null && opts.entityId > 0 ? String(opts.entityId) : '0';
  const uid = opts.userId != null && opts.userId > 0 ? String(opts.userId) : '0';
  return `nx_${event}_${ent}_${id}_u${uid}`.slice(0, 64);
}

/**
 * Íconos que las apps dibujan en vector junto al aviso (dato `icon` del push).
 * Solo estas claves: las apps no conocen otras y sin ícono conocido pintan el genérico.
 */
export const NOTIFICATION_ICONS = [
  'entrada',
  'entrada_tarde',
  'salida',
  'comida_sale',
  'comida_regresa',
  'comida_tarde',
  'comida_aprobada',
  'comida_rechazada',
  'actividad_nueva',
  'actividad_inicio',
  'fotos',
  'documento',
  'formulario',
  'reasignada',
  'reprogramada',
  'despacho',
  'por_revisar',
  'correccion',
  'aprobada',
  'devuelta',
  'finalizada',
  'atraso',
  'vencida',
  'fuera_zona',
  'chat',
  'mencion',
  'seguridad',
  'aviso',
] as const;

export type NotificationIcon = (typeof NOTIFICATION_ICONS)[number];

const ICON_BY_TYPE: Record<string, NotificationIcon> = {
  ATTENDANCE_CHECKIN: 'entrada',
  ATTENDANCE_CHECKOUT: 'salida',
  LUNCH_CHECKIN: 'comida_sale',
  LUNCH_CHECKOUT: 'comida_regresa',
  ACTIVITY_ASSIGNED: 'actividad_nueva',
  ACTIVITY_STARTED: 'actividad_inicio',
  ACTIVITY_RESCHEDULED: 'reprogramada',
  ACTIVITY_APPROVED: 'aprobada',
  ACTIVITY_REJECTED: 'devuelta',
  ACTIVITY_RESUBMIT_REQUESTED: 'devuelta',
  ACTIVITY_COMPLETED: 'finalizada',
  ACTIVITY_OUT_OF_ZONE: 'fuera_zona',
  EVIDENCE_SUBMITTED: 'por_revisar',
  EVIDENCE_APPROVED: 'aprobada',
  EVIDENCE_REJECTED: 'devuelta',
  EVIDENCE_RESUBMIT_REQUESTED: 'devuelta',
  SLA_ALERT: 'atraso',
  SLA_BREACH: 'vencida',
  CHAT_MESSAGE: 'chat',
  CHAT_MENTION: 'mencion',
  ACS_ACCESS_DENIED: 'seguridad',
};

/**
 * Ícono por omisión cuando quien crea el aviso no elige uno: primero por tipo, luego por
 * la terminación del tipo (aprobado, rechazado, por vencer) y al final por categoría.
 */
export function iconForNotification(type?: string | null, category?: string | null): NotificationIcon {
  const t = (type || '').toUpperCase();
  const exacto = ICON_BY_TYPE[t];
  if (exacto) return exacto;
  if (/_APPROVED$/.test(t)) return 'aprobada';
  if (/_REJECTED$/.test(t)) return 'devuelta';
  if (/_EXPIRED$|_DUE$|_BREACH$/.test(t)) return 'vencida';
  if (/_EXPIRING$|_EXPIRATION_WARNING$/.test(t)) return 'atraso';

  const c = (category || '').toLowerCase();
  if (c.includes('mention')) return 'mencion';
  if (c.includes('chat')) return 'chat';
  if (c.includes('security') || c.includes('alarm') || c.includes('acs')) return 'seguridad';
  if (c.includes('sla-breach')) return 'vencida';
  if (c.includes('sla')) return 'atraso';
  if (c.includes('lunch') || c.includes('comida')) return 'comida_sale';
  if (c.includes('attendance') || c.includes('asistencia')) return 'entrada';
  if (c.includes('evidence')) return 'por_revisar';
  if (c.includes('activit')) return 'actividad_nueva';
  return 'aviso';
}

const PARTICULAS_APELLIDO = new Set(['de', 'del', 'la', 'las', 'los', 'y']);

/**
 * Nombre corto para avisos: primer nombre y primer apellido.
 * «Christian Eduardo Del Pozo Sánchez» → «Christian Del Pozo»; «Israel Ramos Lima» → «Israel Ramos».
 * Las partículas (de, del, la…) viajan con el apellido que sigue. Con dos palabras o menos no cambia.
 */
export function nombreCorto(nombre?: string | null): string {
  const limpio = (nombre || '').trim().replace(/\s+/g, ' ');
  if (!limpio) return '';
  const palabras = limpio.split(' ');
  if (palabras.length <= 2) return limpio;

  const partes: string[] = [];
  let pendientes: string[] = [];
  for (const palabra of palabras) {
    if (PARTICULAS_APELLIDO.has(palabra.toLowerCase())) {
      pendientes.push(palabra);
      continue;
    }
    partes.push([...pendientes, palabra].join(' '));
    pendientes = [];
  }
  if (pendientes.length) {
    if (partes.length) partes[partes.length - 1] = `${partes[partes.length - 1]} ${pendientes.join(' ')}`;
    else partes.push(pendientes.join(' '));
  }

  if (partes.length <= 2) return partes.join(' ');
  // Tres partes: nombre + dos apellidos. Cuatro o más: los dos últimos son los apellidos.
  const primerApellido = partes.length === 3 ? partes[1] : partes[partes.length - 2];
  return `${partes[0]} ${primerApellido}`;
}

function periodoDelDia(valor: string): string {
  const p = valor.toLowerCase().replace(/[\s.]/g, '');
  if (p.startsWith('a')) return 'a. m.';
  if (p.startsWith('p')) return 'p. m.';
  return valor;
}

const HORA_AVISO = new Map<string, Intl.DateTimeFormat>();
const FECHA_AVISO = new Map<string, Intl.DateTimeFormat>();

function formato(
  cache: Map<string, Intl.DateTimeFormat>,
  tz: string,
  opciones: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  let f = cache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('es-MX', { timeZone: tz, hour12: true, ...opciones });
    cache.set(tz, f);
  }
  return f;
}

/** «8:02 a. m.» en la zona indicada (por omisión, la de la jornada); ICU da «a.m.» y aquí se escribe «a. m.». */
export function horaAviso(d: Date, tz = WORKDAY_TIMEZONE): string {
  const partes = formato(HORA_AVISO, tz, { hour: 'numeric', minute: '2-digit' }).formatToParts(d);
  const v = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${v('hour')}:${v('minute')} ${periodoDelDia(v('dayPeriod'))}`;
}

/** «jue 17 sep, 9:00 a. m.» en la zona indicada. */
export function fechaAviso(d: Date, tz = WORKDAY_TIMEZONE): string {
  const partes = formato(FECHA_AVISO, tz, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).formatToParts(d);
  const v = (tipo: string) => (partes.find((p) => p.type === tipo)?.value ?? '').replace(/\.$/, '');
  return `${v('weekday')} ${v('day')} ${v('month')}, ${horaAviso(d, tz)}`;
}
