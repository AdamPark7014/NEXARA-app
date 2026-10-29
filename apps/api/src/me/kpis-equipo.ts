/**
 * KPI del equipo: retardos, uniforme, horas laboradas contra horas productivas,
 * inactividad y tiempo extra real.
 *
 * Lo pidió el dueño así: «Dashboard — KPI's: lectura de retardos, cumplimiento
 * con uniforme; trazabilidad de las horas laboradas vs horas productivas, tiempo
 * total de inactividad». Y en nómina: «control certero de las horas laboradas con
 * base en los registros personales, así como tiempo extra real».
 *
 * Archivo puro a propósito (nada de Prisma ni de Nest): se mezclan tres relojes
 * —checador, comida y fotos de evidencia— y cada uno tiene su trampa. Aquí se
 * prueban sin base de datos.
 *
 * Reglas (las mismas que ya usaba el resto del sistema, no se inventa ninguna):
 * - Jornada = entrada → salida. Sin salida y el día es hoy: cuenta hasta ahora
 *   (jornada abierta). Sin salida en un día pasado: se cierra igual que el cierre
 *   automático, `min(entrada + 9 h, 23:30)`. La jornada es del día de su entrada,
 *   aunque la salida caiga después de medianoche.
 * - Horas laboradas = jornada menos la comida registrada. Comida sin regreso:
 *   una hora (como la pizarra).
 * - Horas productivas = unión de los tramos de actividad dentro de las horas
 *   laboradas. Dos actividades a la vez no cuentan doble, y lo que se hizo fuera de
 *   la jornada no es tiempo laborado. El tramo de una actividad son sus sesiones de
 *   trabajo (se abren al iniciar o reanudar; se cierran con la foto de salida, una
 *   pausa o la checada de salida); una actividad de antes, sin sesiones, es su
 *   intervalo foto de entrada → foto de salida. Ningún tramo pasa de 12 horas.
 * - Inactividad = laboradas − productivas; nunca negativa.
 * - Retardo = misma regla que los avisos y RH: oficina y contratista entran 10:00 (salen 18:00),
 *   15 min de gracia; los minutos tarde se cuentan desde la hora de entrada.
 * - Tiempo extra = lo laborado por encima de 8 h en un día laborable (L–V) o todo
 *   lo laborado en un día de descanso. Sin horario (24/7, visitante) no hay extra.
 * - Cumplimiento «en tiempo y forma» (07-10, Adam: «los que cumplen más en tiempo y forma son
 *   Daniela y Luis» y el ranking por productividad los dejaba abajo): entregas a tiempo contra
 *   su límite (el mismo del semáforo, medido con la hora en que la persona ENTREGÓ, no con la
 *   aprobación del jefe), entregas aprobadas a la primera, asistencia puntual y uniforme.
 *   La productividad (reloj de actividad ÷ jornada) se sigue mostrando, pero ya no califica:
 *   premiaba dejar el reloj corriendo.
 * - Y el mismo día pidió más (07-10): «que siempre estén haciendo algo y se tarden lo adecuado en
 *   las actividades… Alejandro un día hizo una sola actividad y Daniela cinco». Por eso el
 *   cumplimiento suma tiempo adecuado (lo trabajado contra su tiempo máximo), ritmo de entregas
 *   por día contra el del equipo, carga de trabajo (horas planeadas de lo entregado contra las
 *   horas trabajadas) y ocupación (tiempo con una actividad, cada una contada solo hasta su
 *   tiempo máximo, para que dejar el reloj prendido no sume).
 * - Y otra vez (07-10, tarde): «debe bajar mucho su rendimiento en un día si no lo trabajaron y no
 *   está justificado». Un día laborable no trabajado (sin checar, o checó y no hizo nada) y sin
 *   justificar multiplica el cumplimiento por días trabajados ÷ días que debía trabajar.
 */
import { horaCierreAutomatico } from '../attendance/asistencia-confiable.js';
import { expectedEndHm, expectedStartHm, RETARDO_GRACE_MINUTES } from '../attendance/attendance-hybrid.match.js';
import {
  WORKDAY_TIMEZONE,
  parseWorkDate,
  workDateKey,
  workDayAtClock,
  workDayEnd,
} from '../common/time/workday.js';
import {
  TOPE_SESION_MIN,
  finEfectivo,
  sesionVencida,
} from '../activities/sessions/sesiones-trabajo.js';

// ─────────────────────────────────────────────────────────────────────────────
// Tramos de tiempo (milisegundos). Todo el cálculo es unir, cruzar y restar.
// ─────────────────────────────────────────────────────────────────────────────

export type Tramo = { inicio: number; fin: number };

/** Ordena y funde los tramos que se tocan o se enciman. Descarta los vacíos o al revés. */
export function normalizaTramos(tramos: Tramo[]): Tramo[] {
  const validos = tramos
    .filter((t) => Number.isFinite(t.inicio) && Number.isFinite(t.fin) && t.fin > t.inicio)
    .map((t) => ({ inicio: t.inicio, fin: t.fin }))
    .sort((a, b) => a.inicio - b.inicio);
  const out: Tramo[] = [];
  for (const t of validos) {
    const ultimo = out[out.length - 1];
    if (ultimo && t.inicio <= ultimo.fin) ultimo.fin = Math.max(ultimo.fin, t.fin);
    else out.push(t);
  }
  return out;
}

/** Lo que está en `a` y también en `b`. */
export function intersectaTramos(a: Tramo[], b: Tramo[]): Tramo[] {
  const A = normalizaTramos(a);
  const B = normalizaTramos(b);
  const out: Tramo[] = [];
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    const inicio = Math.max(A[i].inicio, B[j].inicio);
    const fin = Math.min(A[i].fin, B[j].fin);
    if (fin > inicio) out.push({ inicio, fin });
    if (A[i].fin < B[j].fin) i += 1;
    else j += 1;
  }
  return out;
}

/** Lo que está en `a` y no en `b`. */
export function restaTramos(a: Tramo[], b: Tramo[]): Tramo[] {
  const A = normalizaTramos(a);
  const B = normalizaTramos(b);
  const out: Tramo[] = [];
  for (const t of A) {
    let cursor = t.inicio;
    for (const q of B) {
      if (q.fin <= cursor) continue;
      if (q.inicio >= t.fin) break;
      if (q.inicio > cursor) out.push({ inicio: cursor, fin: q.inicio });
      cursor = Math.max(cursor, q.fin);
      if (cursor >= t.fin) break;
    }
    if (cursor < t.fin) out.push({ inicio: cursor, fin: t.fin });
  }
  return out;
}

/**
 * Minutos que cubren los tramos (sin contar dos veces lo encimado).
 *
 * Se redondea una sola vez, sobre el total: redondear tramo por tramo hacía que
 * un día con muchos tramos cortos sumara minutos que no existían.
 */
export function minutosDeTramos(tramos: Tramo[]): number {
  const ms = normalizaTramos(tramos).reduce((s, t) => s + (t.fin - t.inicio), 0);
  return Math.round(ms / 60_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Horario
// ─────────────────────────────────────────────────────────────────────────────

/** Jornada ordinaria por día laborable, neta de comida (LFT: 8 h diurnas). */
export const JORNADA_ORDINARIA_MIN = 8 * 60;
/** Lunes a viernes (0 = domingo). La plantilla de oficina es L–V. */
export const DIAS_LABORABLES: readonly number[] = [1, 2, 3, 4, 5];
/** Comida sin regreso registrado: una hora, como en la pizarra. */
export const MINUTOS_COMIDA_POR_OMISION = 60;

export type HorarioKpi = {
  /** Plantilla de acceso (`office_hours`, `contractor`, `always_on`…). */
  clave: string | null;
  /** Hora de entrada esperada `HH:MM`; null = sin horario (no hay retardo ni extra). */
  entrada: string | null;
  /** Hora de salida esperada `HH:MM`. Informativa: la jornada la miden las checadas. */
  salida: string | null;
  graciaMin: number;
  /** Jornada ordinaria por día laborable, en minutos netos; null = sin horario. */
  jornadaOrdinariaMin: number | null;
  /** Días laborables (0 = domingo … 6 = sábado). */
  diasLaborables: readonly number[];
  /** Alguien le escribió un horario propio; si no, es el de su plantilla. */
  personalizado: boolean;
};

/** Horario a partir de la plantilla que ya decide retardos en avisos y RH. */
export function horarioDePlantilla(clave?: string | null): HorarioKpi {
  const entrada = expectedStartHm(clave);
  return {
    clave: clave ?? null,
    entrada,
    salida: expectedEndHm(clave),
    graciaMin: RETARDO_GRACE_MINUTES,
    jornadaOrdinariaMin: entrada ? JORNADA_ORDINARIA_MIN : null,
    diasLaborables: entrada ? DIAS_LABORABLES : [],
    personalizado: false,
  };
}

/** Lo que alguien escribió en el editor de horarios. Todo opcional. */
export type HorarioPropio = {
  horaEntrada?: string | null;
  horaSalida?: string | null;
  dias?: readonly number[] | null;
  graciaMin?: number | null;
  jornadaOrdinariaMin?: number | null;
};

/** `HH:MM` válido, o null. */
export function horaValida(valor?: string | null): string | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec((valor ?? '').trim());
  return m ? `${m[1]}:${m[2]}` : null;
}

/**
 * Horario de una persona: su plantilla, con lo que alguien le haya escrito encima.
 *
 * Cada campo se decide por separado a propósito. Cambiarle la hora de entrada a alguien no
 * debería obligar a decidir de paso su jornada ni sus días, así que lo que no se escribe
 * sigue siendo el de la plantilla. Mientras la tabla esté vacía —que es como nace— esto
 * devuelve exactamente lo mismo que `horarioDePlantilla`, y no cambia ni un cálculo.
 *
 * Un horario propio sí puede dar retardo y tiempo extra a quien su plantilla no se los
 * daba (dirección 24/7, visitante): para eso está el editor. Poner la hora de entrada es
 * justamente decir «a esta persona sí se le mide».
 */
export function horarioDePersona(clave?: string | null, propio?: HorarioPropio | null): HorarioKpi {
  const base = horarioDePlantilla(clave);
  if (!propio) return base;

  const entrada = horaValida(propio.horaEntrada) ?? base.entrada;
  const salida = horaValida(propio.horaSalida) ?? base.salida;
  const dias = (propio.dias ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const gracia =
    typeof propio.graciaMin === 'number' && Number.isFinite(propio.graciaMin) && propio.graciaMin >= 0
      ? Math.round(propio.graciaMin)
      : base.graciaMin;
  const jornada =
    typeof propio.jornadaOrdinariaMin === 'number' &&
    Number.isFinite(propio.jornadaOrdinariaMin) &&
    propio.jornadaOrdinariaMin > 0
      ? Math.round(propio.jornadaOrdinariaMin)
      : null;

  // Sin hora de entrada no hay a qué llegar tarde ni de qué pasarse: se respeta.
  const diasLaborables = entrada ? (dias.length ? [...new Set(dias)].sort() : base.diasLaborables.length ? base.diasLaborables : DIAS_LABORABLES) : [];

  return {
    clave: base.clave,
    entrada,
    salida,
    graciaMin: gracia,
    jornadaOrdinariaMin: entrada ? (jornada ?? base.jornadaOrdinariaMin ?? JORNADA_ORDINARIA_MIN) : null,
    diasLaborables,
    personalizado: true,
  };
}

/** Día de la semana de un `AAAA-MM-DD` (0 = domingo). */
export function diaDeLaSemana(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

/** `AAAA-MM-DD` más `n` días. */
export function sumaDias(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const t = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** Todos los días de `desde` a `hasta`, ambos incluidos. */
export function diasDelRango(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let d = desde; d <= hasta && out.length < 400; d = sumaDias(d, 1)) out.push(d);
  return out;
}

export type Retardo = { retardo: boolean; minutosTarde: number };

/**
 * ¿Llegó tarde? Misma regla que `isLateVsSchedule` (avisos y RH): después de la
 * hora de entrada más la gracia. Los minutos tarde se miden desde la hora de
 * entrada (llegar 09:20 son 20 min tarde, no 5).
 */
export function retardoDeEntrada(
  entrada: Date,
  horario: HorarioKpi,
  tz: string = WORKDAY_TIMEZONE,
): Retardo {
  if (!horario.entrada) return { retardo: false, minutosTarde: 0 };
  const [hh, mm] = horario.entrada.split(':').map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return { retardo: false, minutosTarde: 0 };
  const esperada = workDayAtClock(entrada, hh, mm, tz).getTime();
  const tarde = entrada.getTime() > esperada + horario.graciaMin * 60_000;
  return {
    retardo: tarde,
    minutosTarde: tarde ? Math.round((entrada.getTime() - esperada) / 60_000) : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Jornadas a partir de las checadas
// ─────────────────────────────────────────────────────────────────────────────

export type ChecadaKpi = {
  id?: number | null;
  /** 'entrada' | 'salida' */
  tipo: string;
  at: Date;
  /** Salida inventada por la tarea de las 23:30. */
  cierreAutomatico?: boolean | null;
  /** Solo entradas: ✓ / ✗ del jefe; null = sin revisar. */
  uniformeOk?: boolean | null;
};

export type JornadaKpi = {
  /** Día de la entrada, `AAAA-MM-DD`. */
  dia: string;
  entradaId: number | null;
  entrada: Date;
  /** Salida registrada (null si no hubo). */
  salida: Date | null;
  /** Hasta dónde se cuenta. */
  fin: Date;
  /** Hoy y sin salida: cuenta hasta ahora. */
  abierta: boolean;
  /** Día pasado sin salida: se cerró como el cierre automático. */
  sinSalida: boolean;
  /** La salida la puso la tarea de las 23:30. */
  cierreAutomatico: boolean;
  uniformeOk: boolean | null;
};

/**
 * Empareja entradas y salidas en orden. La jornada pertenece al día de su
 * entrada: una salida después de medianoche cierra la jornada del día anterior.
 *
 * Una salida sin entrada no mide nada y se ignora. Dos entradas seguidas: la
 * primera se cierra como si hubiera corrido el cierre automático, sin pasar de
 * la segunda.
 */
export function armaJornadas(
  checadas: ChecadaKpi[],
  ahora: Date,
  tz: string = WORKDAY_TIMEZONE,
): JornadaKpi[] {
  const orden = (tipo: string) => (tipo === 'entrada' ? 0 : 1);
  const ordenadas = checadas
    .filter((c) => c.at instanceof Date && !Number.isNaN(c.at.getTime()))
    .filter((c) => c.tipo === 'entrada' || c.tipo === 'salida')
    .sort((a, b) => a.at.getTime() - b.at.getTime() || orden(a.tipo) - orden(b.tipo));

  const out: JornadaKpi[] = [];
  let abierta: ChecadaKpi | null = null;

  const base = (e: ChecadaKpi) => ({
    dia: workDateKey(e.at, tz),
    entradaId: e.id ?? null,
    entrada: e.at,
    uniformeOk: e.uniformeOk ?? null,
  });

  for (const c of ordenadas) {
    if (c.tipo === 'entrada') {
      if (abierta) {
        const cierre = horaCierreAutomatico(abierta.at, tz);
        const fin = cierre.getTime() < c.at.getTime() ? cierre : c.at;
        out.push({ ...base(abierta), salida: null, fin, abierta: false, sinSalida: true, cierreAutomatico: false });
      }
      abierta = c;
      continue;
    }
    if (!abierta) continue;
    out.push({
      ...base(abierta),
      salida: c.at,
      fin: c.at,
      abierta: false,
      sinSalida: false,
      cierreAutomatico: Boolean(c.cierreAutomatico),
    });
    abierta = null;
  }

  if (abierta) {
    const esHoy = workDateKey(abierta.at, tz) === workDateKey(ahora, tz);
    if (esHoy) {
      const fin = ahora.getTime() > abierta.at.getTime() ? ahora : abierta.at;
      out.push({ ...base(abierta), salida: null, fin, abierta: true, sinSalida: false, cierreAutomatico: false });
    } else {
      const fin = horaCierreAutomatico(abierta.at, tz);
      out.push({ ...base(abierta), salida: null, fin, abierta: false, sinSalida: true, cierreAutomatico: false });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Actividades
// ─────────────────────────────────────────────────────────────────────────────

export type ComidaKpi = { inicio: Date; fin: Date | null };

export type ActividadKpi = {
  activityId: number;
  anNumber?: string | null;
  titulo?: string | null;
  /** Inicio real (foto de entrada / `inicioRealAt`). Sin él la actividad no suma tiempo. */
  inicio: Date | null;
  /** Fin real (foto de salida / `finRealAt` / evidencia completa / cierre). */
  fin: Date | null;
  /** Entregó o se cerró. Terminada y sin fin conocido: no se inventa su duración. */
  terminada: boolean;
  /**
   * Último día (`AAAA-MM-DD`) de un periodo de varios días (`Activity.periodoFin`). Una obra de
   * diez días que se inició el lunes y sigue abierta es trabajo de cada día hasta ese fin, no
   * solo del lunes. null = actividad de un día.
   */
  periodoFin?: string | null;
  /**
   * Sesiones de trabajo de la persona en esta actividad. Con ellas, `inicio`/`fin` ya no
   * miden nada: cada sesión es un tramo, con tope de 12 h y sin pasar de su día. Así una
   * obra de diez días cuenta lo que se trabajó cada día, no diez jornadas completas.
   */
  sesiones?: Array<{ startedAt: Date; endedAt: Date | null }> | null;
  /**
   * Hasta cuántos minutos por día cuenta esta actividad como ocupación (su tiempo máximo, o su
   * plan + 25 %). null = sin plan: cuenta hasta `OCUPACION_TOPE_SIN_PLAN_MIN`.
   */
  topeDiarioMin?: number | null;
};

export type TramoActividad = {
  activityId: number;
  anNumber: string | null;
  titulo: string | null;
  inicio: Date;
  fin: Date;
  /** Sigue abierta: se contó hasta ahora (o hasta el fin del día en que empezó). */
  enCurso: boolean;
};

/**
 * Tramo real de cada actividad.
 *
 * Una actividad abierta cuenta hasta ahora solo si empezó hoy; si empezó otro
 * día se corta al final de ese día. Sin ese tope, un «Iniciar» o una foto de
 * entrada olvidados de hace semanas volvían «productivo» cada minuto de cada
 * jornada posterior.
 *
 * Con sesiones de trabajo (`sesiones`) cada sesión es un tramo. Sin ellas —datos de
 * antes de la regla— el intervalo nunca pasa de 12 horas, tampoco en un periodo de
 * varios días: una obra de diez días ya no vuelve productivas diez jornadas por
 * haberse iniciado el lunes; cuenta lo que se reanudó cada día.
 */
export function tramosDeActividades(
  actividades: ActividadKpi[],
  ahora: Date,
  tz: string = WORKDAY_TIMEZONE,
): TramoActividad[] {
  const out: TramoActividad[] = [];
  for (const a of actividades) {
    if (a.sesiones?.length) {
      for (const s of a.sesiones) {
        if (!(s.startedAt instanceof Date) || Number.isNaN(s.startedAt.getTime())) continue;
        let fin = finEfectivo(s, ahora, tz);
        if (fin.getTime() > ahora.getTime()) fin = ahora;
        if (fin.getTime() <= s.startedAt.getTime()) continue;
        out.push({
          activityId: a.activityId,
          anNumber: a.anNumber ?? null,
          titulo: a.titulo ?? null,
          inicio: s.startedAt,
          fin,
          enCurso: !s.endedAt && !sesionVencida(s, ahora, tz),
        });
      }
      continue;
    }
    if (!a.inicio || Number.isNaN(a.inicio.getTime())) continue;
    let fin: Date | null = a.fin && !Number.isNaN(a.fin.getTime()) ? a.fin : null;
    let enCurso = false;
    if (!fin) {
      if (a.terminada) continue;
      enCurso = true;
      const diaInicio = workDateKey(a.inicio, tz);
      const hoy = workDateKey(ahora, tz);
      const periodoFin = a.periodoFin && /^\d{4}-\d{2}-\d{2}$/.test(a.periodoFin) ? a.periodoFin : null;
      if (periodoFin && periodoFin > diaInicio) {
        const finPeriodo = workDayEnd(parseWorkDate(periodoFin, tz), tz);
        fin = finPeriodo.getTime() < ahora.getTime() ? finPeriodo : ahora;
      } else {
        fin = diaInicio === hoy ? ahora : workDayEnd(a.inicio, tz);
      }
    }
    if (fin.getTime() > ahora.getTime()) fin = ahora;
    // Ninguna actividad dura más de 12 horas. Sin sesiones (datos de antes de la regla)
    // el intervalo se corta ahí: un fin de días después ya no vuelve productivas esas jornadas.
    const tope = a.inicio.getTime() + TOPE_SESION_MIN * 60_000;
    if (fin.getTime() > tope) fin = new Date(tope);
    if (fin.getTime() <= a.inicio.getTime()) continue;
    out.push({
      activityId: a.activityId,
      anNumber: a.anNumber ?? null,
      titulo: a.titulo ?? null,
      inicio: a.inicio,
      fin,
      enCurso,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entregas: el «en tiempo y forma»
// ─────────────────────────────────────────────────────────────────────────────

/** Una actividad de la persona, vista como entrega. */
export type EntregaKpi = {
  activityId: number;
  anNumber?: string | null;
  titulo?: string | null;
  /** Hasta cuándo había que entregarla (`limiteDeEntrega`). null = sin límite: cuenta a tiempo. */
  limite: Date | null;
  /** Cuándo la entregó la persona (fin real o evidencia completa). null = no la ha entregado. */
  entregadaAt: Date | null;
  /** Primera decisión del jefe sobre su evidencia. null = nadie la ha revisado. */
  primeraRevision?: 'APROBADA' | 'DEVUELTA' | null;
  /** Cuántas veces se la devolvieron. */
  devoluciones?: number;
  /** Minutos planeados: el plan de la persona (`horasPlan`) o el tiempo estimado de la actividad. */
  minutosPlan?: number | null;
  /** Tiempo máximo de la actividad (`tiempoMaximoMin`). */
  minutosMaximo?: number | null;
  /** Minutos que de verdad trabajó en ella (sus sesiones; sin ellas, inicio → fin con tope de 12 h). */
  minutosReales?: number | null;
  /** Días de su periodo (1 si es de un día). El plan es de una jornada. */
  diasPeriodo?: number | null;
  /**
   * Tiempo estándar T<sub>e</sub> (§7.2/§8): el de la actividad si se asignó con él; si no, la mediana
   * real de su tipo (lo decide el servicio). null = no se puede medir.
   */
  minutosEstandar?: number | null;
  /** La creó quien la ejecuta: gana la mitad de su T<sub>e</sub> hasta que un superior la aprueba (§7.4.3). */
  autoasignada?: boolean;
  /** Su evidencia ya está aprobada por un superior. */
  aprobada?: boolean;
  /** Comercial sin la cotización marcada como enviada: no gana horas estándar (§7.4.10). */
  sinCotizacionEnviada?: boolean;
};

export type EstadoEntrega = 'a_tiempo' | 'tarde' | 'sin_entregar';

/** Sin tiempo máximo, «adecuado» es no pasar el plan más este margen. */
export const TOLERANCIA_PLAN = 1.25;
/** Una entrega sin plan aporta a la carga su tiempo real, hasta esto. */
export const CARGA_SIN_PLAN_MAX_MIN = 120;
/** Una actividad sin plan cuenta como ocupación hasta esto por día. */
export const OCUPACION_TOPE_SIN_PLAN_MIN = 240;
/** Metas: con esto la parte vale 100. */
/**
 * Carga de trabajo: con la mitad de sus horas en la oficina cubiertas por trabajo entregado (su
 * tiempo estimado) el multiplicador es 1; debajo baja en proporción (25 % de carga = ×0.5).
 * Adam (07-10): «prioriza mucho carga de trabajo en relación con horas que estuvieron en la
 * oficina; si es muy bajo deberían bajar mucho sus porcentajes». Los estimados suelen quedarse
 * cortos frente al tiempo real, por eso la meta es 50 % y no 100 %.
 */
export const META_CARGA_PCT = 50;
export const META_OCUPACION_PCT = 70;
/** El ritmo del equipo nunca se toma por debajo de una entrega por día. */
export const RITMO_REFERENCIA_MIN = 1;
/** Un día con jornada cuenta como trabajado con al menos esto con una actividad corriendo (o una entrega). */
export const MIN_TRABAJO_DIA_MIN = 30;
/** Hasta qué hora «hoy» todavía no se da por perdido si no llegó o no ha hecho nada (sin hora de salida). */
export const FIN_DE_JORNADA_POR_OMISION = '18:00';

/** Minutos positivos y finitos, o null. */
function minutosValidos(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}

/** El tope de tiempo de una actividad: su máximo, o su plan + 25 %. */
export function topeDeTiempo(plan?: number | null, maximo?: number | null): number | null {
  const m = minutosValidos(maximo);
  if (m != null) return m;
  const pl = minutosValidos(plan);
  return pl != null ? Math.round(pl * TOLERANCIA_PLAN) : null;
}

export type EntregaDelRango = {
  activityId: number;
  anNumber: string | null;
  titulo: string | null;
  limite: string | null;
  entregadaAt: string | null;
  estado: EstadoEntrega;
  /** Tarde: entrega − límite. Sin entregar: ahora − límite. */
  minutosTarde: number | null;
  primeraRevision: 'APROBADA' | 'DEVUELTA' | null;
  devoluciones: number;
  minutosPlan: number | null;
  /** El tope de tiempo con que se midió (máximo, o plan + 25 %). */
  minutosMaximo: number | null;
  minutosReales: number | null;
  /** 'adecuado' = no pasó su tope de tiempo; null = no se puede medir (sin plan o de varios días). */
  tiempo: 'adecuado' | 'excedido' | null;
  /** Lo que aporta a la carga: su plan (por día del periodo) o, sin plan, su tiempo real hasta 2 h. */
  minutosCarga: number;
  /** Tiempo estándar (§8). Entregada, son las «horas estándar ganadas»: cuenta el estándar, no lo que tardó. */
  minutosEstandar: number | null;
  /** Lo que de verdad gana (§7.4): su T<sub>e</sub>, la mitad si es autoasignada sin aprobar, 0 si es comercial sin enviar. */
  minutosEstandarGanados: number;
};

/** Lo que gana una entrega: T<sub>e</sub> entera, la mitad si es autoasignada sin aprobar, nada sin cotización enviada. */
export function estandarGanadoDe(e: {
  entregada: boolean;
  minutosEstandar: number | null;
  autoasignada?: boolean;
  aprobada?: boolean;
  sinCotizacionEnviada?: boolean;
}): number {
  if (!e.entregada || e.minutosEstandar == null || e.sinCotizacionEnviada) return 0;
  return e.autoasignada && !e.aprobada ? Math.round(e.minutosEstandar / 2) : e.minutosEstandar;
}

/**
 * Las entregas que se miden en el rango: lo que se entregó dentro (a tiempo o tarde) y lo que
 * venció dentro sin entregarse. Lo que vence después todavía no se califica. Lo más reciente arriba.
 */
export function entregasDelRango(
  entregas: EntregaKpi[],
  desde: string,
  hasta: string,
  ahora: Date,
  tz: string = WORKDAY_TIMEZONE,
): EntregaDelRango[] {
  const dentro = (d: Date) => {
    const k = workDateKey(d, tz);
    return k >= desde && k <= hasta;
  };
  const vistas = new Set<number>();
  const out: Array<EntregaDelRango & { orden: number }> = [];
  for (const e of entregas) {
    if (vistas.has(e.activityId)) continue;
    const entregada = e.entregadaAt && !Number.isNaN(e.entregadaAt.getTime()) ? e.entregadaAt : null;
    const limite = e.limite && !Number.isNaN(e.limite.getTime()) ? e.limite : null;
    let estado: EstadoEntrega;
    let minutosTarde: number | null = null;
    if (entregada) {
      if (!dentro(entregada)) continue;
      const tarde = limite != null && entregada.getTime() > limite.getTime();
      estado = tarde ? 'tarde' : 'a_tiempo';
      if (tarde && limite) minutosTarde = Math.round((entregada.getTime() - limite.getTime()) / 60_000);
    } else {
      if (!limite || limite.getTime() > ahora.getTime() || !dentro(limite)) continue;
      estado = 'sin_entregar';
      minutosTarde = Math.round((ahora.getTime() - limite.getTime()) / 60_000);
    }
    vistas.add(e.activityId);
    const plan = minutosValidos(e.minutosPlan);
    const diasPeriodo = Math.max(1, Math.round(e.diasPeriodo ?? 1));
    const maximo = topeDeTiempo(plan, e.minutosMaximo);
    const reales =
      typeof e.minutosReales === 'number' && Number.isFinite(e.minutosReales) && e.minutosReales >= 0
        ? Math.round(e.minutosReales)
        : null;
    // Varios días: el plan es de una jornada y el reloj corre de corrido; no se compara (igual que el semáforo).
    const tiempo =
      !entregada || diasPeriodo > 1 || maximo == null || reales == null ? null : reales <= maximo ? 'adecuado' : 'excedido';
    out.push({
      activityId: e.activityId,
      anNumber: e.anNumber ?? null,
      titulo: e.titulo ?? null,
      limite: limite ? limite.toISOString() : null,
      entregadaAt: entregada ? entregada.toISOString() : null,
      estado,
      minutosTarde,
      primeraRevision: entregada ? (e.primeraRevision ?? null) : null,
      devoluciones: entregada ? Math.max(0, e.devoluciones ?? 0) : 0,
      minutosPlan: plan,
      minutosMaximo: maximo,
      minutosReales: reales,
      tiempo,
      minutosCarga: !entregada ? 0 : plan != null ? plan * diasPeriodo : Math.min(reales ?? 0, CARGA_SIN_PLAN_MAX_MIN),
      minutosEstandar: minutosValidos(e.minutosEstandar),
      minutosEstandarGanados: estandarGanadoDe({
        entregada: entregada != null,
        minutosEstandar: minutosValidos(e.minutosEstandar),
        autoasignada: e.autoasignada,
        aprobada: e.aprobada,
        sinCotizacionEnviada: e.sinCotizacionEnviada,
      }),
      orden: (entregada ?? limite ?? ahora).getTime(),
    });
  }
  return out.sort((a, b) => b.orden - a.orden).map(({ orden: _orden, ...resto }) => resto);
}

export type EntregasKpi = {
  /** Entregadas en el rango + vencidas en el rango sin entregar. */
  medidas: number;
  aTiempo: number;
  tarde: number;
  sinEntregar: number;
  /** Con al menos una revisión del jefe. */
  revisadas: number;
  /** Su primera revisión fue «aprobada». */
  aprobadasALaPrimera: number;
  /** Revisadas que le devolvieron al menos una vez. */
  devueltas: number;
  /** Entregadas a las que se les pudo medir el tiempo dedicado (con plan o máximo, de un día). */
  conTiempo: number;
  /** De esas, las que no pasaron su tope de tiempo. */
  enTiempoAdecuado: number;
  /** Minutos de trabajo entregado (ver `minutosCarga`). */
  minutosCarga: number;
  pctATiempo: number | null;
  pctALaPrimera: number | null;
  pctTiempoAdecuado: number | null;
  /**
   * Horas estándar ganadas (§8, medición aparte: el índice no cambia hasta las decisiones de §7.4).
   * Entregadas que traían tiempo estándar, la suma de sus estándares y lo que de verdad tardaron.
   */
  conEstandar: number;
  minutosEstandarGanados: number;
  minutosRealesConEstandar: number;
  /** Estándar ÷ real con tope de 100: 100 = lo hizo en el estándar o antes. null sin dato. */
  pctEficienciaEstandar: number | null;
};

/** Lo que se suma del tiempo estándar; los que no lo traen cuentan como cero. */
type SumasEstandar = Pick<EntregasKpi, 'conEstandar' | 'minutosEstandarGanados' | 'minutosRealesConEstandar'>;

export function resumenEntregas(lista: EntregaDelRango[]): EntregasKpi {
  const revisadas = lista.filter((e) => e.primeraRevision != null);
  return armaEntregas({
    medidas: lista.length,
    aTiempo: lista.filter((e) => e.estado === 'a_tiempo').length,
    tarde: lista.filter((e) => e.estado === 'tarde').length,
    sinEntregar: lista.filter((e) => e.estado === 'sin_entregar').length,
    revisadas: revisadas.length,
    aprobadasALaPrimera: revisadas.filter((e) => e.primeraRevision === 'APROBADA').length,
    devueltas: revisadas.filter((e) => e.primeraRevision === 'DEVUELTA' || e.devoluciones > 0).length,
    conTiempo: lista.filter((e) => e.tiempo != null).length,
    enTiempoAdecuado: lista.filter((e) => e.tiempo === 'adecuado').length,
    minutosCarga: lista.reduce((acc, e) => acc + e.minutosCarga, 0),
    ...sumasEstandar(lista),
  });
}

/** Horas estándar ganadas: solo lo entregado que traía estándar. */
export function sumasEstandar(lista: EntregaDelRango[]): SumasEstandar {
  const con = lista.filter((e) => e.entregadaAt != null && e.minutosEstandar != null);
  return {
    conEstandar: con.length,
    minutosEstandarGanados: con.reduce((acc, e) => acc + e.minutosEstandarGanados, 0),
    minutosRealesConEstandar: con.reduce((acc, e) => acc + (e.minutosReales ?? e.minutosEstandar ?? 0), 0),
  };
}

function armaEntregas(
  c: Omit<EntregasKpi, 'pctATiempo' | 'pctALaPrimera' | 'pctTiempoAdecuado' | 'pctEficienciaEstandar' | keyof SumasEstandar> &
    Partial<SumasEstandar>,
): EntregasKpi {
  const conEstandar = c.conEstandar ?? 0;
  const ganados = c.minutosEstandarGanados ?? 0;
  const reales = c.minutosRealesConEstandar ?? 0;
  return {
    ...c,
    conEstandar,
    minutosEstandarGanados: ganados,
    minutosRealesConEstandar: reales,
    pctATiempo: pct(c.aTiempo, c.medidas),
    pctALaPrimera: pct(c.aprobadasALaPrimera, c.revisadas),
    pctTiempoAdecuado: pct(c.enTiempoAdecuado, c.conTiempo),
    pctEficienciaEstandar: conEstandar > 0 && reales > 0 ? Math.min(100, Math.round((ganados / reales) * 100)) : null,
  };
}

/**
 * Los días laborables que debía trabajar y cuántos trabajó. «Esperados» son los laborables ya
 * terminados (o hoy, si ya trabajó), desde su ingreso y sin los justificados (falta justificada o
 * permiso/vacaciones aprobados). Un día se pierde si no checó o si checó y no hizo nada.
 */
export type DiasDeTrabajoKpi = {
  esperados: number;
  trabajados: number;
  /** Laborables sin checar ni trabajar. */
  sinChecar: number;
  /** Laborables en que checó pero no trabajó (menos de 30 min con una actividad y sin entregas). */
  sinTrabajo: number;
  /** sinChecar + sinTrabajo. */
  sinTrabajar: number;
  pct: number | null;
};

/**
 * Actividad día por día: de los días laborables que debía trabajar, en cuántos no tocó ninguna
 * actividad y en cuántos solo una (Adam, 08-10: «ayer tal solo registró una actividad o ayer no
 * registró ninguna; quiénes casi no han sido productivos»).
 */
export type ActividadDiariaKpi = {
  esperados: number;
  sinActividad: number;
  conUna: number;
  /** Actividades distintas por día esperado, un decimal. */
  promedio: number | null;
};

/** Entregas por día trabajado, contra el ritmo de referencia del equipo. */
export type RitmoKpi = { entregadas: number; dias: number; porDia: number | null; referencia: number | null };
/** Minutos sobre las horas trabajadas. */
export type ProporcionKpi = { minutos: number; pct: number | null };

/** Un decimal, para «2.3 por día». */
const unDecimal = (n: number) => Math.round(n * 10) / 10;

/**
 * Ritmo de referencia del equipo: el de quien va en el percentil 75 (entre quienes trabajaron y
 * entregaron algo), nunca menos de una entrega por día. Contra el mejor de todos uno solo con un
 * día raro bajaría a todos; contra el promedio, la mitad del equipo ya estaría «al 100».
 */
export function referenciaDeRitmo(lista: Array<Pick<TotalesKpi, 'ritmo'>>): number | null {
  const ritmos = lista
    .map((t) => t.ritmo)
    .filter((r): r is RitmoKpi => r != null && r.dias > 0 && r.entregadas > 0)
    .map((r) => r.entregadas / r.dias)
    .sort((a, b) => a - b);
  if (!ritmos.length) return null;
  const p75 = ritmos[Math.max(0, Math.ceil(ritmos.length * 0.75) - 1)];
  return Math.max(RITMO_REFERENCIA_MIN, unDecimal(p75));
}

/** Ritmo (diagnóstico) y tasas del equipo para contraer los % de quien tiene pocas medidas. */
export function referenciasDelEquipo(lista: TotalesKpi[]): ReferenciasEquipo {
  const sum = (f: (t: TotalesKpi) => number) => lista.reduce((a, t) => a + (f(t) || 0), 0);
  const medidas = sum((t) => t.entregas?.medidas ?? 0);
  const revisadas = sum((t) => t.entregas?.revisadas ?? 0);
  return {
    ritmo: referenciaDeRitmo(lista),
    aTiempo: medidas > 0 ? sum((t) => t.entregas?.aTiempo ?? 0) / medidas : null,
    aLaPrimera: revisadas > 0 ? sum((t) => t.entregas?.aprobadasALaPrimera ?? 0) / revisadas : null,
  };
}

/** Los mismos totales, con el índice medido contra el equipo (ritmo y contracción). */
export function conReferencia(t: TotalesKpi, referencia: number | null | ReferenciasEquipo): TotalesKpi {
  const ref: ReferenciasEquipo =
    referencia != null && typeof referencia === 'object'
      ? referencia
      : { ritmo: referencia ?? null, aTiempo: null, aLaPrimera: null };
  const ritmo = t.ritmo ? { ...t.ritmo, referencia: ref.ritmo } : t.ritmo;
  const c = cumplimientoDe({ ...t, ritmo }, ref);
  return { ...t, ritmo, cumplimientoPct: c.pct, cumplimientoPartes: c.partes };
}

/** «7 h 20 min», «45 min». */
function horasTexto(min: number): string {
  const total = Math.max(0, Math.round(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export type AsistenciaPuntualKpi = {
  /** Días laborables que debía checar (con jornada, o sin checada y sin justificar). */
  esperados: number;
  /** De esos, en los que entró sin retardo. */
  puntuales: number;
  pct: number | null;
};

/**
 * Pesos del índice v2 (suman 100), aprobados por Adam el 29-10 (§7.4 de
 * `.ai/CUMPLIMIENTO-EVALUADOR-SPEC.md`): `30·Confiabilidad + 25·Calidad + 30·Rendimiento + 15·Disciplina`.
 * - entregas = Confiabilidad · forma = Calidad · estandar = Rendimiento (horas estándar ganadas) ·
 *   asistencia = Disciplina (de sus 15, 3 son del uniforme cuando se revisa lo suficiente).
 * Ritmo, ocupación, carga, tiempo adecuado y días trabajados quedan como diagnóstico (peso 0).
 */
export const PESOS_CUMPLIMIENTO = {
  entregas: 30,
  forma: 25,
  estandar: 30,
  asistencia: 15,
} as const;

/** El uniforme pesa 3 de los 15 de Disciplina solo con al menos 80 % de las entradas revisadas. */
export const PESO_UNIFORME = 3;
export const UNIFORME_MINIMO_REVISADO = 0.8;
/** Meta de Rendimiento: horas estándar ganadas ÷ horas en jornada (campo 60 %, oficina 70 %). */
export const META_RENDIMIENTO = { campo: 0.6, oficina: 0.7 } as const;
export type FamiliaRol = keyof typeof META_RENDIMIENTO;
/** Contracción hacia el promedio del equipo: `(aciertos + K·promedio) ÷ (n + K)`. */
export const CONTRACCION_K = 8;
/** Peso de la calificación calibrada dentro de Calidad (el resto, aprobadas a la primera). */
export const PESO_CALIFICACION_EN_CALIDAD = 0.4;
/** Coordinación: su Confiabilidad mezcla la de su equipo con revisar a tiempo (≤ 24 h hábiles). */
export const PESO_REVISION_EN_CONFIABILIDAD = 0.5;

export type ParteCumplimiento = {
  /** Las de peso 0 son diagnóstico: se muestran, no cuentan. */
  clave: keyof typeof PESOS_CUMPLIMIENTO | 'uniforme' | 'ritmo' | 'ocupacion' | 'tiempo' | 'carga' | 'dias';
  etiqueta: string;
  pct: number;
  peso: number;
  detalle: string;
};

/**
 * Disciplina (§7.2): puntualidad graduada × registro completo. Por día que debía checar: hasta 15 min
 * tarde 1 · 16–30 0.6 · 31–60 0.3 · más de 60 o sin checar 0. Cada 3 retardos cuentan como una falta
 * en el índice (el descuento en dinero espera al reglamento firmado: se marca, no se descuenta).
 */
export type DisciplinaKpi = {
  esperados: number;
  puntos: number;
  /** Días que llegó más de 15 min tarde. */
  retardos: number;
  faltasPorRetardos: number;
  /** Jornadas terminadas y, de ellas, con salida propia (no automática) y comida registrada. */
  jornadasRevisables: number;
  registroCompleto: number;
  pct: number | null;
};

export const ESCALA_RETARDO: ReadonlyArray<{ hasta: number; puntos: number }> = [
  { hasta: 15, puntos: 1 },
  { hasta: 30, puntos: 0.6 },
  { hasta: 60, puntos: 0.3 },
];

/** Puntos de una llegada según los minutos tarde (0 = a tiempo). */
export function puntosDeLlegada(minutosTarde: number): number {
  const m = Math.max(0, minutosTarde || 0);
  return ESCALA_RETARDO.find((e) => m <= e.hasta)?.puntos ?? 0;
}

export function disciplinaDe(
  dias: Array<
    Pick<DiaKpi, 'laborable' | 'conJornada' | 'sinChecada' | 'minutosTarde' | 'abierta' | 'salida' | 'cierreAutomatico' | 'sinSalida' | 'minutosComida'>
  >,
): DisciplinaKpi {
  const conJornada = dias.filter((d) => d.conJornada && d.laborable);
  const llegadas = conJornada.map((d) => ({ tarde: d.minutosTarde > ESCALA_RETARDO[0].hasta, puntos: puntosDeLlegada(d.minutosTarde) }));
  const esperados = conJornada.length + dias.filter((d) => d.sinChecada).length;
  const retardos = llegadas.filter((l) => l.tarde);
  const faltasPorRetardos = Math.floor(retardos.length / 3);
  // Cada 3 retardos, uno de ellos vale como falta (0): se quita el que más puntos daba.
  const quitados = retardos
    .map((l) => l.puntos)
    .sort((a, b) => b - a)
    .slice(0, faltasPorRetardos)
    .reduce((a, b) => a + b, 0);
  const puntos = Math.max(0, llegadas.reduce((a, l) => a + l.puntos, 0) - quitados);
  const revisables = dias.filter((d) => d.conJornada && !d.abierta);
  const completo = revisables.filter((d) => d.salida != null && !d.cierreAutomatico && !d.sinSalida && d.minutosComida > 0);
  const registro = revisables.length ? completo.length / revisables.length : 1;
  return {
    esperados,
    puntos: Math.round(puntos * 10) / 10,
    retardos: retardos.length,
    faltasPorRetardos,
    jornadasRevisables: revisables.length,
    registroCompleto: completo.length,
    pct: esperados > 0 ? Math.round((puntos / esperados) * registro * 100) : null,
  };
}

/** `(aciertos + K·promedio) ÷ (n + K)`: con pocas medidas el % se acerca al del equipo. Sin promedio, la razón simple. */
export function contraida(aciertos: number, n: number, promedio: number | null | undefined, k = CONTRACCION_K): number {
  if (n <= 0) return promedio ?? 0;
  if (promedio == null) return aciertos / n;
  return (aciertos + k * promedio) / (n + k);
}

/** Lo que el equipo aporta para medir a cada quien: su ritmo (diagnóstico) y sus tasas (contracción). */
export type ReferenciasEquipo = { ritmo: number | null; aTiempo: number | null; aLaPrimera: number | null };

/** Coordinación (§7.4.5): lo de su equipo y sus revisiones. Lo pone el servicio. */
export type EquipoCoordinado = {
  personas: number;
  aTiempo: number;
  medidas: number;
  minutosEstandarGanados: number;
  minutosLaborados: number;
  /** Revisiones que hizo en el rango y cuántas dentro de 24 h hábiles del envío. */
  revisiones: { total: number; enPlazo: number };
};

/** Campo u oficina por el puesto (familias del tabulador: instalador, técnico o ingeniero de campo o soporte, obra). */
export function familiaDePuesto(puesto: string | null | undefined): FamiliaRol {
  return /instalador|instalaci[oó]n|campo|t[eé]cnic|soporte|obra/i.test(puesto ?? '') ? 'campo' : 'oficina';
}

/** Meta de Rendimiento de varias personas: la de su familia, ponderada por sus horas en jornada. */
export function metaPonderada(
  lista: Array<Pick<TotalesKpi, 'minutosLaborados'> & Partial<Pick<TotalesKpi, 'familia' | 'metaRendimiento'>>>,
): number | undefined {
  let minutos = 0;
  let suma = 0;
  for (const t of lista) {
    const m = t.minutosLaborados || 0;
    if (m <= 0) continue;
    minutos += m;
    suma += m * (t.metaRendimiento ?? META_RENDIMIENTO[t.familia ?? 'oficina']);
  }
  return minutos > 0 ? Math.round((suma / minutos) * 1000) / 1000 : undefined;
}

/** Plazo de revisión de coordinación: 24 h hábiles desde que se envió la evidencia. */
export const PLAZO_REVISION_HABIL_MIN = 24 * 60;

/** Minutos entre dos instantes sin contar sábados ni domingos (hora de CDMX, UTC−6 sin horario de verano). */
export function minutosHabilesEntre(desde: Date, hasta: Date, offsetMin = -360): number {
  const fin = hasta.getTime();
  let t = desde.getTime();
  if (!(fin > t)) return 0;
  const off = offsetMin * 60_000;
  let total = 0;
  while (t < fin) {
    const local = new Date(t + off);
    const finDelDia = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1) - off;
    const hastaAqui = Math.min(fin, finDelDia);
    const dow = local.getUTCDay();
    if (dow !== 0 && dow !== 6) total += hastaAqui - t;
    t = hastaAqui;
  }
  return Math.round(total / 60_000);
}

/** Una calificación (1–5) y quién la puso. */
export type CalificacionRevision = { reviewerId: number | null; score: number };
/** Un revisor con menos calificaciones que esto no se calibra: cuenta su número tal cual. */
export const CALIBRACION_MINIMA = 3;

/** Promedio de cada revisor y el de todos, para quitarle a cada calificación lo exigente o lo generoso de quien la puso. */
export function mediasDeRevisores(revs: CalificacionRevision[]): { porRevisor: Map<number, { n: number; media: number }>; global: number | null } {
  const suma = new Map<number, { n: number; s: number }>();
  let n = 0;
  let s = 0;
  for (const r of revs) {
    if (!(r.score >= 1)) continue;
    n += 1;
    s += r.score;
    if (r.reviewerId == null) continue;
    const x = suma.get(r.reviewerId) ?? { n: 0, s: 0 };
    x.n += 1;
    x.s += r.score;
    suma.set(r.reviewerId, x);
  }
  const porRevisor = new Map([...suma].map(([id, x]) => [id, { n: x.n, media: x.s / x.n }]));
  return { porRevisor, global: n ? s / n : null };
}

/**
 * Calificación calibrada (Calidad, §7.2): cada número se mueve por la diferencia entre el promedio de
 * su revisor y el de todos (un 4 de quien casi siempre pone 5 pesa menos que un 4 de quien pone 4), y se
 * lleva a 0–100 (1 = 0, 5 = 100).
 */
export function calificacionCalibrada(
  revs: CalificacionRevision[],
  medias: ReturnType<typeof mediasDeRevisores>,
): { n: number; pct: number | null } {
  const validas = revs.filter((r) => r.score >= 1);
  if (!validas.length) return { n: 0, pct: null };
  const suma = validas.reduce((acc, r) => {
    const rev = r.reviewerId != null ? medias.porRevisor.get(r.reviewerId) : undefined;
    const ajustada = rev && rev.n >= CALIBRACION_MINIMA && medias.global != null ? r.score - rev.media + medias.global : r.score;
    return acc + Math.max(0, Math.min(1, (ajustada - 1) / 4));
  }, 0);
  return { n: validas.length, pct: Math.round((suma / validas.length) * 100) };
}

/**
 * Tiempo estándar de lo que no lo trae capturado (lo asignado antes del 29-10): la mediana real de su
 * tipo (o la de todo lo entregado, si su tipo tiene pocos casos), sin pasar lo que esa actividad duró
 * de verdad o se estimó (así cerrar muchas cortas no gana la mediana de cada una). Sin mediana, o si
 * la actividad no dice cuánto duró (sin reloj ni estimado), no hay dato: null, no 0.
 */
export function estandarDeRespaldo(mediana: number | null, minutosReales: number | null, minutosPlan: number | null): number | null {
  const tope = Math.max(minutosReales ?? 0, minutosPlan ?? 0);
  if (mediana == null || !(tope > 0)) return null;
  return Math.round(Math.min(mediana, tope));
}

/** Revisiones de un coordinador: cuántas llegaron dentro de 24 h hábiles del envío (sin envío anterior no se mide). */
export function revisionesEnPlazo(pares: Array<{ envio: Date | null; revision: Date }>): { total: number; enPlazo: number } {
  const medibles = pares.filter((p): p is { envio: Date; revision: Date } => p.envio != null && p.envio.getTime() <= p.revision.getTime());
  return {
    total: medibles.length,
    enPlazo: medibles.filter((p) => minutosHabilesEntre(p.envio, p.revision) <= PLAZO_REVISION_HABIL_MIN).length,
  };
}

/** Coordinación (§7.4.5): lo de su equipo, él incluido, y la meta ponderada por la familia de cada quien. */
export function equipoCoordinadoDe(
  miembros: TotalesKpi[],
  revisiones: { total: number; enPlazo: number },
): { equipo: EquipoCoordinado; metaRendimiento: number | undefined } {
  const s = (f: (t: TotalesKpi) => number) => miembros.reduce((acc, t) => acc + (f(t) || 0), 0);
  return {
    equipo: {
      personas: miembros.length,
      aTiempo: s((t) => t.entregas?.aTiempo ?? 0),
      medidas: s((t) => t.entregas?.medidas ?? 0),
      minutosEstandarGanados: s((t) => t.entregas?.minutosEstandarGanados ?? 0),
      minutosLaborados: s((t) => t.minutosLaborados),
      revisiones,
    },
    metaRendimiento: metaPonderada(miembros),
  };
}

/**
 * Índice de desempeño v2, 0–100 (§7.2, aprobado el 29-10): promedio ponderado de los pilares que tengan
 * dato (lo que no tiene dato no pesa).
 * - Confiabilidad (30): entregadas antes de su límite ÷ las que vencían (las no cumplidas cuentan),
 *   contraída hacia la tasa del equipo. En coordinación, mitad la de su equipo y mitad revisar a tiempo.
 * - Calidad (25): 60 % aprobadas a la primera (contraída) + 40 % su calificación calibrada por revisor.
 * - Rendimiento (30): horas estándar ganadas ÷ horas en jornada contra la meta de su familia (campo 60 %,
 *   oficina 70 %). En coordinación, las de su equipo.
 * - Disciplina (15): puntualidad graduada × registro completo; el uniforme pesa 3 si se revisó ≥ 80 %.
 * Sin ninguna entrega que medir ni días que debía trabajar es null. Quien no trabajó ninguno de los
 * días que debía queda en 0. Ritmo, ocupación, carga, tiempo adecuado y días trabajados se devuelven
 * con peso 0, como diagnóstico.
 */
export function cumplimientoDe(
  t: Pick<
    TotalesKpi,
    'entregas' | 'asistenciaPuntual' | 'uniforme' | 'minutosLaborados' | 'ritmo' | 'carga' | 'ocupacion'
  > &
    Partial<Pick<TotalesKpi, 'disciplina' | 'calificacion' | 'familia' | 'metaRendimiento' | 'equipo' | 'diasConJornada'>> & {
      diasDeTrabajo?: DiasDeTrabajoKpi;
    },
  referencia: number | null | ReferenciasEquipo = t.ritmo?.referencia ?? null,
): { pct: number | null; partes: ParteCumplimiento[] } {
  const ref: ReferenciasEquipo =
    referencia != null && typeof referencia === 'object'
      ? referencia
      : { ritmo: referencia ?? null, aTiempo: null, aLaPrimera: null };
  const w = PESOS_CUMPLIMIENTO;
  const { entregas, uniforme } = t;
  const partes: Array<ParteCumplimiento & { razon: number }> = [];
  /** `razon` entre 0 y 1. */
  const agrega = (clave: ParteCumplimiento['clave'], etiqueta: string, razon: number, peso: number, detalle: string) => {
    const r = Math.max(0, Math.min(1, razon));
    partes.push({ clave, etiqueta, razon: r, pct: Math.round(r * 100), peso, detalle });
  };
  const eq = t.equipo;

  // Confiabilidad
  if (eq && eq.medidas > 0) {
    const delEquipo = contraida(eq.aTiempo, eq.medidas, ref.aTiempo);
    const rev = eq.revisiones.total > 0 ? eq.revisiones.enPlazo / eq.revisiones.total : null;
    const razon =
      rev == null ? delEquipo : (1 - PESO_REVISION_EN_CONFIABILIDAD) * delEquipo + PESO_REVISION_EN_CONFIABILIDAD * rev;
    agrega(
      'entregas',
      'Confiabilidad de su equipo',
      razon,
      w.entregas,
      `Su equipo entregó ${eq.aTiempo} de ${eq.medidas} a tiempo${
        rev == null ? '' : ` · revisó ${eq.revisiones.enPlazo} de ${eq.revisiones.total} en 24 h hábiles`
      }`,
    );
  } else if (entregas.medidas > 0) {
    agrega(
      'entregas',
      'Entregas a tiempo',
      contraida(entregas.aTiempo, entregas.medidas, ref.aTiempo),
      w.entregas,
      `${entregas.aTiempo} de ${entregas.medidas}${entregas.sinEntregar ? ` (${entregas.sinEntregar} sin entregar)` : ''}`,
    );
  }

  // Calidad
  if (entregas.revisadas > 0) {
    const primera = contraida(entregas.aprobadasALaPrimera, entregas.revisadas, ref.aLaPrimera);
    const cal = t.calificacion && t.calificacion.n > 0 && t.calificacion.pct != null ? t.calificacion.pct / 100 : null;
    const razon = cal == null ? primera : (1 - PESO_CALIFICACION_EN_CALIDAD) * primera + PESO_CALIFICACION_EN_CALIDAD * cal;
    agrega(
      'forma',
      'Calidad',
      razon,
      w.forma,
      `${entregas.aprobadasALaPrimera} de ${entregas.revisadas} aprobadas a la primera${
        cal == null ? '' : ` · calificación ${Math.round(cal * 100)} (${t.calificacion!.n})`
      }`,
    );
  }

  // Rendimiento: horas estándar ganadas contra las horas en jornada.
  const familia: FamiliaRol = t.familia ?? 'oficina';
  const meta = t.metaRendimiento ?? META_RENDIMIENTO[familia];
  const ganados = eq ? eq.minutosEstandarGanados : (entregas.minutosEstandarGanados ?? 0);
  const disponibles = eq ? eq.minutosLaborados : (t.minutosLaborados ?? 0);
  // Entregó pero nada trae tiempo estándar (ni de respaldo): no hay dato, no pesa. Sin entregas, sí es 0.
  const sinDatoDeEstandar = !eq && entregas.aTiempo + entregas.tarde > 0 && (entregas.conEstandar ?? 0) === 0;
  if (disponibles > 0 && !sinDatoDeEstandar) {
    agrega(
      'estandar',
      eq ? 'Rendimiento de su equipo' : 'Horas estándar ganadas',
      ganados / disponibles / meta,
      w.estandar,
      `${horasTexto(ganados)} estándar de ${horasTexto(disponibles)} en jornada (${Math.round(
        (ganados / disponibles) * 100,
      )} %; meta ${Math.round(meta * 100)} %${t.metaRendimiento == null ? ` en ${familia}` : ''})`,
    );
  }

  // Disciplina
  const disc = t.disciplina;
  const revisadoSuficiente =
    uniforme.revisadas > 0 &&
    uniforme.revisadas >= UNIFORME_MINIMO_REVISADO * Math.max(1, t.diasConJornada ?? uniforme.revisadas);
  const pesoAsistencia = revisadoSuficiente ? w.asistencia - PESO_UNIFORME : w.asistencia;
  if (disc && disc.esperados > 0 && disc.pct != null) {
    agrega(
      'asistencia',
      'Puntualidad y registro',
      disc.pct / 100,
      pesoAsistencia,
      `${disc.puntos} de ${disc.esperados} días en puntos${disc.retardos ? ` · ${disc.retardos} retardos` : ''}${
        disc.faltasPorRetardos
          ? ` = ${disc.faltasPorRetardos} falta${disc.faltasPorRetardos === 1 ? '' : 's'} (no se descuenta sola)`
          : ''
      } · registro completo ${disc.registroCompleto} de ${disc.jornadasRevisables}`,
    );
  } else if (t.asistenciaPuntual.esperados > 0) {
    // Sin el detalle de días (la fila del equipo o llamadas viejas): la asistencia puntual de siempre.
    const a = t.asistenciaPuntual;
    agrega('asistencia', 'Asistencia puntual', a.puntuales / a.esperados, pesoAsistencia, `${a.puntuales} de ${a.esperados} días`);
  }
  if (revisadoSuficiente) {
    agrega('uniforme', 'Uniforme', uniforme.ok / uniforme.revisadas, PESO_UNIFORME, `${uniforme.ok} de ${uniforme.revisadas}`);
  }

  // Diagnóstico (peso 0): lo que antes pesaba.
  const laborados = t.minutosLaborados ?? 0;
  if (entregas.conTiempo) {
    agrega(
      'tiempo',
      'Tiempo adecuado',
      (entregas.enTiempoAdecuado ?? 0) / entregas.conTiempo,
      0,
      `${entregas.enTiempoAdecuado ?? 0} de ${entregas.conTiempo} sin pasar su tiempo máximo · diagnóstico`,
    );
  }
  const ritmo = t.ritmo;
  if (ritmo && ritmo.dias > 0 && ref.ritmo != null && ref.ritmo > 0) {
    const porDia = ritmo.entregadas / ritmo.dias;
    agrega('ritmo', 'Ritmo de entregas', porDia / ref.ritmo, 0, `${unDecimal(porDia)} por día · el equipo va a ${ref.ritmo} · diagnóstico`);
  }
  if (laborados > 0 && t.ocupacion) {
    agrega(
      'ocupacion',
      'Siempre con algo',
      t.ocupacion.minutos / laborados / (META_OCUPACION_PCT / 100),
      0,
      `${horasTexto(t.ocupacion.minutos)} con una actividad de ${horasTexto(laborados)} · diagnóstico`,
    );
  }
  if (laborados > 0 && t.carga) {
    agrega(
      'carga',
      'Carga de trabajo',
      (t.carga.minutos / laborados) * (100 / META_CARGA_PCT),
      0,
      `${horasTexto(t.carga.minutos)} de trabajo entregado en ${horasTexto(laborados)} · diagnóstico`,
    );
  }
  const dias = t.diasDeTrabajo;
  const esperados = dias?.esperados ?? 0;
  if (dias && esperados > 0) {
    agrega('dias', 'Días trabajados', dias.trabajados / esperados, 0, `${dias.trabajados} de ${esperados} · diagnóstico`);
  }

  const conPeso = partes.filter((p) => p.peso > 0);
  const pesoTotal = conPeso.reduce((acc, p) => acc + p.peso, 0);
  const base = pesoTotal > 0 ? conPeso.reduce((acc, p) => acc + p.razon * p.peso, 0) / pesoTotal : null;
  let valor: number | null;
  if (dias && esperados > 0 && dias.trabajados === 0) valor = 0;
  else if (base != null && (entregas.medidas > 0 || esperados > 0)) valor = Math.round(base * 100);
  else valor = null;
  return { pct: valor, partes: partes.map(({ razon: _razon, ...p }) => p) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cálculo por persona
// ─────────────────────────────────────────────────────────────────────────────

export type TramoIso = { inicio: string; fin: string };

export type ActividadDelDia = {
  activityId: number;
  anNumber: string | null;
  titulo: string | null;
  inicio: string;
  fin: string;
  enCurso: boolean;
  /** Minutos de esta actividad que cayeron dentro de las horas laboradas. */
  minutosEnJornada: number;
};

export type DiaKpi = {
  fecha: string;
  /** Día laborable según su horario (L–V). */
  laborable: boolean;
  /** Tuvo al menos una entrada ese día. */
  conJornada: boolean;
  /** Laborable, ya pasó y no checó (ni la justificaron). */
  sinChecada: boolean;
  faltaJustificada: boolean;
  entrada: string | null;
  salida: string | null;
  abierta: boolean;
  sinSalida: boolean;
  cierreAutomatico: boolean;
  checadaEntradaId: number | null;
  retardo: boolean;
  minutosTarde: number;
  uniformeOk: boolean | null;
  minutosComida: number;
  minutosLaborados: number;
  minutosProductivos: number;
  minutosInactivos: number;
  productividadPct: number | null;
  /** Tiempo con una actividad, cada una contada solo hasta su tiempo máximo del día. */
  minutosOcupados: number;
  /** Trabajó: 30 min o más con una actividad corriendo, o entregó algo ese día. */
  trabajado: boolean;
  /** Laborable ya terminado en que checó pero no trabajó, sin justificar. */
  sinTrabajo: boolean;
  /** Laborable ya terminado que se perdió (sin checar o sin trabajo), sin justificar: baja el cumplimiento. */
  noTrabajado: boolean;
  /** Actividades distintas que tocó ese día: con su reloj corriendo o entregadas ese día. */
  actividadesDelDia: number;
  /** De esas, las que entregó ese día. */
  entregasDelDia: number;
  minutosExtra: number | null;
  /**
   * Qué decidió el jefe sobre el tiempo extra de ese día. null = nadie lo ha visto.
   * A nómina solo llegan los APROBADO (`minutosExtraAprobados`).
   */
  extraEstado: EstadoExtra | null;
  /** Minutos que el jefe aprobó ese día. Pueden no coincidir con `minutosExtra`: el jefe
   * aprueba una cantidad, y una corrección posterior de la hora no la cambia sola. */
  minutosExtraAprobados: number;
  /** Nota que dejó al aprobar o rechazar. */
  extraNota: string | null;
  /** Actividades que empezaron ese día sin tocar ninguna jornada (trabajo sin checar). */
  actividadesFueraDeJornada: number;
  /** Solo en el detalle: para dibujar la línea de tiempo. */
  tramos?: {
    jornada: TramoIso[];
    comida: TramoIso[];
    productivo: TramoIso[];
    inactivo: TramoIso[];
  };
  actividades?: ActividadDelDia[];
};

export type UniformeKpi = {
  revisadas: number;
  ok: number;
  noOk: number;
  sinRevisar: number;
  /** % de las revisadas con ✓; null si nadie ha revisado ninguna. */
  pct: number | null;
};

export type TotalesKpi = {
  diasConJornada: number;
  diasSinChecada: number;
  faltasJustificadas: number;
  retardos: number;
  minutosTarde: number;
  uniforme: UniformeKpi;
  minutosLaborados: number;
  minutosProductivos: number;
  minutosInactivos: number;
  productividadPct: number | null;
  /** null = sin horario (24/7, visitante): no se puede hablar de extra. */
  minutosExtra: number | null;
  /** Lo que un jefe ya aprobó. Es lo único que nómina puede pagar. */
  minutosExtraAprobados: number;
  /** Tiempo extra calculado que nadie ha aprobado ni rechazado todavía. */
  minutosExtraPendientes: number;
  /** Días con tiempo extra esperando decisión. */
  diasExtraPendientes: number;
  jornadasAbiertas: number;
  jornadasSinSalida: number;
  cierresAutomaticos: number;
  actividadesFueraDeJornada: number;
  /** Entregas de actividades del rango: el «en tiempo y forma». */
  entregas: EntregasKpi;
  /** Días laborables en que entró a tiempo, de los que debía checar. */
  asistenciaPuntual: AsistenciaPuntualKpi;
  /** Días que debía trabajar y cuántos trabajó: multiplica el cumplimiento. */
  diasDeTrabajo: DiasDeTrabajoKpi;
  /** Cuántas actividades toca por día: los días sin ninguna y con solo una (de los que debía trabajar). */
  actividadDiaria: ActividadDiariaKpi;
  /** Entregas por día trabajado (y el ritmo del equipo, si se calculó en equipo). */
  ritmo: RitmoKpi;
  /** Trabajo entregado (plan de lo entregado) contra las horas trabajadas. */
  carga: ProporcionKpi;
  /** Tiempo con una actividad (cada una hasta su tiempo máximo) contra las horas trabajadas. */
  ocupacion: ProporcionKpi;
  /** Puntualidad graduada y registro completo (Disciplina v2). */
  disciplina?: DisciplinaKpi;
  /** Calificación de sus revisiones, calibrada por revisor (0–100). La pone el servicio. */
  calificacion?: { n: number; pct: number | null };
  /** Campo u oficina: decide la meta de Rendimiento. La pone el servicio. */
  familia?: FamiliaRol;
  /** Meta de Rendimiento ya ponderada (equipo o coordinación, con gente de campo y de oficina). */
  metaRendimiento?: number;
  /** Solo coordinadores: su equipo y sus revisiones. La pone el servicio. */
  equipo?: EquipoCoordinado;
  /** Índice de desempeño v2, 0–100; null sin nada que medir. */
  cumplimientoPct: number | null;
  cumplimientoPartes: ParteCumplimiento[];
};

/** Qué decidió el jefe sobre el tiempo extra de un día. */
export type EstadoExtra = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';

/** Una decisión de horas extra, ya leída de la base. */
export type AprobacionExtra = {
  /** `AAAA-MM-DD`. */
  fecha: string;
  minutos: number;
  estado: EstadoExtra;
  nota?: string | null;
};

/**
 * Un festivo para el desempeño: si no le toca trabajar, el día no se le exige; si trabaja con
 * horario propio, retardo y tiempo extra se miden contra ese horario.
 */
export type FestivoKpi = { nombre: string; trabaja: boolean; entrada: string | null; salida: string | null };

/** El horario contra el que se mide un día: el suyo, o el propio del festivo. */
export function horarioDelDia(horario: HorarioKpi, festivo: FestivoKpi | null | undefined): HorarioKpi {
  if (!festivo?.trabaja || !festivo.entrada || !festivo.salida) return horario;
  const [he, me] = festivo.entrada.split(':').map(Number);
  const [hs, ms] = festivo.salida.split(':').map(Number);
  const jornada = hs * 60 + ms - (he * 60 + me);
  return { ...horario, entrada: festivo.entrada, salida: festivo.salida, jornadaOrdinariaMin: jornada > 0 ? jornada : horario.jornadaOrdinariaMin };
}

/**
 * ¿Se le exige ese día? Un festivo que no le toca no; uno con horario propio sí aunque no sea su
 * día de siempre; uno con la jornada completa, si lo era. Sin horario (24/7) nunca.
 */
export function esLaborable(horario: HorarioKpi, fecha: string, festivo: FestivoKpi | null | undefined): boolean {
  const deSiempre = horario.diasLaborables.includes(diaDeLaSemana(fecha));
  if (!festivo) return deSiempre;
  if (!festivo.trabaja || !horario.entrada) return false;
  return festivo.entrada != null || deSiempre;
}

export type EntradaKpiPersona = {
  /** Rango en `AAAA-MM-DD`, ambos incluidos. */
  desde: string;
  hasta: string;
  ahora: Date;
  horario: HorarioKpi;
  checadas: ChecadaKpi[];
  comidas: ComidaKpi[];
  actividades: ActividadKpi[];
  /** Días (`AAAA-MM-DD`) con falta justificada. */
  justificadas?: string[];
  /** Festivos del rango y cómo le tocan (`festivos/festivos-reglas.ts`), por día. */
  festivos?: Record<string, FestivoKpi>;
  /** Lo que el jefe ya decidió sobre el tiempo extra, por día. */
  aprobacionesExtra?: AprobacionExtra[];
  /** Sus actividades vistas como entregas (límite, cuándo entregó, revisión). */
  entregas?: EntregaKpi[];
  /** Antes de su ingreso no hay faltas. */
  fechaIngreso?: Date | null;
  /** Incluir tramos y actividades por día (detalle de una persona). */
  detalle?: boolean;
  tz?: string;
};

export function pct(numerador: number, denominador: number): number | null {
  if (!denominador || denominador <= 0) return null;
  return Math.round((numerador / denominador) * 100);
}

const aIso = (tramos: Tramo[]): TramoIso[] =>
  normalizaTramos(tramos).map((t) => ({
    inicio: new Date(t.inicio).toISOString(),
    fin: new Date(t.fin).toISOString(),
  }));

export function calculaKpisPersona(e: EntradaKpiPersona): {
  dias: DiaKpi[];
  totales: TotalesKpi;
  /** Entregas medidas en el rango, lo más reciente arriba. */
  entregas: EntregaDelRango[];
} {
  const tz = e.tz ?? WORKDAY_TIMEZONE;
  const ahoraMs = e.ahora.getTime();
  const hoy = workDateKey(e.ahora, tz);
  const justificadas = new Set(e.justificadas ?? []);
  const ingreso = e.fechaIngreso ? workDateKey(e.fechaIngreso, tz) : null;
  const extraPorDia = new Map((e.aprobacionesExtra ?? []).map((a) => [a.fecha, a]));

  const jornadas = armaJornadas(e.checadas, e.ahora, tz);
  const tramosJornadaTodos = jornadas.map((j) => ({ inicio: j.entrada.getTime(), fin: j.fin.getTime() }));
  const actividades = tramosDeActividades(e.actividades, e.ahora, tz);
  const tramosActividad = actividades.map((a) => ({ inicio: a.inicio.getTime(), fin: a.fin.getTime() }));
  const tramosOcupados = recortaPorTope(
    actividades,
    new Map(e.actividades.map((a) => [a.activityId, a.topeDiarioMin ?? null])),
    tz,
  );
  const comidas: Tramo[] = e.comidas
    .filter((c) => c.inicio instanceof Date && !Number.isNaN(c.inicio.getTime()))
    .map((c) => {
      const inicio = c.inicio.getTime();
      const porOmision = Math.min(inicio + MINUTOS_COMIDA_POR_OMISION * 60_000, ahoraMs);
      const fin = c.fin && !Number.isNaN(c.fin.getTime()) ? c.fin.getTime() : porOmision;
      return { inicio, fin };
    });

  const porDia = new Map<string, JornadaKpi[]>();
  for (const j of jornadas) {
    const lista = porDia.get(j.dia) ?? [];
    lista.push(j);
    porDia.set(j.dia, lista);
  }

  // Las entregas se calculan antes: un día con una entrega es un día trabajado.
  const entregas = entregasDelRango(e.entregas ?? [], e.desde, e.hasta, e.ahora, tz);
  const diasConEntrega = new Set(
    entregas.filter((x) => x.entregadaAt).map((x) => workDateKey(new Date(x.entregadaAt as string), tz)),
  );
  // Qué actividades tocó cada día: las que tuvieron su reloj corriendo ese día y las que entregó ese día.
  const entregasPorDia = new Map<string, number>();
  const actividadesPorDia = new Map<string, Set<number>>();
  const anota = (dia: string, activityId: number) => {
    const set = actividadesPorDia.get(dia) ?? new Set<number>();
    set.add(activityId);
    actividadesPorDia.set(dia, set);
  };
  for (const a of actividades) anota(workDateKey(a.inicio, tz), a.activityId);
  for (const x of entregas) {
    if (!x.entregadaAt) continue;
    const dia = workDateKey(new Date(x.entregadaAt), tz);
    entregasPorDia.set(dia, (entregasPorDia.get(dia) ?? 0) + 1);
    anota(dia, x.activityId);
  }
  // «Hoy» solo se da por perdido pasada su hora de salida: antes todavía puede llegar o ponerse a trabajar.
  const [hhFin, mmFin] = (horaValida(e.horario.salida) ?? FIN_DE_JORNADA_POR_OMISION).split(':').map(Number);
  const hoyTerminado = ahoraMs >= workDayAtClock(e.ahora, hhFin, mmFin, tz).getTime();
  const terminado = (fecha: string) => fecha < hoy || (fecha === hoy && hoyTerminado);

  const dias: DiaKpi[] = [];
  const hastaEfectivo = e.hasta < hoy ? e.hasta : hoy;
  for (const fecha of diasDelRango(e.desde, hastaEfectivo)) {
    const delDia = (porDia.get(fecha) ?? []).sort((a, b) => a.entrada.getTime() - b.entrada.getTime());
    const festivo = e.festivos?.[fecha] ?? null;
    const laborable = esLaborable(e.horario, fecha, festivo);
    const horarioHoy = horarioDelDia(e.horario, festivo);

    // Actividades que empezaron este día y no tocan ninguna jornada: se trabajó sin checar.
    const fuera = actividades.filter(
      (a) =>
        workDateKey(a.inicio, tz) === fecha &&
        intersectaTramos([{ inicio: a.inicio.getTime(), fin: a.fin.getTime() }], tramosJornadaTodos).length === 0,
    ).length;

    if (!delDia.length) {
      const antesDeIngresar = ingreso != null && fecha < ingreso;
      // Hoy todavía puede llegar: no es falta hasta que el día termina.
      const pasado = fecha < hoy;
      const faltaJustificada = justificadas.has(fecha);
      const sinChecada = laborable && pasado && !antesDeIngresar && !faltaJustificada;
      // Sin checar pero con trabajo (actividades sin entrada, o una entrega): trabajó, aunque no checó.
      const trabajado = fuera > 0 || diasConEntrega.has(fecha);
      const noTrabajado = laborable && terminado(fecha) && !antesDeIngresar && !faltaJustificada && !trabajado;
      // En el detalle también sale «hoy, aún sin entrada»; un sábado vacío no dice nada.
      const incluir =
        sinChecada || noTrabajado || faltaJustificada || fuera > 0 || trabajado || (e.detalle && laborable && fecha === hoy);
      if (!incluir) continue;
      dias.push({
        fecha,
        laborable,
        conJornada: false,
        sinChecada,
        faltaJustificada,
        entrada: null,
        salida: null,
        abierta: false,
        sinSalida: false,
        cierreAutomatico: false,
        checadaEntradaId: null,
        retardo: false,
        minutosTarde: 0,
        uniformeOk: null,
        minutosComida: 0,
        minutosLaborados: 0,
        minutosProductivos: 0,
        minutosInactivos: 0,
        productividadPct: null,
        minutosOcupados: 0,
        trabajado,
        sinTrabajo: false,
        noTrabajado,
        actividadesDelDia: actividadesPorDia.get(fecha)?.size ?? 0,
        entregasDelDia: entregasPorDia.get(fecha) ?? 0,
        minutosExtra: null,
        extraEstado: null,
        minutosExtraAprobados: 0,
        extraNota: null,
        actividadesFueraDeJornada: fuera,
        ...(e.detalle ? { tramos: { jornada: [], comida: [], productivo: [], inactivo: [] }, actividades: [] } : {}),
      });
      continue;
    }

    const primera = delDia[0];
    const ultima = delDia[delDia.length - 1];
    const jornadaTramos = delDia.map((j) => ({ inicio: j.entrada.getTime(), fin: j.fin.getTime() }));
    const comidaTramos = intersectaTramos(comidas, jornadaTramos);
    const laborables = restaTramos(jornadaTramos, comidaTramos);
    const productivos = intersectaTramos(tramosActividad, laborables);
    const inactivos = restaTramos(laborables, productivos);

    const minutosLaborados = minutosDeTramos(laborables);
    const minutosProductivos = Math.min(minutosDeTramos(productivos), minutosLaborados);
    const minutosInactivos = Math.max(0, minutosLaborados - minutosProductivos);
    const minutosOcupados = Math.min(minutosDeTramos(intersectaTramos(tramosOcupados, laborables)), minutosLaborados);
    const trabajado = minutosProductivos >= MIN_TRABAJO_DIA_MIN || diasConEntrega.has(fecha);
    const sinTrabajo = laborable && !trabajado && terminado(fecha) && !justificadas.has(fecha);
    const r = laborable ? retardoDeEntrada(primera.entrada, horarioHoy, tz) : { retardo: false, minutosTarde: 0 };
    const minutosExtra =
      horarioHoy.jornadaOrdinariaMin == null
        ? null
        : laborable
          ? Math.max(0, minutosLaborados - horarioHoy.jornadaOrdinariaMin)
          : minutosLaborados;

    // Solo se paga lo que un jefe aprobó. Sin fila, el extra está pendiente de mirar.
    const decision = extraPorDia.get(fecha) ?? null;

    const dia: DiaKpi = {
      fecha,
      laborable,
      conJornada: true,
      sinChecada: false,
      faltaJustificada: false,
      entrada: primera.entrada.toISOString(),
      salida: ultima.salida ? ultima.salida.toISOString() : null,
      abierta: delDia.some((j) => j.abierta),
      sinSalida: delDia.some((j) => j.sinSalida),
      cierreAutomatico: delDia.some((j) => j.cierreAutomatico),
      checadaEntradaId: primera.entradaId,
      retardo: r.retardo,
      minutosTarde: r.minutosTarde,
      uniformeOk: primera.uniformeOk,
      minutosComida: minutosDeTramos(comidaTramos),
      minutosLaborados,
      minutosProductivos,
      minutosInactivos,
      productividadPct: pct(minutosProductivos, minutosLaborados),
      minutosOcupados,
      trabajado,
      sinTrabajo,
      noTrabajado: sinTrabajo,
      actividadesDelDia: actividadesPorDia.get(fecha)?.size ?? 0,
      entregasDelDia: entregasPorDia.get(fecha) ?? 0,
      minutosExtra,
      extraEstado: decision?.estado ?? null,
      minutosExtraAprobados: decision?.estado === 'APROBADO' ? Math.max(0, decision.minutos) : 0,
      extraNota: decision?.nota ?? null,
      actividadesFueraDeJornada: fuera,
    };

    if (e.detalle) {
      dia.tramos = {
        jornada: aIso(jornadaTramos),
        comida: aIso(comidaTramos),
        productivo: aIso(productivos),
        inactivo: aIso(inactivos),
      };
      dia.actividades = actividades
        .map((a) => {
          const dentro = intersectaTramos([{ inicio: a.inicio.getTime(), fin: a.fin.getTime() }], laborables);
          return {
            activityId: a.activityId,
            anNumber: a.anNumber,
            titulo: a.titulo,
            inicio: a.inicio.toISOString(),
            fin: a.fin.toISOString(),
            enCurso: a.enCurso,
            minutosEnJornada: minutosDeTramos(dentro),
          };
        })
        .filter((a) => a.minutosEnJornada > 0)
        .sort((a, b) => a.inicio.localeCompare(b.inicio));
    }
    dias.push(dia);
  }

  const enRango = jornadas.filter((j) => j.dia >= e.desde && j.dia <= e.hasta);
  return { dias, entregas, totales: sumaTotales(dias, enRango, e.horario, resumenEntregas(entregas)) };
}

/**
 * Los tramos de actividad, cada actividad cortada en su tope por día: lo que pase de su tiempo
 * máximo (o de 4 h si no tiene plan) no cuenta como «estar haciendo algo». Así dejar el reloj
 * prendido toda la tarde no vuelve ocupada a nadie.
 */
export function recortaPorTope(
  tramos: TramoActividad[],
  topes: Map<number, number | null>,
  tz: string = WORKDAY_TIMEZONE,
): Tramo[] {
  const grupos = new Map<string, TramoActividad[]>();
  for (const t of tramos) {
    const k = `${t.activityId}:${workDateKey(t.inicio, tz)}`;
    const lista = grupos.get(k) ?? [];
    lista.push(t);
    grupos.set(k, lista);
  }
  const out: Tramo[] = [];
  for (const lista of grupos.values()) {
    const tope = topes.get(lista[0].activityId) ?? null;
    let restante = (minutosValidos(tope) ?? OCUPACION_TOPE_SIN_PLAN_MIN) * 60_000;
    for (const t of normalizaTramos(lista.map((x) => ({ inicio: x.inicio.getTime(), fin: x.fin.getTime() })))) {
      if (restante <= 0) break;
      const fin = Math.min(t.fin, t.inicio + restante);
      out.push({ inicio: t.inicio, fin });
      restante -= fin - t.inicio;
    }
  }
  return out;
}

function sumaTotales(
  dias: DiaKpi[],
  jornadas: JornadaKpi[],
  horario: HorarioKpi,
  entregas: EntregasKpi,
): TotalesKpi {
  const conJornada = dias.filter((d) => d.conJornada);
  // Uniforme: cada entrada es una revisión posible (normalmente una por día).
  const ok = jornadas.filter((j) => j.uniformeOk === true).length;
  const noOk = jornadas.filter((j) => j.uniformeOk === false).length;
  const minutosLaborados = conJornada.reduce((s, d) => s + d.minutosLaborados, 0);
  const minutosProductivos = conJornada.reduce((s, d) => s + d.minutosProductivos, 0);
  // Un día sin decisión, o rechazado, no aporta minutos pagables. Pendiente es solo lo
  // que nadie ha mirado: lo rechazado ya se miró y la respuesta fue que no.
  const pendientes = conJornada.filter((d) => (d.minutosExtra ?? 0) > 0 && d.extraEstado == null);
  // Asistencia puntual: cada día laborable que debía checar cuenta; los sin checada, como no.
  const laborablesConJornada = conJornada.filter((d) => d.laborable);
  const esperados = laborablesConJornada.length + dias.filter((d) => d.sinChecada).length;
  const puntuales = laborablesConJornada.filter((d) => !d.retardo).length;
  const asistenciaPuntual = { esperados, puntuales, pct: pct(puntuales, esperados) };
  const uniforme: UniformeKpi = {
    revisadas: ok + noOk,
    ok,
    noOk,
    sinRevisar: jornadas.length - ok - noOk,
    pct: pct(ok, ok + noOk),
  };
  const ritmo: RitmoKpi = {
    entregadas: entregas.aTiempo + entregas.tarde,
    dias: conJornada.length,
    porDia: conJornada.length ? unDecimal((entregas.aTiempo + entregas.tarde) / conJornada.length) : null,
    referencia: null,
  };
  const carga = { minutos: entregas.minutosCarga, pct: pct(entregas.minutosCarga, minutosLaborados) };
  const minutosOcupados = conJornada.reduce((s, d) => s + d.minutosOcupados, 0);
  const ocupacion = { minutos: minutosOcupados, pct: pct(minutosOcupados, minutosLaborados) };
  const laborablesContados = dias.filter((d) => d.laborable && !d.faltaJustificada && (d.trabajado || d.noTrabajado));
  const trabajados = laborablesContados.filter((d) => d.trabajado).length;
  const sinChecar = dias.filter((d) => d.noTrabajado && !d.conJornada).length;
  const sinTrabajo = dias.filter((d) => d.sinTrabajo).length;
  const diasDeTrabajo: DiasDeTrabajoKpi = {
    esperados: laborablesContados.length,
    trabajados,
    sinChecar,
    sinTrabajo,
    sinTrabajar: sinChecar + sinTrabajo,
    pct: pct(trabajados, laborablesContados.length),
  };
  const sumaActividades = laborablesContados.reduce((s, d) => s + (d.actividadesDelDia ?? 0), 0);
  const actividadDiaria: ActividadDiariaKpi = {
    esperados: laborablesContados.length,
    sinActividad: laborablesContados.filter((d) => (d.actividadesDelDia ?? 0) === 0).length,
    conUna: laborablesContados.filter((d) => d.actividadesDelDia === 1).length,
    promedio: laborablesContados.length ? unDecimal(sumaActividades / laborablesContados.length) : null,
  };
  const disciplina = disciplinaDe(dias);
  const cumplimiento = cumplimientoDe(
    {
      entregas,
      asistenciaPuntual,
      uniforme,
      minutosLaborados,
      ritmo,
      carga,
      ocupacion,
      diasDeTrabajo,
      disciplina,
      diasConJornada: conJornada.length,
    },
    null,
  );
  return {
    diasConJornada: conJornada.length,
    diasSinChecada: dias.filter((d) => d.sinChecada).length,
    faltasJustificadas: dias.filter((d) => d.faltaJustificada).length,
    retardos: conJornada.filter((d) => d.retardo).length,
    minutosTarde: conJornada.reduce((s, d) => s + d.minutosTarde, 0),
    uniforme,
    minutosLaborados,
    minutosProductivos,
    minutosInactivos: conJornada.reduce((s, d) => s + d.minutosInactivos, 0),
    productividadPct: pct(minutosProductivos, minutosLaborados),
    minutosExtra:
      horario.jornadaOrdinariaMin == null
        ? null
        : conJornada.reduce((s, d) => s + (d.minutosExtra ?? 0), 0),
    minutosExtraAprobados: conJornada.reduce((s, d) => s + d.minutosExtraAprobados, 0),
    minutosExtraPendientes: pendientes.reduce((s, d) => s + (d.minutosExtra ?? 0), 0),
    diasExtraPendientes: pendientes.length,
    jornadasAbiertas: jornadas.filter((j) => j.abierta).length,
    jornadasSinSalida: jornadas.filter((j) => j.sinSalida).length,
    cierresAutomaticos: jornadas.filter((j) => j.cierreAutomatico).length,
    actividadesFueraDeJornada: dias.reduce((s, d) => s + d.actividadesFueraDeJornada, 0),
    entregas,
    asistenciaPuntual,
    diasDeTrabajo,
    actividadDiaria,
    ritmo,
    carga,
    ocupacion,
    disciplina,
    cumplimientoPct: cumplimiento.pct,
    cumplimientoPartes: cumplimiento.partes,
  };
}

/** Suma de varias personas (la fila «Equipo»). Porcentajes sobre los totales, no promedio de %. */
export function sumaEquipo(lista: TotalesKpi[]): TotalesKpi {
  const s = (f: (t: TotalesKpi) => number) => lista.reduce((acc, t) => acc + f(t), 0);
  const ok = s((t) => t.uniforme.ok);
  const noOk = s((t) => t.uniforme.noOk);
  const laborados = s((t) => t.minutosLaborados);
  const productivos = s((t) => t.minutosProductivos);
  const conExtra = lista.filter((t) => t.minutosExtra != null);
  // Tolera totales de antes de las entregas (pruebas o llamadas viejas): cuentan como cero.
  const ent = (f: (x: EntregasKpi) => number) => lista.reduce((acc, t) => acc + (t.entregas ? f(t.entregas) : 0), 0);
  const entregas = armaEntregas({
    medidas: ent((x) => x.medidas),
    aTiempo: ent((x) => x.aTiempo),
    tarde: ent((x) => x.tarde),
    sinEntregar: ent((x) => x.sinEntregar),
    revisadas: ent((x) => x.revisadas),
    aprobadasALaPrimera: ent((x) => x.aprobadasALaPrimera),
    devueltas: ent((x) => x.devueltas),
    conTiempo: ent((x) => x.conTiempo ?? 0),
    enTiempoAdecuado: ent((x) => x.enTiempoAdecuado ?? 0),
    minutosCarga: ent((x) => x.minutosCarga ?? 0),
    conEstandar: ent((x) => x.conEstandar ?? 0),
    minutosEstandarGanados: ent((x) => x.minutosEstandarGanados ?? 0),
    minutosRealesConEstandar: ent((x) => x.minutosRealesConEstandar ?? 0),
  });
  const esperados = s((t) => t.asistenciaPuntual?.esperados ?? 0);
  const puntuales = s((t) => t.asistenciaPuntual?.puntuales ?? 0);
  const asistenciaPuntual = { esperados, puntuales, pct: pct(puntuales, esperados) };
  const uniforme: UniformeKpi = {
    revisadas: ok + noOk,
    ok,
    noOk,
    sinRevisar: s((t) => t.uniforme.sinRevisar),
    pct: pct(ok, ok + noOk),
  };
  const entregadas = s((t) => t.ritmo?.entregadas ?? 0);
  const diasTrabajados = s((t) => t.ritmo?.dias ?? 0);
  const ritmo: RitmoKpi = {
    entregadas,
    dias: diasTrabajados,
    porDia: diasTrabajados ? unDecimal(entregadas / diasTrabajados) : null,
    referencia: null,
  };
  const carga = { minutos: entregas.minutosCarga, pct: pct(entregas.minutosCarga, laborados) };
  const ocupados = s((t) => t.ocupacion?.minutos ?? 0);
  const ocupacion = { minutos: ocupados, pct: pct(ocupados, laborados) };
  const dd = (f: (x: DiasDeTrabajoKpi) => number) => lista.reduce((acc, t) => acc + (t.diasDeTrabajo ? f(t.diasDeTrabajo) : 0), 0);
  const diasDeTrabajo: DiasDeTrabajoKpi = {
    esperados: dd((x) => x.esperados),
    trabajados: dd((x) => x.trabajados),
    sinChecar: dd((x) => x.sinChecar),
    sinTrabajo: dd((x) => x.sinTrabajo),
    sinTrabajar: dd((x) => x.sinTrabajar),
    pct: pct(dd((x) => x.trabajados), dd((x) => x.esperados)),
  };
  const ad = (f: (x: ActividadDiariaKpi) => number) =>
    lista.reduce((acc, t) => acc + (t.actividadDiaria ? f(t.actividadDiaria) : 0), 0);
  const esperadosAct = ad((x) => x.esperados);
  const actividadDiaria: ActividadDiariaKpi = {
    esperados: esperadosAct,
    sinActividad: ad((x) => x.sinActividad),
    conUna: ad((x) => x.conUna),
    promedio: esperadosAct ? unDecimal(ad((x) => (x.promedio ?? 0) * x.esperados) / esperadosAct) : null,
  };
  const di = (f: (x: DisciplinaKpi) => number) => lista.reduce((acc, t) => acc + (t.disciplina ? f(t.disciplina) : 0), 0);
  const conDisciplina = lista.some((t) => t.disciplina);
  const esperadosDisc = di((x) => x.esperados);
  const revisables = di((x) => x.jornadasRevisables);
  const disciplina: DisciplinaKpi | undefined = conDisciplina
    ? {
        esperados: esperadosDisc,
        puntos: Math.round(di((x) => x.puntos) * 10) / 10,
        retardos: di((x) => x.retardos),
        faltasPorRetardos: di((x) => x.faltasPorRetardos),
        jornadasRevisables: revisables,
        registroCompleto: di((x) => x.registroCompleto),
        pct:
          esperadosDisc > 0
            ? Math.round((di((x) => x.puntos) / esperadosDisc) * (revisables ? di((x) => x.registroCompleto) / revisables : 1) * 100)
            : null,
      }
    : undefined;
  const cumplimiento = cumplimientoDe(
    {
      entregas,
      asistenciaPuntual,
      uniforme,
      minutosLaborados: laborados,
      ritmo,
      carga,
      ocupacion,
      diasDeTrabajo,
      disciplina,
      diasConJornada: s((t) => t.diasConJornada),
      metaRendimiento: metaPonderada(lista),
    },
    null,
  );
  return {
    diasConJornada: s((t) => t.diasConJornada),
    diasSinChecada: s((t) => t.diasSinChecada),
    faltasJustificadas: s((t) => t.faltasJustificadas),
    retardos: s((t) => t.retardos),
    minutosTarde: s((t) => t.minutosTarde),
    uniforme,
    minutosLaborados: laborados,
    minutosProductivos: productivos,
    minutosInactivos: s((t) => t.minutosInactivos),
    productividadPct: pct(productivos, laborados),
    minutosExtra: conExtra.length ? conExtra.reduce((acc, t) => acc + (t.minutosExtra ?? 0), 0) : null,
    minutosExtraAprobados: s((t) => t.minutosExtraAprobados),
    minutosExtraPendientes: s((t) => t.minutosExtraPendientes),
    diasExtraPendientes: s((t) => t.diasExtraPendientes),
    jornadasAbiertas: s((t) => t.jornadasAbiertas),
    jornadasSinSalida: s((t) => t.jornadasSinSalida),
    cierresAutomaticos: s((t) => t.cierresAutomaticos),
    actividadesFueraDeJornada: s((t) => t.actividadesFueraDeJornada),
    entregas,
    asistenciaPuntual,
    diasDeTrabajo,
    actividadDiaria,
    ritmo,
    carga,
    ocupacion,
    ...(disciplina ? { disciplina } : {}),
    metaRendimiento: metaPonderada(lista),
    cumplimientoPct: cumplimiento.pct,
    cumplimientoPartes: cumplimiento.partes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Semáforo
// ─────────────────────────────────────────────────────────────────────────────

export type SemaforoKpi = 'verde' | 'amarillo' | 'rojo' | 'sin_datos';

/** Umbrales del semáforo. Un solo lugar para moverlos si el dueño pide otros. */
export const UMBRALES_KPI = {
  /** % productividad: ≥ 70 verde, ≥ 50 amarillo, menos rojo. Solo informa: ya no pinta el semáforo. */
  productividadVerde: 70,
  productividadAmarillo: 50,
  /** % entregas a tiempo: ≥ 90 verde, ≥ 75 amarillo, menos rojo. */
  entregasVerde: 90,
  entregasAmarillo: 75,
  /** % aprobadas a la primera: ≥ 90 verde, ≥ 75 amarillo, menos rojo. */
  formaVerde: 90,
  formaAmarillo: 75,
  /** % entregas sin pasar su tiempo máximo: ≥ 80 verde, ≥ 60 amarillo, menos rojo. */
  tiempoVerde: 80,
  tiempoAmarillo: 60,
  /** % uniforme ✓ de lo revisado: ≥ 95 verde, ≥ 80 amarillo, menos rojo. */
  uniformeVerde: 95,
  uniformeAmarillo: 80,
  /** Retardos en el rango: 1–2 amarillo, 3 o más rojo. */
  retardosAmarillo: 1,
  retardosRojo: 3,
  /** Días laborables sin trabajar (sin checar o sin hacer nada) y sin justificar: desde 1 es rojo. */
  faltasAmarillo: 1,
  faltasRojo: 1,
} as const;

const PESO: Record<SemaforoKpi, number> = { sin_datos: 0, verde: 1, amarillo: 2, rojo: 3 };

/**
 * El peor de sus indicadores, con el motivo escrito para que el jefe sepa qué mirar.
 * Califica el cumplimiento: entregas a tiempo, aprobadas a la primera, retardos, uniforme y días
 * sin checar. La productividad ya no: el reloj de actividad mide cuánto se usó, no si se cumplió.
 * Sin nada de eso no hay con qué calificar: `sin_datos`.
 */
export function semaforoKpi(t: TotalesKpi): { semaforo: SemaforoKpi; motivos: string[] } {
  const u = UMBRALES_KPI;
  let peor: SemaforoKpi = 'sin_datos';
  const motivos: { nivel: SemaforoKpi; texto: string }[] = [];
  const marca = (nivel: SemaforoKpi, texto?: string) => {
    if (PESO[nivel] > PESO[peor]) peor = nivel;
    if (texto && nivel !== 'verde') motivos.push({ nivel, texto });
  };

  const ent = t.entregas;
  if (ent && ent.pctATiempo != null) {
    const p = ent.pctATiempo;
    const fuera = [ent.tarde ? `${ent.tarde} tarde` : '', ent.sinEntregar ? `${ent.sinEntregar} sin entregar` : '']
      .filter(Boolean)
      .join(', ');
    marca(
      p >= u.entregasVerde ? 'verde' : p >= u.entregasAmarillo ? 'amarillo' : 'rojo',
      `${ent.aTiempo} de ${ent.medidas} entregas a tiempo${fuera ? ` (${fuera})` : ''}`,
    );
  }
  if (ent && ent.pctTiempoAdecuado != null) {
    const p = ent.pctTiempoAdecuado;
    const pasadas = ent.conTiempo - ent.enTiempoAdecuado;
    marca(
      p >= u.tiempoVerde ? 'verde' : p >= u.tiempoAmarillo ? 'amarillo' : 'rojo',
      `${pasadas} de ${ent.conTiempo} ${ent.conTiempo === 1 ? 'entrega pasó' : 'entregas pasaron'} su tiempo máximo`,
    );
  }
  if (ent && ent.pctALaPrimera != null) {
    const p = ent.pctALaPrimera;
    marca(
      p >= u.formaVerde ? 'verde' : p >= u.formaAmarillo ? 'amarillo' : 'rojo',
      `${ent.devueltas} ${ent.devueltas === 1 ? 'entrega devuelta' : 'entregas devueltas'} de ${ent.revisadas} revisadas`,
    );
  }
  if (t.diasConJornada > 0) {
    const r = t.retardos;
    marca(
      r >= u.retardosRojo ? 'rojo' : r >= u.retardosAmarillo ? 'amarillo' : 'verde',
      `${r} retardo${r === 1 ? '' : 's'} (${t.minutosTarde} min tarde)`,
    );
  }
  if (t.uniforme.pct != null) {
    const p = t.uniforme.pct;
    marca(p >= u.uniformeVerde ? 'verde' : p >= u.uniformeAmarillo ? 'amarillo' : 'rojo', `Uniforme ${p} %`);
  }
  // Días perdidos sin justificar: sin checar o checó y no hizo nada (antes solo contaba sin checar).
  const dd = t.diasDeTrabajo;
  const f = dd ? dd.sinTrabajar : t.diasSinChecada;
  if (f > 0) {
    const detalle = dd
      ? [dd.sinChecar ? `${dd.sinChecar} sin checar` : '', dd.sinTrabajo ? `${dd.sinTrabajo} sin actividad` : '']
          .filter(Boolean)
          .join(', ')
      : 'sin checada';
    marca(
      f >= u.faltasRojo ? 'rojo' : f >= u.faltasAmarillo ? 'amarillo' : 'verde',
      `${f} día${f === 1 ? '' : 's'} sin trabajar sin justificar (${detalle})`,
    );
  }

  return {
    semaforo: peor,
    motivos: motivos.sort((a, b) => PESO[b.nivel] - PESO[a.nivel]).map((m) => m.texto),
  };
}

/** Las reglas en palabras, para la sección «¿Cómo se calcula?» de la web. */
export function supuestosKpi(): string[] {
  const u = UMBRALES_KPI;
  const w = PESOS_CUMPLIMIENTO;
  return [
    `Índice de desempeño (v2, aprobado el 29-10): Confiabilidad ${w.entregas} % · Calidad ${w.forma} % · Rendimiento ${w.estandar} % · Disciplina ${w.asistencia} % (de ellos, ${PESO_UNIFORME} son del uniforme cuando se revisó al menos ${Math.round(UNIFORME_MINIMO_REVISADO * 100)} % de las entradas). Lo que no tiene dato no pesa. Quien no trabajó ninguno de los días que debía queda en 0.`,
    `Confiabilidad: entregadas antes de su límite ÷ las que vencían (las no cumplidas cuentan). Con pocas medidas se acerca a la tasa del equipo: (aciertos + ${CONTRACCION_K}·equipo) ÷ (medidas + ${CONTRACCION_K}). En coordinación cuenta la de su equipo, mitad y mitad con revisar a tiempo (24 h hábiles).`,
    `Calidad: ${Math.round((1 - PESO_CALIFICACION_EN_CALIDAD) * 100)} % aprobadas a la primera (con la misma contracción) y ${Math.round(PESO_CALIFICACION_EN_CALIDAD * 100)} % su calificación, calibrada contra el promedio de cada revisor para que un revisor exigente no castigue.`,
    `Rendimiento (horas estándar ganadas): suma del tiempo estándar de lo que entregó ÷ sus horas en jornada, contra la meta de su familia (campo ${Math.round(META_RENDIMIENTO.campo * 100)} %, oficina ${Math.round(META_RENDIMIENTO.oficina * 100)} %). Lo autoasignado gana la mitad hasta que se valida; una cotización comercial cuenta solo marcada como enviada. En coordinación cuentan las de su equipo.`,
    `Disciplina: por día que debía checar, llegar hasta ${ESCALA_RETARDO[0].hasta} min tarde vale 1, hasta ${ESCALA_RETARDO[1].hasta} min ${ESCALA_RETARDO[1].puntos}, hasta ${ESCALA_RETARDO[2].hasta} min ${ESCALA_RETARDO[2].puntos} y más tarde o sin checar 0; cada 3 retardos uno cuenta como falta (en el índice: el descuento en dinero no es automático). Se multiplica por el registro completo: salida propia (no automática) y comida registrada.`,
    'Confianza: con 20 medidas o más es alta; de 10 a 19, media; con menos de 10 el índice no se publica.',
    `Tiempo adecuado: lo que de verdad trabajó en la actividad (sus sesiones de reloj) no pasó su tiempo máximo; si no tiene máximo, su tiempo estimado + ${Math.round((TOLERANCIA_PLAN - 1) * 100)} %. Sin estimado ni máximo, o de varios días, no se mide.`,
    `Ritmo de entregas (diagnóstico, no pesa): actividades entregadas por día trabajado, contra el ritmo del equipo (el de quien va en el 75 % mejor, mínimo ${RITMO_REFERENCIA_MIN} por día).`,
    `Carga de trabajo (diagnóstico, no pesa): suma del tiempo estimado de lo que entregó (sin estimado, su tiempo real hasta ${CARGA_SIN_PLAN_MAX_MIN / 60} h) contra sus horas en la oficina; la meta de referencia es ${META_CARGA_PCT} %.`,
    `Siempre con algo (diagnóstico, no pesa): tiempo con una actividad en curso dentro de su jornada, contando cada actividad solo hasta su tiempo máximo del día (sin estimado, hasta ${OCUPACION_TOPE_SIN_PLAN_MIN / 60} h): dejar el reloj prendido no suma. Referencia: ${META_OCUPACION_PCT} % de la jornada.`,
    'Entrega a tiempo: la persona la entregó (fin real o evidencia completa) antes de su límite. Se mide con la hora en que ENTREGÓ, no con la hora en que el jefe la aprobó.',
    'Límite: el fin del último día de su periodo; si no tiene periodo, su fecha máxima. Como el formulario guarda la fecha máxima igual a la hora de inicio, una máxima que no queda después del inicio vale hasta el fin de ese día (igual que el semáforo).',
    'Sin entregar: su límite cayó en estas fechas, ya pasó y no la ha entregado. Lo que vence después todavía no se califica.',
    `Días trabajados (diagnóstico): cada día laborable que debía trabajar y no trabajó —no checó, o checó y no tuvo ni ${MIN_TRABAJO_DIA_MIN} min con una actividad ni una entrega— sin falta justificada ni permiso o vacaciones aprobados. Ya no multiplica: el día sin checar vale 0 en Disciplina y el día sin trabajo baja el Rendimiento. Si no trabajó ninguno, el índice queda en 0. Hoy cuenta hasta pasada su hora de salida (${FIN_DE_JORNADA_POR_OMISION} si no tiene).`,
    'Aprobada a la primera: la primera revisión de su evidencia fue «aprobada»; si se la devolvieron, no cuenta aunque luego se aprobara.',
    'Asistencia puntual: días laborables en que entró a tiempo, de los que debía checar (un día sin checar cuenta como no; una falta justificada no cuenta).',
    'Jornada: de la entrada a la salida. Si hoy no hay salida, cuenta hasta ahora; en un día pasado sin salida se cierra como el cierre automático (entrada + 9 h, a más tardar 23:30).',
    'La jornada es del día de la entrada, aunque la salida caiga después de medianoche.',
    `Horas laboradas: jornada menos la comida registrada; comida sin regreso = ${MINUTOS_COMIDA_POR_OMISION} min.`,
    'Tiempo en actividades (antes «productividad»): tiempo con el reloj de una actividad corriendo, dentro de las horas laboradas (entre la entrada y la salida). Dos actividades a la vez no cuentan doble y lo hecho fuera de la jornada no suma. Informa cuánto se usó el reloj; no califica.',
    `El reloj de una actividad corre por sesiones: empieza con «Iniciar», la foto de entrada o «Reanudar», y se detiene con la foto de salida, una pausa (propia o de su jefe) o la checada de salida. Ninguna sesión cuenta más de ${TOPE_SESION_MIN / 60} horas ni pasa del final de su día: una actividad de varios días se reanuda cada día.`,
    `Las actividades de antes de esta regla (sin sesiones) cuentan su intervalo de foto de entrada a foto de salida, con tope de ${TOPE_SESION_MIN / 60} horas.`,
    'Inactividad: horas laboradas menos horas productivas.',
    `Retardo: entrada después de su hora (10:00; la salida normal es a las 18:00) más ${RETARDO_GRACE_MINUTES} min de gracia, de lunes a viernes. Los minutos tarde se cuentan desde su hora de entrada. Dirección (24/7) no tiene retardos. A quien se le haya escrito un horario propio, se le mide con ese.`,
    `Tiempo extra: lo laborado arriba de ${JORNADA_ORDINARIA_MIN / 60} h en día laborable, o todo lo laborado en sábado o domingo. Sin horario no se calcula.`,
    'El tiempo extra calculado no se paga solo: un jefe lo aprueba día por día, y a la pre-nómina solo llega lo aprobado.',
    `Uniforme: el jefe marca ✓ o ✗ en la entrada de cada persona (Asistencias). El % es sobre las entradas revisadas, y pesa en el índice solo si se revisó al menos ${Math.round(UNIFORME_MINIMO_REVISADO * 100)} % de sus entradas.`,
    `Semáforo: el peor de entregas a tiempo (verde ≥ ${u.entregasVerde} %, amarillo ≥ ${u.entregasAmarillo} %), tiempo adecuado (verde ≥ ${u.tiempoVerde} %, amarillo ≥ ${u.tiempoAmarillo} %), aprobadas a la primera (verde ≥ ${u.formaVerde} %, amarillo ≥ ${u.formaAmarillo} %), retardos (amarillo desde ${u.retardosAmarillo}, rojo desde ${u.retardosRojo}), uniforme (verde ≥ ${u.uniformeVerde} %, amarillo ≥ ${u.uniformeAmarillo} %) y días sin trabajar sin justificar (rojo desde ${u.faltasRojo}).`,
  ];
}
