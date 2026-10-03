/**
 * Sugerencia de nómina: horas laboradas contra horas productivas, puestas en pesos.
 *
 * El dueño lo pidió así: «que en pagos a empleados tome horas laborales versus horas
 * productivas dentro de la hora de trabajo de entrada y salida, y con base a cuánto se le
 * paga la hora poner la hora calculada de pago, se le den sugerencias de horas productivas
 * versus horas trabajadas y se genere una sugerencia de nómina».
 *
 * Las horas no se recalculan aquí: llegan de `me/kpis-equipo.ts` (las mismas de los KPI y
 * de la pre-nómina). Laboradas = entrada → salida menos comida; productivas = sesiones de
 * actividad recortadas a esas horas laboradas. Esto solo las convierte en dinero.
 *
 * Es sugerencia y nada más: no crea pagos. Archivo puro, sin Prisma ni Nest.
 */
import { diaDeLaSemana, diasDelRango, pct, sumaDias } from '../me/kpis-equipo.js';
import { avisosDeFila, horas, type EntradaPreNomina } from './pre-nomina.js';
import { roundMoney } from './prenomina-amount.js';
import {
  periodoQueCierra,
  proximoCorte,
  type ConfigNomina,
  type FrecuenciaNomina,
  type PeriodoNomina,
} from './nomina-calendario.js';

/** Jornada semanal máxima diurna (LFT art. 61): 8 h × 6 días. Solo para quien no tiene horario. */
export const HORAS_SEMANALES_LFT = 48;
const JORNADA_LFT_MIN = 8 * 60;
const DIAS_LFT: readonly number[] = [1, 2, 3, 4, 5, 6];
/** Productivas por debajo de este % de las laboradas: se sugiere revisar antes de pagar. */
export const UMBRAL_PRODUCTIVIDAD_REVISAR = 60;
/** Christian paga quincenal; sin `payroll.schedule` en la empresa se asume eso. */
const CONFIG_POR_OMISION: ConfigNomina = { frecuencia: 'quincenal', diaSemanaCorte: 5 };

// ─────────────────────────────────────────────────────────────────────────────
// Periodo
// ─────────────────────────────────────────────────────────────────────────────

export type PeriodoSugerencia = PeriodoNomina & {
  frecuencia: FrecuenciaNomina | null;
  /** `calendario` = el de la empresa; `por_omision` = quincenal supuesto; `manual` = desde/hasta. */
  origen: 'calendario' | 'por_omision' | 'manual';
};

/** El periodo de nómina vigente (el que contiene hoy) o el anterior a ese. */
export function periodoSugerencia(
  hoy: string,
  cfg: ConfigNomina | null,
  cual: 'vigente' | 'anterior' = 'vigente',
): PeriodoSugerencia {
  const config = cfg ?? CONFIG_POR_OMISION;
  const vigente = proximoCorte(hoy, config).periodo;
  const periodo = cual === 'anterior' ? periodoQueCierra(sumaDias(vigente.desde, -1), config) : vigente;
  return { ...periodo, frecuencia: config.frecuencia, origen: cfg ? 'calendario' : 'por_omision' };
}

/** Un rango escrito a mano. */
export function periodoManual(desde: string, hasta: string): PeriodoSugerencia {
  return { desde, hasta, corte: hasta, etiqueta: `del ${desde} al ${hasta}`, frecuencia: null, origen: 'manual' };
}

/**
 * Los días que ya se pueden juzgar. Hoy no cuenta (la jornada no ha terminado) y antes del
 * ingreso no se esperaba que trabajara.
 */
export function ventanaDeCalculo(
  periodo: { desde: string; hasta: string },
  hoy: string,
  fechaIngreso?: string | null,
): { desde: string; hasta: string; dias: number; enCurso: boolean } {
  const enCurso = periodo.hasta >= hoy;
  const hasta = enCurso ? sumaDias(hoy, -1) : periodo.hasta;
  const desde = fechaIngreso && fechaIngreso > periodo.desde ? fechaIngreso : periodo.desde;
  const dias = desde <= hasta ? diasDelRango(desde, hasta).length : 0;
  return { desde, hasta, dias, enCurso };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pago por hora
// ─────────────────────────────────────────────────────────────────────────────

export type OrigenDivisor = 'horario_propio' | 'plantilla' | 'lft';

export type Divisor = {
  horasSemanales: number;
  origen: OrigenDivisor;
  /** De dónde salió, para enseñarlo en pantalla. */
  etiqueta: string;
  /** Jornada diaria y días con los que se cuentan las horas esperadas. */
  jornadaMin: number;
  dias: readonly number[];
};

/**
 * Horas semanales con las que se divide el sueldo semanal.
 *
 * Primero lo que diga su horario (jornada × días laborables): es lo que `sueldoSemanal`
 * cubre según la pre-nómina (oficina L–V, 8 h = 40 h), y un horario propio escrito en RH
 * manda sobre la plantilla. Quien no tiene horario fijo (24/7, visitante) se divide entre
 * la jornada legal diurna de 48 h.
 */
export function divisorDeHorario(h: {
  etiqueta?: string | null;
  jornadaOrdinariaMin: number | null;
  dias: readonly number[];
  personalizado: boolean;
}): Divisor {
  const dias = [...new Set(h.dias ?? [])].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (h.jornadaOrdinariaMin != null && h.jornadaOrdinariaMin > 0 && dias.length > 0) {
    const horasSemanales = horas(h.jornadaOrdinariaMin * dias.length);
    const cuenta = `${horas(h.jornadaOrdinariaMin)} h × ${dias.length} día${dias.length === 1 ? '' : 's'} = ${horasSemanales} h`;
    return {
      horasSemanales,
      origen: h.personalizado ? 'horario_propio' : 'plantilla',
      etiqueta: h.personalizado ? `Horario propio: ${cuenta}` : `${h.etiqueta || 'Plantilla'}: ${cuenta}`,
      jornadaMin: h.jornadaOrdinariaMin,
      dias,
    };
  }
  return {
    horasSemanales: HORAS_SEMANALES_LFT,
    origen: 'lft',
    etiqueta: `Sin horario fijo: ${HORAS_SEMANALES_LFT} h (jornada diurna legal, LFT art. 61)`,
    jornadaMin: JORNADA_LFT_MIN,
    dias: DIAS_LFT,
  };
}

/** Minutos que se esperaba que laborara entre `desde` y `hasta` (ambos incluidos). */
export function minutosEsperados(divisor: Divisor, desde: string, hasta: string): number {
  if (desde > hasta) return 0;
  const laborables = diasDelRango(desde, hasta).filter((d) => divisor.dias.includes(diaDeLaSemana(d))).length;
  return laborables * divisor.jornadaMin;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fila por persona
// ─────────────────────────────────────────────────────────────────────────────

export type EstadoSugerencia = 'ok' | 'revisar' | 'sin_sueldo' | 'sin_jornadas';

export type EntradaSugerencia = {
  userId: number;
  nombre: string;
  puesto?: string | null;
  numeroEmpleado?: string | null;
  horario: {
    etiqueta?: string | null;
    jornadaOrdinariaMin: number | null;
    dias: readonly number[];
    personalizado: boolean;
  };
  totales: EntradaPreNomina['totales'];
  sueldoSemanal: number | null | undefined;
  periodo: { desde: string; hasta: string };
  /** Hoy en `AAAA-MM-DD` (día de México). */
  hoy: string;
  fechaIngreso?: string | null;
};

export type FilaSugerencia = {
  userId: number;
  nombre: string;
  puesto: string | null;
  numeroEmpleado: string | null;
  horario: string;
  minutosLaborados: number;
  minutosProductivos: number;
  horasLaboradas: number;
  horasProductivas: number;
  productividadPct: number | null;
  /** Lo que su horario esperaba en los días ya transcurridos. */
  minutosEsperados: number;
  horasEsperadas: number;
  cumplimientoPct: number | null;
  sueldoSemanal: number | null;
  horasSemanales: number;
  origenDivisor: OrigenDivisor;
  divisor: string;
  pagoHora: number | null;
  pagoPorLaboradas: number | null;
  pagoPorProductivas: number | null;
  /** Sueldo de todo el periodo: sueldo semanal ÷ 7 × días del periodo. */
  sueldoPeriodo: number | null;
  montoSugerido: number | null;
  estado: EstadoSugerencia;
  sugerencia: string;
  avisos: string[];
};

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const dinero = (n: number) => MXN.format(n);

/**
 * La sugerencia de una persona.
 *
 * Monto sugerido = sueldo devengado × (horas laboradas ÷ horas esperadas), sin pasar de 1.
 * Devengado es el sueldo diario (semanal ÷ 7, el séptimo día incluido, como en la quincena)
 * por los días ya transcurridos. Quien cumplió su jornada recibe su sueldo; quien laboró
 * menos, la parte proporcional. Lo laborado de más es tiempo extra y no entra: ese solo se
 * paga si un jefe lo aprueba, y lo lleva la pre-nómina.
 */
export function filaSugerencia(e: EntradaSugerencia): FilaSugerencia {
  const t = e.totales;
  const sueldoRaw = e.sueldoSemanal == null ? null : Number(e.sueldoSemanal);
  const sueldo = sueldoRaw != null && Number.isFinite(sueldoRaw) && sueldoRaw > 0 ? sueldoRaw : null;
  const divisor = divisorDeHorario(e.horario);
  const laborados = Math.max(0, t.minutosLaborados);
  const productivos = Math.max(0, Math.min(t.minutosProductivos, laborados));

  const ventana = ventanaDeCalculo(e.periodo, e.hoy, e.fechaIngreso);
  const esperados = ventana.dias > 0 ? minutosEsperados(divisor, ventana.desde, ventana.hasta) : 0;
  const diasPeriodo = diasDelRango(e.periodo.desde, e.periodo.hasta).length;

  const pagoHora = sueldo != null ? sueldo / divisor.horasSemanales : null;
  const pagoPorLaboradas = pagoHora != null ? roundMoney((laborados / 60) * pagoHora) : null;
  const pagoPorProductivas = pagoHora != null ? roundMoney((productivos / 60) * pagoHora) : null;
  const sueldoPeriodo = sueldo != null ? roundMoney((sueldo / 7) * diasPeriodo) : null;
  const productividadPct = pct(productivos, laborados);

  let estado: EstadoSugerencia;
  let montoSugerido: number | null = null;
  let sugerencia: string;

  if (sueldo == null) {
    estado = 'sin_sueldo';
    sugerencia = 'Sin sueldo semanal capturado en RH: no se puede calcular el pago.';
  } else if (laborados <= 0) {
    estado = 'sin_jornadas';
    sugerencia =
      ventana.dias === 0
        ? 'El periodo apenas empieza: todavía no hay días completos que calcular.'
        : 'Sin jornadas registradas en el periodo: revisa su asistencia antes de pagar.';
  } else {
    if (esperados > 0) {
      const devengado = (sueldo / 7) * ventana.dias;
      montoSugerido = roundMoney(devengado * Math.min(1, laborados / esperados));
    } else {
      montoSugerido = Math.min(pagoPorLaboradas!, sueldoPeriodo!);
    }
    if (productividadPct != null && productividadPct < UMBRAL_PRODUCTIVIDAD_REVISAR) {
      estado = 'revisar';
      sugerencia = `Productivas: ${productividadPct} % de las laboradas. Revisa antes de pagar; por horas productivas serían ${dinero(pagoPorProductivas!)}.`;
    } else if (esperados > 0 && laborados < esperados) {
      estado = 'ok';
      sugerencia = `Laboró ${horas(laborados)} h de ${horas(esperados)} h esperadas: el sugerido es proporcional.`;
    } else {
      estado = 'ok';
      sugerencia =
        esperados > 0
          ? `Cumplió su jornada (${horas(laborados)} h de ${horas(esperados)} h): se sugiere su sueldo${ventana.enCurso ? ' devengado a la fecha' : ''}.`
          : ventana.dias === 0
            ? 'El periodo apenas empieza: se sugiere el pago por las horas laboradas.'
            : `Laboró ${horas(laborados)} h fuera de sus días laborables: se sugiere el pago por horas laboradas.`;
      // A media jornada las laboradas de hoy ya cuentan y las esperadas todavía no.
      if (esperados > 0 && laborados > esperados && !ventana.enCurso) {
        sugerencia += ' Lo de más es tiempo extra: se paga solo si un jefe lo aprueba.';
      }
    }
  }

  const avisos = avisosDeFila(t);
  if (t.faltasJustificadas > 0) {
    avisos.push(`${t.faltasJustificadas} falta(s) justificada(s): decide si se pagan`);
  }
  if (e.fechaIngreso && e.fechaIngreso > e.periodo.desde && e.fechaIngreso <= e.periodo.hasta) {
    avisos.push(`Ingresó el ${e.fechaIngreso}: lo esperado se cuenta desde ese día`);
  }

  return {
    userId: e.userId,
    nombre: e.nombre,
    puesto: e.puesto ?? null,
    numeroEmpleado: e.numeroEmpleado ?? null,
    horario: e.horario.etiqueta ?? '',
    minutosLaborados: laborados,
    minutosProductivos: productivos,
    horasLaboradas: horas(laborados),
    horasProductivas: horas(productivos),
    productividadPct,
    minutosEsperados: esperados,
    horasEsperadas: horas(esperados),
    cumplimientoPct: pct(laborados, esperados),
    sueldoSemanal: sueldo,
    horasSemanales: divisor.horasSemanales,
    origenDivisor: divisor.origen,
    divisor: divisor.etiqueta,
    pagoHora: pagoHora != null ? roundMoney(pagoHora) : null,
    pagoPorLaboradas,
    pagoPorProductivas,
    sueldoPeriodo,
    montoSugerido,
    estado,
    sugerencia,
    avisos,
  };
}

export type TotalesSugerencia = {
  personas: number;
  sinSueldo: number;
  sinJornadas: number;
  revisar: number;
  minutosLaborados: number;
  minutosProductivos: number;
  horasLaboradas: number;
  horasProductivas: number;
  productividadPct: number | null;
  pagoPorLaboradas: number;
  pagoPorProductivas: number;
  sueldoPeriodo: number;
  montoSugerido: number;
};

/** El pie de la tabla. Los montos nulos (sin sueldo) no suman; el % sale de los totales. */
export function totalesSugerencia(filas: FilaSugerencia[]): TotalesSugerencia {
  const s = (f: (x: FilaSugerencia) => number | null) => filas.reduce((acc, x) => acc + (f(x) ?? 0), 0);
  const laborados = s((f) => f.minutosLaborados);
  const productivos = s((f) => f.minutosProductivos);
  return {
    personas: filas.length,
    sinSueldo: filas.filter((f) => f.estado === 'sin_sueldo').length,
    sinJornadas: filas.filter((f) => f.estado === 'sin_jornadas').length,
    revisar: filas.filter((f) => f.estado === 'revisar').length,
    minutosLaborados: laborados,
    minutosProductivos: productivos,
    horasLaboradas: horas(laborados),
    horasProductivas: horas(productivos),
    productividadPct: pct(productivos, laborados),
    pagoPorLaboradas: roundMoney(s((f) => f.pagoPorLaboradas)),
    pagoPorProductivas: roundMoney(s((f) => f.pagoPorProductivas)),
    sueldoPeriodo: roundMoney(s((f) => f.sueldoPeriodo)),
    montoSugerido: roundMoney(s((f) => f.montoSugerido)),
  };
}

/** Orden de la tabla: primero lo que hay que atender, luego por nombre. */
export function ordenaSugerencias(filas: FilaSugerencia[]): FilaSugerencia[] {
  const peso: Record<EstadoSugerencia, number> = { revisar: 0, sin_jornadas: 1, sin_sueldo: 2, ok: 3 };
  return [...filas].sort((a, b) => peso[a.estado] - peso[b.estado] || a.nombre.localeCompare(b.nombre, 'es'));
}

/** Las reglas en palabras, para la nota de la pantalla. */
export function formulaSugerencia(): string[] {
  return [
    'Horas laboradas: de la entrada a la salida, menos la comida registrada (las mismas de los indicadores y la pre-nómina).',
    'Horas productivas: tiempo con una actividad en curso (sesiones de trabajo, máximo 12 h cada una) que cae dentro de las horas laboradas. Lo hecho antes de la entrada o después de la salida no cuenta, y dos actividades a la vez no cuentan doble.',
    `Pago por hora = sueldo semanal ÷ horas semanales de su horario (jornada × días laborables; oficina L–V 8 h = 40 h). Sin horario fijo: ÷ ${HORAS_SEMANALES_LFT} h, la jornada diurna legal.`,
    'Pago por laboradas = horas laboradas × pago por hora. Pago por productivas = horas productivas × pago por hora.',
    'Sueldo del periodo = sueldo semanal ÷ 7 × días del periodo (incluye el séptimo día, como la quincena).',
    'Sugerido = sueldo devengado a la fecha × (horas laboradas ÷ horas esperadas), sin pasar de su sueldo. El tiempo extra no entra: solo se paga si un jefe lo aprueba (pre-nómina).',
    `Si las productivas son menos del ${UMBRAL_PRODUCTIVIDAD_REVISAR} % de las laboradas, se sugiere revisar antes de pagar.`,
    'Es una sugerencia: no crea ni modifica pagos.',
  ];
}
