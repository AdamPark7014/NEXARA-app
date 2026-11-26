import { claveDia, sumarDias } from './actividad-periodo.js';
import { JORNADA_OFICINA } from './tiempo-entrega.js';
import { workDateKey } from '../common/time/workday.js';

export const MENSAJE_UN_SOLO_DIA =
  'Las actividades son de un solo día. Si el trabajo toma varios días, crea una actividad por día.';

function minutosDeHm(hm: string): number {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(hm ?? '').trim());
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Minutos netos de la jornada de oficina (entrada→salida menos 60 de comida). */
export const MINUTOS_JORNADA_NETOS = Math.max(
  0,
  minutosDeHm(JORNADA_OFICINA.salida) - minutosDeHm(JORNADA_OFICINA.entrada) - 60,
);

function diaDe(valor: unknown): string | null {
  if (valor == null || valor === '') return null;
  if (typeof valor === 'string') {
    const clave = claveDia(valor.trim());
    if (clave) return clave;
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : workDateKey(d);
  }
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return workDateKey(valor);
  return null;
}

/**
 * Día laboral (México) de una fecha con hora. «2026-11-27T00:00:00.000Z» son las 18:00 del 26 en
 * Puebla: recortar el texto daba el 27 y toda actividad que llegaba a la salida «duraba dos días».
 * Solo un «AAAA-MM-DD» sin hora se toma tal cual.
 */
function diaDeInstante(valor: unknown): string | null {
  if (valor == null || valor === '') return null;
  if (typeof valor === 'string') {
    const texto = valor.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return claveDia(texto);
    const d = new Date(texto);
    return Number.isNaN(d.getTime()) ? null : workDateKey(d);
  }
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return workDateKey(valor);
  return null;
}

export type ValidacionUnSoloDia = { ok: true } | { ok: false; error: string };

export function validarUnSoloDia(input: {
  periodoInicio?: unknown;
  periodoFin?: unknown;
  fechaInicio?: unknown;
  fechaMaxima?: unknown;
  fechaEntregaEsperada?: unknown;
  tiempoEstimadoMin?: number | null;
}): ValidacionUnSoloDia {
  const vacio = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '');
  const tieneIni = !vacio(input.periodoInicio);
  const tieneFin = !vacio(input.periodoFin);
  if (tieneIni !== tieneFin) {
    return { ok: false, error: 'El periodo necesita día de inicio y día de fin' };
  }
  if (tieneIni && tieneFin) {
    const a = diaDe(input.periodoInicio);
    const b = diaDe(input.periodoFin);
    if (!a || !b) return { ok: false, error: 'Las fechas del periodo no son válidas (usa AAAA-MM-DD)' };
    if (a !== b) return { ok: false, error: MENSAJE_UN_SOLO_DIA };
  }
  const inicio = diaDeInstante(input.fechaInicio);
  const max = diaDeInstante(input.fechaMaxima);
  const entrega = diaDeInstante(input.fechaEntregaEsperada);
  const ancla = inicio ?? max ?? entrega;
  if (ancla) {
    for (const d of [inicio, max, entrega]) {
      if (d && d !== ancla) return { ok: false, error: MENSAJE_UN_SOLO_DIA };
    }
  }
  if (typeof input.tiempoEstimadoMin === 'number' && Number.isFinite(input.tiempoEstimadoMin) && input.tiempoEstimadoMin > MINUTOS_JORNADA_NETOS) {
    return { ok: false, error: MENSAJE_UN_SOLO_DIA };
  }
  return { ok: true };
}

export function esDiaCalendarioLaborable(clave: string): boolean {
  const d = new Date(`${clave}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  const wd = d.getUTCDay();
  return wd !== 0 && wd !== 6;
}

export type DiaDesglose = {
  dia: number;
  total: number;
  fecha: string;
  titulo: string;
  alcance: string;
  cantidad: number;
  tiempoEstimadoMin: number;
};

function repartirEntero(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const resto = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i === n - 1 ? resto : 0));
}

export function desglosarPorDias(opts: {
  trabajo: string;
  desde: string;
  diasLaborables: number;
  cantidadTotal?: number | null;
  unidad?: string | null;
  tiempoTotalMin?: number | null;
  festivos?: readonly string[];
}): DiaDesglose[] {
  const n = Math.max(0, Math.floor(opts.diasLaborables));
  if (n <= 0) return [];
  const festivos = new Set((opts.festivos ?? []).map((f) => String(f).slice(0, 10)));
  const fechas: string[] = [];
  let cursor = claveDia(opts.desde) ?? String(opts.desde).slice(0, 10);
  let guard = 0;
  while (fechas.length < n && guard < 800) {
    guard += 1;
    if (esDiaCalendarioLaborable(cursor) && !festivos.has(cursor)) fechas.push(cursor);
    cursor = sumarDias(cursor, 1);
  }
  const cantTotal = Math.max(0, Math.floor(Number(opts.cantidadTotal ?? 0) || 0));
  const tiempoTotal =
    typeof opts.tiempoTotalMin === 'number' && Number.isFinite(opts.tiempoTotalMin) && opts.tiempoTotalMin > 0
      ? Math.floor(opts.tiempoTotalMin)
      : MINUTOS_JORNADA_NETOS * n;
  const cantidades = repartirEntero(cantTotal, n);
  const tiempos = repartirEntero(tiempoTotal, n).map((t) => Math.min(t, MINUTOS_JORNADA_NETOS));
  const trabajo = String(opts.trabajo ?? '').trim() || 'Actividad';
  const unidad = String(opts.unidad ?? '').trim();
  return fechas.map((fecha, i) => {
    const dia = i + 1;
    const cantidad = cantidades[i] ?? 0;
    const alcance =
      cantidad > 0 ? (unidad ? `${cantidad} ${unidad} hoy` : `${cantidad} hoy`) : '';
    return {
      dia,
      total: n,
      fecha,
      titulo: `${trabajo} · día ${dia} de ${n}`,
      alcance,
      cantidad,
      tiempoEstimadoMin: tiempos[i] ?? 0,
    };
  });
}

export function etiquetaSerie(dia: number, total: number): string {
  return `Día ${dia} de ${total}`;
}

/** Días laborables (lun–vie) inclusive entre desde y hasta. */
export function fechasLaborablesEnRango(
  desde: string,
  hasta: string,
  festivos?: readonly string[],
): string[] {
  const a = claveDia(desde);
  const b = claveDia(hasta);
  if (!a || !b || b < a) return [];
  const fest = new Set((festivos ?? []).map((f) => String(f).slice(0, 10)));
  const out: string[] = [];
  let cursor = a;
  let guard = 0;
  while (cursor <= b && guard < 800) {
    guard += 1;
    if (esDiaCalendarioLaborable(cursor) && !fest.has(cursor)) out.push(cursor);
    cursor = sumarDias(cursor, 1);
  }
  return out;
}

/** Reparte campos numerados («Cámara 1»…) por día según cantidades; el resto va al primer día. */
export function repartirCamposPorDia<T extends { nombre: string }>(campos: T[], cantidades: number[]): T[][] {
  if (!cantidades.length) return [campos.slice()];
  const numerados: { campo: T; n: number }[] = [];
  const otros: T[] = [];
  for (const c of campos) {
    const m = /^(.+?)\s+(\d+)$/.exec(c.nombre.trim());
    if (m) numerados.push({ campo: c, n: Number(m[2]) });
    else otros.push(c);
  }
  numerados.sort((x, y) => x.n - y.n);
  const grupos: T[][] = cantidades.map(() => []);
  let i = 0;
  for (let d = 0; d < cantidades.length; d++) {
    const cupo = Math.max(0, Math.floor(cantidades[d] ?? 0));
    for (let k = 0; k < cupo && i < numerados.length; k++, i++) grupos[d]!.push(numerados[i]!.campo);
  }
  while (i < numerados.length) {
    grupos[cantidades.length - 1]!.push(numerados[i]!.campo);
    i++;
  }
  if (grupos[0]) grupos[0] = [...otros, ...grupos[0]];
  else if (otros.length) return [otros];
  return grupos;
}

export function resumenDesglose(dias: DiaDesglose[]): string {
  const n = dias.length;
  const cant = dias.reduce((s, d) => s + d.cantidad, 0);
  const h = Math.round(dias.reduce((s, d) => s + d.tiempoEstimadoMin, 0) / 60);
  return `${n} días · ${cant} unidades · ${h} h`;
}
