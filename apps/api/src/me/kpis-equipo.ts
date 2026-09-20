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
 * - Horas productivas = unión de los tramos de actividad (foto de entrada →
 *   foto de salida / fin) dentro de las horas laboradas. Dos actividades a la vez
 *   no cuentan doble, y lo que se hizo fuera de la jornada no es tiempo laborado.
 * - Inactividad = laboradas − productivas; nunca negativa.
 * - Retardo = misma regla que los avisos y RH: oficina 09:00, contratista 08:00,
 *   15 min de gracia; los minutos tarde se cuentan desde la hora de entrada.
 * - Tiempo extra = lo laborado por encima de 8 h en un día laborable (L–V) o todo
 *   lo laborado en un día de descanso. Sin horario (24/7, visitante) no hay extra.
 */
import { horaCierreAutomatico } from '../attendance/asistencia-confiable.js';
import { expectedStartHm, RETARDO_GRACE_MINUTES } from '../attendance/attendance-hybrid.match.js';
import {
  WORKDAY_TIMEZONE,
  parseWorkDate,
  workDateKey,
  workDayAtClock,
  workDayEnd,
} from '../common/time/workday.js';

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
    salida: null,
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
 * jornada posterior. La excepción es un periodo de varios días: abierta, cuenta
 * hasta ahora o hasta el final de su último día, lo que llegue antes.
 */
export function tramosDeActividades(
  actividades: ActividadKpi[],
  ahora: Date,
  tz: string = WORKDAY_TIMEZONE,
): TramoActividad[] {
  const out: TramoActividad[] = [];
  for (const a of actividades) {
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
  /** Lo que el jefe ya decidió sobre el tiempo extra, por día. */
  aprobacionesExtra?: AprobacionExtra[];
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

export function calculaKpisPersona(e: EntradaKpiPersona): { dias: DiaKpi[]; totales: TotalesKpi } {
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

  const dias: DiaKpi[] = [];
  const hastaEfectivo = e.hasta < hoy ? e.hasta : hoy;
  for (const fecha of diasDelRango(e.desde, hastaEfectivo)) {
    const delDia = (porDia.get(fecha) ?? []).sort((a, b) => a.entrada.getTime() - b.entrada.getTime());
    const laborable = e.horario.diasLaborables.includes(diaDeLaSemana(fecha));

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
      // En el detalle también sale «hoy, aún sin entrada»; un sábado vacío no dice nada.
      const incluir = sinChecada || faltaJustificada || fuera > 0 || (e.detalle && laborable && fecha === hoy);
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
    const r = laborable ? retardoDeEntrada(primera.entrada, e.horario, tz) : { retardo: false, minutosTarde: 0 };
    const minutosExtra =
      e.horario.jornadaOrdinariaMin == null
        ? null
        : laborable
          ? Math.max(0, minutosLaborados - e.horario.jornadaOrdinariaMin)
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
  return { dias, totales: sumaTotales(dias, enRango, e.horario) };
}

function sumaTotales(dias: DiaKpi[], jornadas: JornadaKpi[], horario: HorarioKpi): TotalesKpi {
  const conJornada = dias.filter((d) => d.conJornada);
  // Uniforme: cada entrada es una revisión posible (normalmente una por día).
  const ok = jornadas.filter((j) => j.uniformeOk === true).length;
  const noOk = jornadas.filter((j) => j.uniformeOk === false).length;
  const minutosLaborados = conJornada.reduce((s, d) => s + d.minutosLaborados, 0);
  const minutosProductivos = conJornada.reduce((s, d) => s + d.minutosProductivos, 0);
  // Un día sin decisión, o rechazado, no aporta minutos pagables. Pendiente es solo lo
  // que nadie ha mirado: lo rechazado ya se miró y la respuesta fue que no.
  const pendientes = conJornada.filter((d) => (d.minutosExtra ?? 0) > 0 && d.extraEstado == null);
  return {
    diasConJornada: conJornada.length,
    diasSinChecada: dias.filter((d) => d.sinChecada).length,
    faltasJustificadas: dias.filter((d) => d.faltaJustificada).length,
    retardos: conJornada.filter((d) => d.retardo).length,
    minutosTarde: conJornada.reduce((s, d) => s + d.minutosTarde, 0),
    uniforme: {
      revisadas: ok + noOk,
      ok,
      noOk,
      sinRevisar: jornadas.length - ok - noOk,
      pct: pct(ok, ok + noOk),
    },
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
  return {
    diasConJornada: s((t) => t.diasConJornada),
    diasSinChecada: s((t) => t.diasSinChecada),
    faltasJustificadas: s((t) => t.faltasJustificadas),
    retardos: s((t) => t.retardos),
    minutosTarde: s((t) => t.minutosTarde),
    uniforme: {
      revisadas: ok + noOk,
      ok,
      noOk,
      sinRevisar: s((t) => t.uniforme.sinRevisar),
      pct: pct(ok, ok + noOk),
    },
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
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Semáforo
// ─────────────────────────────────────────────────────────────────────────────

export type SemaforoKpi = 'verde' | 'amarillo' | 'rojo' | 'sin_datos';

/** Umbrales del semáforo. Un solo lugar para moverlos si el dueño pide otros. */
export const UMBRALES_KPI = {
  /** % productividad: ≥ 70 verde, ≥ 50 amarillo, menos rojo. */
  productividadVerde: 70,
  productividadAmarillo: 50,
  /** % uniforme ✓ de lo revisado: ≥ 95 verde, ≥ 80 amarillo, menos rojo. */
  uniformeVerde: 95,
  uniformeAmarillo: 80,
  /** Retardos en el rango: 1–2 amarillo, 3 o más rojo. */
  retardosAmarillo: 1,
  retardosRojo: 3,
  /** Días laborables sin checada: 1 amarillo, 2 o más rojo. */
  faltasAmarillo: 1,
  faltasRojo: 2,
} as const;

const PESO: Record<SemaforoKpi, number> = { sin_datos: 0, verde: 1, amarillo: 2, rojo: 3 };

/**
 * El peor de sus indicadores, con el motivo escrito para que el jefe sepa qué mirar.
 * Sin horas laboradas ni faltas no hay con qué calificar: `sin_datos`.
 */
export function semaforoKpi(t: TotalesKpi): { semaforo: SemaforoKpi; motivos: string[] } {
  const u = UMBRALES_KPI;
  let peor: SemaforoKpi = 'sin_datos';
  const motivos: { nivel: SemaforoKpi; texto: string }[] = [];
  const marca = (nivel: SemaforoKpi, texto?: string) => {
    if (PESO[nivel] > PESO[peor]) peor = nivel;
    if (texto && nivel !== 'verde') motivos.push({ nivel, texto });
  };

  if (t.productividadPct != null) {
    const p = t.productividadPct;
    marca(
      p >= u.productividadVerde ? 'verde' : p >= u.productividadAmarillo ? 'amarillo' : 'rojo',
      `Productividad ${p} %`,
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
  if (t.diasSinChecada > 0) {
    const f = t.diasSinChecada;
    marca(
      f >= u.faltasRojo ? 'rojo' : f >= u.faltasAmarillo ? 'amarillo' : 'verde',
      `${f} día${f === 1 ? '' : 's'} sin checada`,
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
  return [
    'Jornada: de la entrada a la salida. Si hoy no hay salida, cuenta hasta ahora; en un día pasado sin salida se cierra como el cierre automático (entrada + 9 h, a más tardar 23:30).',
    'La jornada es del día de la entrada, aunque la salida caiga después de medianoche.',
    `Horas laboradas: jornada menos la comida registrada; comida sin regreso = ${MINUTOS_COMIDA_POR_OMISION} min.`,
    'Horas productivas: tiempo en actividades («Iniciar» o foto de entrada → foto de salida o fin) dentro de las horas laboradas. Dos actividades a la vez no cuentan doble y lo hecho fuera de la jornada no suma.',
    'Una actividad abierta cuenta hasta ahora solo si empezó hoy; si empezó otro día se corta al final de ese día. Las de un periodo de varios días cuentan en cada jornada de su periodo, hasta su último día.',
    'Inactividad: horas laboradas menos horas productivas.',
    `Retardo: entrada después de su hora (oficina 09:00, contratista 08:00) más ${RETARDO_GRACE_MINUTES} min de gracia, de lunes a viernes. Los minutos tarde se cuentan desde su hora de entrada. Dirección (24/7) no tiene retardos. A quien se le haya escrito un horario propio, se le mide con ese.`,
    `Tiempo extra: lo laborado arriba de ${JORNADA_ORDINARIA_MIN / 60} h en día laborable, o todo lo laborado en sábado o domingo. Sin horario no se calcula.`,
    'El tiempo extra calculado no se paga solo: un jefe lo aprueba día por día, y a la pre-nómina solo llega lo aprobado.',
    'Uniforme: el jefe marca ✓ o ✗ en la entrada de cada persona (Asistencias). El % es sobre las entradas revisadas.',
    `Semáforo: el peor de productividad (verde ≥ ${u.productividadVerde} %, amarillo ≥ ${u.productividadAmarillo} %), retardos (amarillo desde ${u.retardosAmarillo}, rojo desde ${u.retardosRojo}), uniforme (verde ≥ ${u.uniformeVerde} %, amarillo ≥ ${u.uniformeAmarillo} %) y días sin checada (amarillo ${u.faltasAmarillo}, rojo desde ${u.faltasRojo}).`,
  ];
}
