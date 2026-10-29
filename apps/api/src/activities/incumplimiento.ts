/**
 * Actividades no cumplidas.
 *
 * Regla de Adam (22-10-2026): «cualquier actividad que no se acabe después de la jornada laboral
 * se toma como incumplida», y un superior debe poder registrar que una actividad no se cumplió.
 *
 * - **Cierre de jornada = la checada de salida.** Regla de Adam (28-10-2026): nada se cierra a una
 *   hora fija ni por un cron. Cuando la persona checa su salida de asistencia ella misma (no la
 *   salida automática de las 23:30 ni la que registra un jefe), lo que vencía ese día o antes
 *   (`limiteDeEntrega`, el mismo límite del semáforo) y no entregó pasa a «No cumplida», con
 *   registro formal (`activity_non_compliances`). En equipo, cuando ya salieron todos los que no la
 *   entregaron. Entregada = mandó su evidencia; por eso «Por Validar» nunca se cierra: ya se
 *   entregó y lo que falta es el visto bueno del jefe.
 * - **Pasarse de la hora** el mismo día no la cierra: la actividad sigue abierta y el semáforo la
 *   marca atrasada con cuánto se pasó.
 * - **Registro manual**: los mismos superiores que pueden cancelarla, con causa y observaciones.
 * - **Reprogramar** la reabre con fecha nueva; el incumplimiento no se borra (es lo que miden
 *   los KPI de «en tiempo y forma»).
 *
 * Funciones puras: el servicio (`activity-non-compliance.service.ts`) lee la base y aplica.
 */
import { workDateKey, workDayAtClock, workDayEnd } from '../common/time/workday.js';
import { ACTIVITY_STATUS, normalizeActivityStatus, type ActivityStatus } from './activity-status.js';
import { limiteDeEntrega } from './semaforo-actividad.js';
import type { Periodo } from './actividad-periodo.js';

/**
 * Desde cuándo aplica el cierre automático: 22-10-2026 00:00 en México. Lo que venció antes se
 * queda como estaba (atrasado): no se cierra en bloque ni se le avisa a nadie a deshoras.
 */
export const NO_CUMPLIDA_VIGENTE_DESDE = new Date('2026-10-22T06:00:00.000Z');

/** Salida de la jornada normal (la misma de `JORNADA_SALIDA_HM` en asistencia). */
export const SALIDA_POR_OMISION = '18:00';

/** Lo que se asigna sobre la hora tiene al menos esto para entregarse. */
export const MARGEN_TRAS_ASIGNAR_MIN = 60;

export type OrigenIncumplimiento = 'CIERRE_JORNADA' | 'MANUAL';

/** Catálogo de causas. La primera es la que pone el sistema al cierre. */
export const CAUSAS_INCUMPLIMIENTO = [
  { clave: 'SIN_ENTREGA', etiqueta: 'Sin entrega al cierre de la jornada' },
  { clave: 'MATERIAL', etiqueta: 'Falta de material, herramienta o equipo' },
  { clave: 'ACCESO', etiqueta: 'Sin acceso al sitio o cliente no disponible' },
  { clave: 'PERSONAL', etiqueta: 'Personal asignado no disponible' },
  { clave: 'PLANEACION', etiqueta: 'Alcance o tiempo mal planeado' },
  { clave: 'CALIDAD', etiqueta: 'La entrega no cumple lo solicitado' },
  { clave: 'OTRA', etiqueta: 'Otra causa' },
] as const;

export type CausaIncumplimiento = (typeof CAUSAS_INCUMPLIMIENTO)[number]['clave'];

export const CAUSA_CIERRE_JORNADA: CausaIncumplimiento = 'SIN_ENTREGA';

export function esCausaValida(valor: unknown): valor is CausaIncumplimiento {
  return CAUSAS_INCUMPLIMIENTO.some((c) => c.clave === valor);
}

export function etiquetaCausa(clave?: string | null): string {
  return CAUSAS_INCUMPLIMIENTO.find((c) => c.clave === clave)?.etiqueta ?? 'Otra causa';
}

/** Estados que el cierre de jornada puede dar por no cumplidos: lo que nadie ha entregado. */
const SIN_ENTREGAR: ActivityStatus[] = [
  ACTIVITY_STATUS.PENDIENTE,
  ACTIVITY_STATUS.ASIGNADA,
  ACTIVITY_STATUS.EN_PROCESO,
  ACTIVITY_STATUS.RECHAZADA,
];

export function esNoCumplida(estatus: unknown): boolean {
  return normalizeActivityStatus(estatus) === ACTIVITY_STATUS.NO_CUMPLIDA;
}

/** ¿El cierre de jornada la puede tocar? Solo lo abierto y sin entregar. */
export function esCandidataAlCierre(estatus: unknown): boolean {
  const s = normalizeActivityStatus(estatus);
  return s != null && SIN_ENTREGAR.includes(s);
}

/** ¿Un superior la puede registrar como no cumplida? Todo lo que siga abierto, entregado o no. */
export function admiteRegistroManual(estatus: unknown): boolean {
  const s = normalizeActivityStatus(estatus);
  return s != null && (SIN_ENTREGAR.includes(s) || s === ACTIVITY_STATUS.POR_VALIDAR);
}

/** `HH:MM` → minutos del día, o null si no es una hora válida. */
function minutosDeHora(hm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** La salida más tarde de quienes la ejecutan; sin horarios, la de la jornada normal. */
export function salidaMasTarde(horasSalida?: Array<string | null | undefined> | null): number {
  const validas = (horasSalida ?? []).map(minutosDeHora).filter((m): m is number => m != null);
  return validas.length ? Math.max(...validas) : (minutosDeHora(SALIDA_POR_OMISION) as number);
}

function aFecha(valor?: Date | string | null): Date | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

const masTarde = (a: Date, b: Date) => (b.getTime() > a.getTime() ? b : a);

/**
 * Instante en que la actividad se da por no cumplida si no se entregó. `null` = no tiene fecha
 * con qué vencerse (sin fecha no hay incumplimiento automático).
 */
export function cierreDeJornada(p: {
  fechaInicio?: Date | string | null;
  fechaMaxima?: Date | string | null;
  fechaEntregaEsperada?: Date | string | null;
  periodoInicio?: Date | string | null;
  periodoFin?: Date | string | null;
  periodo?: Periodo | null;
  fechaAsignacion?: Date | string | null;
  /** `HH:MM` de salida de cada persona que la ejecuta (null = sin horario propio). */
  horasSalida?: Array<string | null | undefined> | null;
}): Date | null {
  const limite = limiteDeEntrega(p);
  if (!limite) return null;

  const salida = salidaMasTarde(p.horasSalida);
  const finJornada = workDayAtClock(limite, Math.floor(salida / 60), salida % 60);
  const finDelDia = workDayEnd(limite);

  // El límite que no es explícito llega como fin del día (hora citada del formulario o último día
  // del periodo): ahí manda la jornada. Uno explícito más tarde que la salida se respeta.
  const limiteEsFinDeDia = limite.getTime() >= finDelDia.getTime() - 60_000;
  let cierre = limiteEsFinDeDia ? finJornada : masTarde(limite, finJornada);

  // Citada después de la salida (trabajo fuera de horario): tiene hasta que acabe ese día.
  const inicio = aFecha(p.fechaInicio);
  if (inicio && workDateKey(inicio) === workDateKey(limite) && inicio.getTime() >= finJornada.getTime()) {
    cierre = masTarde(cierre, finDelDia);
  }

  // Nadie queda incumplido por algo que le asignaron sin tiempo para hacerlo.
  const asignada = aFecha(p.fechaAsignacion);
  if (asignada) cierre = masTarde(cierre, new Date(asignada.getTime() + MARGEN_TRAS_ASIGNAR_MIN * 60_000));

  return cierre;
}

export type EjecutorEntrega = { userId: number; entregadaAt: Date | null };

export type EjecutorAlSalir = EjecutorEntrega & {
  /** Su salida propia del día que se evalúa (null = no ha checado). */
  salidaAt: Date | null;
  /** Una salida antes de esto no cuenta: ver `salidaCuentaDesde`. */
  desde: Date | null;
};

/**
 * Desde cuándo su salida cierra la actividad: no antes de que empiece (una citada después de la
 * salida se queda para el día siguiente) ni antes de una hora de habérsela asignado (nadie queda
 * incumplido por algo que le dieron sin tiempo para hacerlo).
 */
export function salidaCuentaDesde(p: {
  fechaInicio?: Date | string | null;
  asignadaAt?: Date | string | null;
}): Date | null {
  const inicio = aFecha(p.fechaInicio);
  const asignada = aFecha(p.asignadaAt);
  const conMargen = asignada ? new Date(asignada.getTime() + MARGEN_TRAS_ASIGNAR_MIN * 60_000) : null;
  if (inicio && conMargen) return masTarde(inicio, conMargen);
  return inicio ?? conMargen;
}

/**
 * ¿La actividad se cierra como no cumplida con las salidas del día `dia` (`AAAA-MM-DD`)? Solo si
 * ya vencía ese día (o antes) y todos los que no la entregaron checaron su salida ese día después
 * de `desde`. `pendientes` = quienes salieron sin entregarla.
 */
export function decidirCierrePorSalida(p: {
  estatus: string | null | undefined;
  limite: Date | null;
  dia: string;
  ejecutores: EjecutorAlSalir[];
  vigenteDesde?: Date;
}): { cerrar: boolean; pendientes: number[] } {
  const no = { cerrar: false, pendientes: [] as number[] };
  if (!esCandidataAlCierre(p.estatus) || !p.limite) return no;
  if (p.limite.getTime() < (p.vigenteDesde ?? NO_CUMPLIDA_VIGENTE_DESDE).getTime()) return no;
  if (workDateKey(p.limite) > p.dia) return no;

  const sinEntregar = p.ejecutores.filter((e) => !e.entregadaAt);
  // Todos entregaron: si se la devolvieron después, es tema de revisión, no de plazo.
  if (!sinEntregar.length) return no;
  const salieron = sinEntregar.every(
    (e) => e.salidaAt && workDateKey(e.salidaAt) === p.dia && (!e.desde || e.salidaAt.getTime() >= e.desde.getTime()),
  );
  return salieron ? { cerrar: true, pendientes: sinEntregar.map((e) => e.userId) } : no;
}

/** Estatus con que se reabre al reprogramar: en proceso si alguien ya la había empezado. */
export function estatusAlReprogramar(estatusPrevio: string | null | undefined, arrancada: boolean): ActivityStatus {
  if (arrancada) return ACTIVITY_STATUS.EN_PROCESO;
  return normalizeActivityStatus(estatusPrevio) === ACTIVITY_STATUS.ASIGNADA
    ? ACTIVITY_STATUS.ASIGNADA
    : ACTIVITY_STATUS.PENDIENTE;
}

/** «18:00» en la zona de la jornada. */
export function horaDeCierre(cierre: Date): string {
  return cierre.toLocaleTimeString('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
