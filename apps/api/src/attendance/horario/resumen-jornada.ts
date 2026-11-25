/**
 * Resumen de una jornada: capas planeado / real / pagable y clasificacion de
 * cada minuto laborado (ordinario, extra, nocturno, festivo, descanso).
 *
 * Regla de Adam: EXTRA = lo laborado fuera del rango normal de la empresa
 * (10:00-18:00 por omision), aunque el horario citado de la persona caiga ahi.
 * Solo se paga lo checado (entrada -> salida reales, menos comida).
 */

import {
  HORARIO_DEFAULT,
  hmAMinutos,
  horaValida,
  minutosEntreHm,
  sumaDias,
} from './horario-de.js';
import { parseWorkDate, workDayAtClock, WORKDAY_TIMEZONE } from '../../common/time/workday.js';

export type RangoHm = { inicio: string; fin: string };
export type ComidaTramo = { inicio: Date; fin: Date };

export type ClasificacionMinutos = {
  minutosOrdinarios: number;
  minutosExtra: number;
  minutosNocturnos: number;
  minutosFestivos: number;
  minutosDescanso: number;
};

export type ResumenJornada = {
  retardoMin: number;
  minutosLaborados: number;
  minutosOrdinarios: number;
  minutosExtra: number;
  minutosNocturnos: number;
  minutosFestivos: number;
  minutosDescanso: number;
  salidaAnticipadaMin: number;
  faltaParcial: boolean;
  abierta: boolean;
  clasificacion: ClasificacionMinutos;
  capas: {
    planeado: { entrada: string; salida: string; graciaMin: number; jornadaCitadaMin: number };
    real: { entrada: string | null; salida: string | null };
    pagable: { laborados: number; ordinarios: number; extra: number };
  };
};

export type ResumenJornadaInput = {
  horario: { horaEntrada: string; horaSalida: string; graciaMin?: number; fecha: string };
  entradaReal: Date | null;
  salidaReal: Date | null;
  comidas?: ComidaTramo[];
  rangoNormal?: RangoHm;
  franjaNocturna?: RangoHm;
  esFestivo?: boolean;
  esDiaDescanso?: boolean;
  ahora?: Date;
  tz?: string;
};

const RANGO_NORMAL: RangoHm = { inicio: HORARIO_DEFAULT.entrada, fin: HORARIO_DEFAULT.salida };
const FRANJA_NOCHE: RangoHm = { inicio: '20:00', fin: '06:00' };

export function instanteEnFechaLocal(fecha: string, hm: string, tz = WORKDAY_TIMEZONE): Date {
  const v = horaValida(hm) ?? '00:00';
  const [hh, mm] = v.split(':').map(Number);
  const base = parseWorkDate(fecha, tz);
  return workDayAtClock(base, hh, mm, tz);
}

export function instanteSalidaCitada(fecha: string, entradaHm: string, salidaHm: string, tz = WORKDAY_TIMEZONE): Date {
  const e = hmAMinutos(entradaHm);
  const s = hmAMinutos(salidaHm);
  const diaSalida = s <= e ? sumaDias(fecha, 1) : fecha;
  return instanteEnFechaLocal(diaSalida, salidaHm, tz);
}

export function resumenJornada(p: ResumenJornadaInput): ResumenJornada {
  const tz = p.tz ?? WORKDAY_TIMEZONE;
  const gracia =
    typeof p.horario.graciaMin === 'number' && p.horario.graciaMin >= 0
      ? p.horario.graciaMin
      : HORARIO_DEFAULT.graciaMin;
  const entradaHm = horaValida(p.horario.horaEntrada) ?? HORARIO_DEFAULT.entrada;
  const salidaHm = horaValida(p.horario.horaSalida) ?? HORARIO_DEFAULT.salida;
  const jornadaCitadaMin = minutosEntreHm(entradaHm, salidaHm);
  const rango = p.rangoNormal ?? RANGO_NORMAL;
  const noche = p.franjaNocturna ?? FRANJA_NOCHE;

  const baseCapas = () => ({
    planeado: { entrada: entradaHm, salida: salidaHm, graciaMin: gracia, jornadaCitadaMin },
    real: {
      entrada: p.entradaReal ? p.entradaReal.toISOString() : null,
      salida: p.salidaReal ? p.salidaReal.toISOString() : null,
    },
    pagable: { laborados: 0, ordinarios: 0, extra: 0 },
  });

  const vacio = (extra: Partial<ResumenJornada> = {}): ResumenJornada => {
    const clasificacion: ClasificacionMinutos = {
      minutosOrdinarios: 0,
      minutosExtra: 0,
      minutosNocturnos: 0,
      minutosFestivos: 0,
      minutosDescanso: 0,
    };
    return {
      retardoMin: 0,
      minutosLaborados: 0,
      minutosOrdinarios: 0,
      minutosExtra: 0,
      minutosNocturnos: 0,
      minutosFestivos: 0,
      minutosDescanso: 0,
      salidaAnticipadaMin: 0,
      faltaParcial: false,
      abierta: false,
      clasificacion,
      capas: baseCapas(),
      ...extra,
    };
  };

  if (!p.entradaReal) return vacio();

  const citadaEntrada = instanteEnFechaLocal(p.horario.fecha, entradaHm, tz);
  const citadaSalida = instanteSalidaCitada(p.horario.fecha, entradaHm, salidaHm, tz);
  const umbralRetardo = citadaEntrada.getTime() + gracia * 60_000;
  const retardoMin =
    p.entradaReal.getTime() > umbralRetardo
      ? Math.round((p.entradaReal.getTime() - citadaEntrada.getTime()) / 60_000)
      : 0;

  const abierta = !p.salidaReal;
  const finReal = p.salidaReal ?? p.ahora ?? null;
  if (!finReal || finReal.getTime() <= p.entradaReal.getTime()) {
    return vacio({
      retardoMin,
      abierta,
      capas: {
        ...baseCapas(),
        pagable: { laborados: 0, ordinarios: 0, extra: 0 },
      },
    });
  }

  const brutos = [{ inicio: p.entradaReal.getTime(), fin: finReal.getTime() }];
  const comidaMs = (p.comidas ?? [])
    .filter((c) => c.fin.getTime() > c.inicio.getTime())
    .map((c) => ({ inicio: c.inicio.getTime(), fin: c.fin.getTime() }));
  const laborables = restarTramos(brutos, comidaMs);
  const minutosLaborados = minutosDe(laborables);

  const clasificacion = clasificarMinutosLaborados(laborables, {
    rangoNormal: rango,
    franjaNocturna: noche,
    esFestivo: !!p.esFestivo,
    esDiaDescanso: !!p.esDiaDescanso,
    tz,
  });

  let salidaAnticipadaMin = 0;
  if (p.salidaReal && p.salidaReal.getTime() + 60_000 < citadaSalida.getTime()) {
    salidaAnticipadaMin = Math.round((citadaSalida.getTime() - p.salidaReal.getTime()) / 60_000);
  }

  const faltaParcial =
    salidaAnticipadaMin >= 30 ||
    (minutosLaborados > 0 && jornadaCitadaMin > 0 && minutosLaborados < jornadaCitadaMin * 0.5);

  return {
    retardoMin,
    minutosLaborados,
    minutosOrdinarios: clasificacion.minutosOrdinarios,
    minutosExtra: clasificacion.minutosExtra,
    minutosNocturnos: clasificacion.minutosNocturnos,
    minutosFestivos: clasificacion.minutosFestivos,
    minutosDescanso: clasificacion.minutosDescanso,
    salidaAnticipadaMin,
    faltaParcial,
    abierta,
    clasificacion,
    capas: {
      planeado: { entrada: entradaHm, salida: salidaHm, graciaMin: gracia, jornadaCitadaMin },
      real: baseCapas().real,
      pagable: {
        laborados: minutosLaborados,
        ordinarios: clasificacion.minutosOrdinarios,
        extra: clasificacion.minutosExtra,
      },
    },
  };
}

export function clasificarMinutosLaborados(
  tramos: Array<{ inicio: number; fin: number }>,
  opts: {
    rangoNormal: RangoHm;
    franjaNocturna: RangoHm;
    esFestivo: boolean;
    esDiaDescanso: boolean;
    tz?: string;
  },
): ClasificacionMinutos {
  const tz = opts.tz ?? WORKDAY_TIMEZONE;
  const out: ClasificacionMinutos = {
    minutosOrdinarios: 0,
    minutosExtra: 0,
    minutosNocturnos: 0,
    minutosFestivos: 0,
    minutosDescanso: 0,
  };

  for (const t of tramos) {
    for (let ms = t.inicio; ms < t.fin; ms += 60_000) {
      const minLocal = minutoLocalDelDia(new Date(ms), tz);
      if (minutoEnRango(minLocal, opts.rangoNormal.inicio, opts.rangoNormal.fin)) out.minutosOrdinarios += 1;
      else out.minutosExtra += 1;
      if (minutoEnRangoQueCruza(minLocal, opts.franjaNocturna.inicio, opts.franjaNocturna.fin)) {
        out.minutosNocturnos += 1;
      }
      if (opts.esFestivo) out.minutosFestivos += 1;
      if (opts.esDiaDescanso) out.minutosDescanso += 1;
    }
  }
  return out;
}

function minutoLocalDelDia(instante: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(instante);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

function minutoEnRango(minLocal: number, inicioHm: string, finHm: string): boolean {
  const a = hmAMinutos(inicioHm);
  const b = hmAMinutos(finHm);
  if (a < 0 || b < 0) return false;
  if (b > a) return minLocal >= a && minLocal < b;
  return minutoEnRangoQueCruza(minLocal, inicioHm, finHm);
}

function minutoEnRangoQueCruza(minLocal: number, inicioHm: string, finHm: string): boolean {
  const a = hmAMinutos(inicioHm);
  const b = hmAMinutos(finHm);
  if (a < 0 || b < 0) return false;
  if (b > a) return minLocal >= a && minLocal < b;
  return minLocal >= a || minLocal < b;
}

function restarTramos(
  base: Array<{ inicio: number; fin: number }>,
  quitar: Array<{ inicio: number; fin: number }>,
): Array<{ inicio: number; fin: number }> {
  let actual = base.map((t) => ({ ...t }));
  for (const q of quitar) {
    const next: Array<{ inicio: number; fin: number }> = [];
    for (const t of actual) {
      if (q.fin <= t.inicio || q.inicio >= t.fin) {
        next.push(t);
        continue;
      }
      if (q.inicio > t.inicio) next.push({ inicio: t.inicio, fin: Math.min(q.inicio, t.fin) });
      if (q.fin < t.fin) next.push({ inicio: Math.max(q.fin, t.inicio), fin: t.fin });
    }
    actual = next.filter((x) => x.fin > x.inicio);
  }
  return actual;
}

function minutosDe(tramos: Array<{ inicio: number; fin: number }>): number {
  return tramos.reduce((s, t) => s + Math.max(0, Math.round((t.fin - t.inicio) / 60_000)), 0);
}
