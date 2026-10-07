/**
 * Semáforo de una actividad por el reloj, no por la prioridad.
 *
 * Umbrales (los mismos en la pizarra, Mi equipo, los listados y el aviso):
 * - Rojo («Atrasada»): ya pasó la hora de inicio programada (`fechaInicio`) y
 *   nadie la ha iniciado, o ya pasó el tope (`fechaMaxima` o `fechaEntregaEsperada`,
 *   el que llegue primero; con periodo, el fin de su último día) y no está terminada,
 *   o ya lleva más tiempo real trabajado del que se planeó (`minutosPlan`/`minutosReales`;
 *   en una actividad de varios días el plan es de una jornada y no cuenta para esto).
 * - Naranja («Por vencer» si falta el tope, «Atención» si falta la hora de inicio):
 *   faltan `UMBRAL_POR_VENCER_MIN` minutos o menos para ese instante, y todavía no es roja.
 * - Verde («En tiempo»): el resto. Sin fecha no hay con qué atrasarse. Lo cerrado
 *   o cancelado no se queda en rojo. La prioridad no pinta el color. Pasar el plan
 *   sigue avisándose aparte también, en `alertaExcesoAt` (ese aviso no cambia).
 *
 * Un periodo que todavía no empieza está programado: verde, aunque la prioridad
 * sea alta. Pasada la hora de inicio de su primer día, sí es roja si no arrancó.
 */
import { workDateKey, workDayEnd } from '../common/time/workday.js';
import { esMultiDia, finDelPeriodo, periodoDeActividad, periodoFuturo, type Periodo } from './actividad-periodo.js';

export type Semaforo = 'rojo' | 'amarillo' | 'verde';
export type MotivoSemaforo = 'inicio' | 'tope' | 'plan';

/** Minutos antes del inicio o del tope en los que el recuadro pasa a naranja. */
export const UMBRAL_POR_VENCER_MIN = 30;

/**
 * Horas entre recordatorios una vez que ya se avisó el rojo.
 * `0` (el valor si no hay ajuste) = una sola vez, al entrar en rojo.
 * Se cambia por empresa en `system_settings.key = activities.overdue_reminder_hours`.
 */
export const RECORDATORIO_ATRASO_HORAS_DEFAULT = 0;
export const CLAVE_RECORDATORIO_ATRASO = 'activities.overdue_reminder_hours';

export type SemaforoTiempo = {
  semaforo: Semaforo;
  /** Minutos que lleva de atraso. Solo cuando es rojo. */
  minutosAtraso: number | null;
  /** Minutos que faltan para el inicio o el tope. Solo cuando es naranja. */
  minutosParaVencer: number | null;
  motivo: MotivoSemaforo | null;
};

const EN_TIEMPO: SemaforoTiempo = {
  semaforo: 'verde',
  minutosAtraso: null,
  minutosParaVencer: null,
  motivo: null,
};

export function evaluarSemaforo(params: {
  fechaInicio?: Date | string | null;
  fechaMaxima?: Date | string | null;
  fechaEntregaEsperada?: Date | string | null;
  inicioRealAt?: Date | string | null;
  finRealAt?: Date | string | null;
  estatus?: string | null;
  /** Cerrada por estatus o porque quien la hace ya la entregó. */
  cerrada?: boolean;
  cancelada?: boolean;
  periodoInicio?: Date | string | null;
  periodoFin?: Date | string | null;
  /** Periodo ya leído (`inicio`/`fin` en `AAAA-MM-DD`). Gana sobre las columnas sueltas. */
  periodo?: Periodo | null;
  /** Horas de plan ya en minutos (`minutosPlan` de `actividad-tiempos.ts`). Sin esto, no hay con qué comparar. */
  minutosPlan?: number | null;
  /** Minutos reales dedicados hasta ahora (o hasta `finRealAt`). */
  minutosReales?: number | null;
  ahora?: Date;
}): SemaforoTiempo {
  const ahora = params.ahora ?? new Date();
  if (params.cancelada || params.cerrada || esEstatusCerrado(params.estatus) || aFecha(params.finRealAt)) {
    return EN_TIEMPO;
  }

  const periodo = params.periodo ?? periodoDeActividad(params);
  if (periodo && periodoFuturo(periodo, workDateKey(ahora))) return EN_TIEMPO;

  const iniciada = Boolean(aFecha(params.inicioRealAt)) || estatusArrancado(params.estatus);
  const inicio = aFecha(params.fechaInicio);
  const tope = topeDe(params, periodo);

  const atrasos: Array<{ motivo: MotivoSemaforo; minutos: number }> = [];
  if (!iniciada && inicio && inicio.getTime() < ahora.getTime()) {
    atrasos.push({ motivo: 'inicio', minutos: minutosEntre(inicio, ahora) });
  }
  if (tope && tope.getTime() < ahora.getTime()) {
    atrasos.push({ motivo: 'tope', minutos: minutosEntre(tope, ahora) });
  }
  // Ya lleva más tiempo real del planeado. El plan es de una jornada: en una actividad de
  // varios días el reloj corre de corrido y no significa nada (mismo criterio que `estaExcedida`).
  if (
    !esMultiDia(periodo) &&
    params.minutosPlan != null &&
    params.minutosPlan > 0 &&
    params.minutosReales != null &&
    params.minutosReales > params.minutosPlan
  ) {
    atrasos.push({ motivo: 'plan', minutos: params.minutosReales - params.minutosPlan });
  }
  if (atrasos.length) {
    const peor = atrasos.reduce((a, b) => (b.minutos > a.minutos ? b : a));
    return {
      semaforo: 'rojo',
      minutosAtraso: peor.minutos,
      minutosParaVencer: null,
      motivo: peor.motivo,
    };
  }

  const porVencer: Array<{ motivo: MotivoSemaforo; minutos: number }> = [];
  if (!iniciada && inicio && inicio.getTime() >= ahora.getTime()) {
    const falta = minutosEntre(ahora, inicio);
    if (falta <= UMBRAL_POR_VENCER_MIN) porVencer.push({ motivo: 'inicio', minutos: falta });
  }
  if (tope && tope.getTime() >= ahora.getTime()) {
    const falta = minutosEntre(ahora, tope);
    if (falta <= UMBRAL_POR_VENCER_MIN) porVencer.push({ motivo: 'tope', minutos: falta });
  }
  if (porVencer.length) {
    const pronto = porVencer.reduce((a, b) => (b.minutos < a.minutos ? b : a));
    return {
      semaforo: 'amarillo',
      minutosAtraso: null,
      minutosParaVencer: pronto.minutos,
      motivo: pronto.motivo,
    };
  }

  return EN_TIEMPO;
}

/** «2 h 15 min», «45 min»; menos de un minuto se dice así para no poner «0 min». */
export function textoDuracion(min?: number | null): string | null {
  if (min == null || !Number.isFinite(min) || min < 0) return null;
  const total = Math.round(min);
  if (total < 1) return 'menos de 1 min';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Chip: «Atrasada · 2 h», «Por vencer · 12 min», «Atención · 8 min», «En tiempo». */
export function etiquetaSemaforo(luz: SemaforoTiempo): string {
  if (luz.semaforo === 'rojo') {
    const t = textoDuracion(luz.minutosAtraso);
    return t ? `Atrasada · ${t}` : 'Atrasada';
  }
  if (luz.semaforo === 'amarillo') {
    const t = textoDuracion(luz.minutosParaVencer);
    const base = luz.motivo === 'inicio' ? 'Atención' : 'Por vencer';
    return t ? `${base} · ${t}` : base;
  }
  return 'En tiempo';
}

/**
 * ¿Hay que avisar? Una vez al entrar en rojo. Con `horasRecordatorio` > 0, otra
 * vez pasado ese plazo (la marca `overdueAlertedAt` se corre en cada envío).
 * Si ya no está en rojo, se limpia la marca para que un atraso nuevo vuelva a avisar.
 */
export function decisionAvisoAtraso(params: {
  enRojo: boolean;
  overdueAlertedAt?: Date | null;
  ahora: Date;
  horasRecordatorio: number;
}): { avisar: boolean; limpiar: boolean } {
  if (!params.enRojo) {
    return { avisar: false, limpiar: params.overdueAlertedAt != null };
  }
  if (!params.overdueAlertedAt) return { avisar: true, limpiar: false };
  const horas = Number(params.horasRecordatorio);
  if (!Number.isFinite(horas) || horas <= 0) return { avisar: false, limpiar: false };
  const pasaron = params.ahora.getTime() - params.overdueAlertedAt.getTime();
  return { avisar: pasaron >= horas * 3_600_000, limpiar: false };
}

/** Horas leídas del ajuste. Basura o negativo = solo una vez. Tope de una semana. */
export function horasRecordatorioDe(valor: unknown): number {
  if (valor == null || valor === '') return RECORDATORIO_ATRASO_HORAS_DEFAULT;
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(24 * 7, n);
}

/**
 * Hasta cuándo hay que entregar una actividad: el mismo límite que pinta el semáforo.
 *
 * Los KPI y el SLA del flujo lo usan para decidir «a tiempo»: antes comparaban contra la
 * fecha máxima cruda, y como el formulario la manda igual a la hora de inicio, casi todo lo
 * que se entregaba el mismo día salía «tarde».
 */
export function limiteDeEntrega(params: {
  fechaInicio?: Date | string | null;
  fechaMaxima?: Date | string | null;
  fechaEntregaEsperada?: Date | string | null;
  periodoInicio?: Date | string | null;
  periodoFin?: Date | string | null;
  periodo?: Periodo | null;
}): Date | null {
  return topeDe(params, params.periodo ?? periodoDeActividad(params));
}

/**
 * El formulario manda `fechaInicio = fechaMaxima = fechaEntregaEsperada`: la hora que se
 * captura es la de inicio, no un límite. Un tope que no queda después del inicio se lee como
 * el fin de ese día (igual que un periodo de un día); el exceso de tiempo lo marca el plan.
 */
function topeDe(
  params: {
    fechaInicio?: Date | string | null;
    fechaMaxima?: Date | string | null;
    fechaEntregaEsperada?: Date | string | null;
  },
  periodo: Periodo | null,
): Date | null {
  if (periodo) return finDelPeriodo(periodo.fin);
  const fechas = [aFecha(params.fechaMaxima), aFecha(params.fechaEntregaEsperada)].filter(
    (d): d is Date => d != null,
  );
  if (!fechas.length) return null;
  const tope = new Date(Math.min(...fechas.map((d) => d.getTime())));
  const inicio = aFecha(params.fechaInicio);
  if (inicio && tope.getTime() <= inicio.getTime()) return workDayEnd(inicio);
  return tope;
}

function estatusArrancado(estatus?: string | null): boolean {
  return /proceso|validar/i.test(estatus ?? '');
}

function esEstatusCerrado(estatus?: string | null): boolean {
  return /finalizada|completada|cancelada|aprobada/i.test(estatus ?? '');
}

function aFecha(valor?: Date | string | null): Date | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

function minutosEntre(desde: Date, hasta: Date): number {
  return Math.max(0, Math.round((hasta.getTime() - desde.getTime()) / 60_000));
}
