/**
 * Costo real de la mano de obra (Reglamento de la LOPSRM, arts. 190 y 191).
 *
 *   Fsr = Ps × (Tp / Tl) + Tp / Tl
 *   Sr  = Sn × Fsr
 *
 * NEXARA no está obligada por ese Reglamento (es para obra pública): se usa como método. `Sn` es
 * el salario diario de la regla aprobada el 29-10: `sueldoSemanal ÷ 7`. Por eso `Tp` cuenta los
 * 365 días del año, y no solo los que se trabajan.
 *
 * Módulo puro (sin Nest ni Prisma) para poder probarlo con jest contra casos hechos a mano.
 */
import { festivosDeLeyDelAnio } from '../../festivos/festivos-reglas.js';
import { redondear } from './numeros.js';

/** Lunes a viernes: lo que trae la plantilla cuando la persona no tiene horario propio. */
export const DIAS_LUNES_A_VIERNES: readonly number[] = [1, 2, 3, 4, 5];

export type ParametrosSalarioReal = {
  anio: number;
  /** Días que se trabajan: 0 = domingo … 6 = sábado. */
  diasLaborables?: readonly number[];
  /** Días de vacaciones de esa persona en ese año (LFT art. 76). */
  vacacionesDias: number;
  /** Permisos, incapacidades y demás días pagados que no se trabajan. */
  otrosDias: number;
  /** LFT art. 87: al menos 15. */
  aguinaldoDias: number;
  /** LFT art. 80: al menos 0.25, como fracción. */
  primaVacacional: number;
  /** Cuotas de IMSS e Infonavit como fracción del salario. La da la contadora con el SUA. */
  ps: number;
};

export type SalarioReal = {
  diasDelAnio: number;
  diasHabiles: number;
  festivosEnDiaHabil: number;
  tp: number;
  tl: number;
  tpTl: number;
  fsr: number;
};

function esBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

function diaDeSemana(fecha: string): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay();
}

/** Días del año que caen en los días de la semana que se trabajan. */
export function diasHabilesDelAnio(anio: number, dias: readonly number[] = DIAS_LUNES_A_VIERNES): number {
  const trabaja = new Set(dias);
  const total = esBisiesto(anio) ? 366 : 365;
  let habiles = 0;
  for (let i = 0; i < total; i += 1) {
    if (trabaja.has(new Date(Date.UTC(anio, 0, 1 + i)).getUTCDay())) habiles += 1;
  }
  return habiles;
}

/**
 * LFT art. 76 (reforma de 2023): 12 días al cumplir el primer año, 2 más por año hasta 20, y
 * después 2 más por cada 5 años. Quien no cumple el año ya los va devengando: cuenta como 12.
 */
export function vacacionesPorAntiguedad(aniosCumplidos: number): number {
  const anios = Math.max(1, Math.floor(Number(aniosCumplidos) || 0));
  if (anios <= 5) return 12 + (anios - 1) * 2;
  return 20 + Math.ceil((anios - 5) / 5) * 2;
}

/** Años cumplidos a una fecha; sin fecha de ingreso, null. */
export function aniosCumplidos(ingreso: Date | string | null | undefined, al: Date): number | null {
  if (!ingreso) return null;
  const desde = new Date(ingreso);
  if (Number.isNaN(desde.getTime())) return null;
  let anios = al.getUTCFullYear() - desde.getUTCFullYear();
  const aunNoCumple =
    al.getUTCMonth() < desde.getUTCMonth() ||
    (al.getUTCMonth() === desde.getUTCMonth() && al.getUTCDate() < desde.getUTCDate());
  if (aunNoCumple) anios -= 1;
  return Math.max(0, anios);
}

export function factorSalarioReal(p: ParametrosSalarioReal): SalarioReal {
  const dias = p.diasLaborables?.length ? p.diasLaborables : DIAS_LUNES_A_VIERNES;
  const trabaja = new Set(dias);
  const diasDelAnio = esBisiesto(p.anio) ? 366 : 365;
  const diasHabiles = diasHabilesDelAnio(p.anio, dias);
  const festivosEnDiaHabil = festivosDeLeyDelAnio(p.anio).filter((f) => trabaja.has(diaDeSemana(f.fecha))).length;

  const tp = diasDelAnio + p.aguinaldoDias + p.vacacionesDias * p.primaVacacional;
  const tl = Math.max(1, diasHabiles - festivosEnDiaHabil - p.vacacionesDias - p.otrosDias);
  const razon = tp / tl;
  return {
    diasDelAnio,
    diasHabiles,
    festivosEnDiaHabil,
    tp: redondear(tp, 2),
    tl,
    tpTl: redondear(razon, 4),
    fsr: redondear(p.ps * razon + razon, 4),
  };
}

/** Costo de una hora: `sueldoSemanal ÷ 7 × Fsr ÷ horas de la jornada`. */
export function costoHora(sueldoSemanal: number, fsr: number, horasJornada = 8): number {
  const sueldo = Number(sueldoSemanal) || 0;
  if (sueldo <= 0 || !(horasJornada > 0)) return 0;
  return redondear(((sueldo / 7) * fsr) / horasJornada, 2);
}
