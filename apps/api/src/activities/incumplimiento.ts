/**
 * Actividades no cumplidas.
 *
 * Regla de Adam (22-10-2026): «cualquier actividad que no se acabe después de la jornada laboral
 * se toma como incumplida», y un superior debe poder registrar que una actividad no se cumplió.
 *
 * - **Cierre de jornada.** Al término de la jornada del día en que vencía su entrega (el mismo
 *   límite del semáforo, `limiteDeEntrega`), lo que siga sin entregarse pasa a «No cumplida» y
 *   queda un registro formal (`activity_non_compliances`). Entregada = todos los que la ejecutan
 *   mandaron su evidencia antes del cierre; por eso «Por Validar» nunca se cierra: ya se entregó y
 *   lo que falta es el visto bueno del jefe.
 * - **La jornada** termina a la hora de salida más tarde de quienes la ejecutan (su horario en
 *   `work_schedules`, 18:00 si no tienen). Un límite explícito más tarde que eso manda; una
 *   actividad citada después de la salida tiene hasta que acabe el día.
 * - **Aviso previo** una hora antes del cierre a quien la tiene, una sola vez.
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

/** Minutos antes del cierre en que se le avisa a quien la tiene. */
export const AVISO_PREVIO_MIN = 60;

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

export type DecisionCierre =
  | { accion: 'cerrar'; pendientes: number[] }
  | { accion: 'avisar'; pendientes: number[] }
  | { accion: null; pendientes: number[] };

/**
 * Qué toca hacer con una actividad en este momento: cerrarla como no cumplida, avisar que se
 * acerca el cierre, o nada. `pendientes` = quienes no la entregaron a tiempo.
 */
export function decidirCierreDeJornada(p: {
  estatus: string | null | undefined;
  cierre: Date | null;
  ahora: Date;
  avisadoAt?: Date | null;
  ejecutores: EjecutorEntrega[];
  vigenteDesde?: Date;
}): DecisionCierre {
  const nada = (pendientes: number[] = []): DecisionCierre => ({ accion: null, pendientes });
  if (!esCandidataAlCierre(p.estatus) || !p.cierre) return nada();
  const desde = p.vigenteDesde ?? NO_CUMPLIDA_VIGENTE_DESDE;
  if (p.cierre.getTime() < desde.getTime()) return nada();

  const cierre = p.cierre;
  const pendientes = p.ejecutores
    .filter((e) => !e.entregadaAt || e.entregadaAt.getTime() > cierre.getTime())
    .map((e) => e.userId);
  // Todos entregaron a tiempo: si se la devolvieron después, es tema de revisión, no de plazo.
  if (p.ejecutores.length && !pendientes.length) return nada();

  if (p.ahora.getTime() >= cierre.getTime()) return { accion: 'cerrar', pendientes };
  if (!p.avisadoAt && p.ahora.getTime() >= cierre.getTime() - AVISO_PREVIO_MIN * 60_000) {
    return { accion: 'avisar', pendientes };
  }
  return nada(pendientes);
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
