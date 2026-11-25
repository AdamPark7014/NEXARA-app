/**
 * Parametros de productividad / rango normal con vigencia.
 * Cambiar un parametro no altera semanas ya cerradas: se elige el vigente
 * en la fecha pedida (`vigenteDesde` <= fecha, el mas reciente).
 */

import { HORARIO_DEFAULT, horaValida } from './horario-de.js';

export type ParametrosProductividad = {
  vigenteDesde: string;
  rangoNormalInicio: string;
  rangoNormalFin: string;
  graciaMin: number;
  pesoPuntualidad: number;
  pesoAprovechamiento: number;
  pesoEficiencia: number;
  topeBonoPct: number;
  factorExtra: number;
  topeExtraSemanaMin: number;
  franjaNocturnaInicio: string;
  franjaNocturnaFin: string;
  nota?: string | null;
};

export const PARAMETROS_DEFAULT: ParametrosProductividad = {
  vigenteDesde: '1970-01-01',
  rangoNormalInicio: HORARIO_DEFAULT.entrada,
  rangoNormalFin: HORARIO_DEFAULT.salida,
  graciaMin: HORARIO_DEFAULT.graciaMin,
  pesoPuntualidad: 0.3,
  pesoAprovechamiento: 0.4,
  pesoEficiencia: 0.3,
  topeBonoPct: 100,
  factorExtra: 2,
  topeExtraSemanaMin: 9 * 60,
  franjaNocturnaInicio: '20:00',
  franjaNocturnaFin: '06:00',
  nota: null,
};

export function normalizarParametros(raw: Partial<ParametrosProductividad> & { vigenteDesde: string }): ParametrosProductividad {
  const base = { ...PARAMETROS_DEFAULT, ...raw };
  const ini = horaValida(base.rangoNormalInicio) ?? PARAMETROS_DEFAULT.rangoNormalInicio;
  const fin = horaValida(base.rangoNormalFin) ?? PARAMETROS_DEFAULT.rangoNormalFin;
  const nIni = horaValida(base.franjaNocturnaInicio) ?? PARAMETROS_DEFAULT.franjaNocturnaInicio;
  const nFin = horaValida(base.franjaNocturnaFin) ?? PARAMETROS_DEFAULT.franjaNocturnaFin;
  const pesos = [base.pesoPuntualidad, base.pesoAprovechamiento, base.pesoEficiencia].map((x) =>
    Number.isFinite(x) && x >= 0 ? x : 0,
  );
  const suma = pesos[0] + pesos[1] + pesos[2];
  const norm = suma > 0 ? pesos.map((x) => x / suma) : [0.3, 0.4, 0.3];
  return {
    vigenteDesde: base.vigenteDesde.slice(0, 10),
    rangoNormalInicio: ini,
    rangoNormalFin: fin,
    graciaMin: Math.max(0, Math.round(base.graciaMin || 0)),
    pesoPuntualidad: norm[0],
    pesoAprovechamiento: norm[1],
    pesoEficiencia: norm[2],
    topeBonoPct: Math.max(0, base.topeBonoPct),
    factorExtra: Math.max(0, base.factorExtra),
    topeExtraSemanaMin: Math.max(0, Math.round(base.topeExtraSemanaMin || 0)),
    franjaNocturnaInicio: nIni,
    franjaNocturnaFin: nFin,
    nota: base.nota ?? null,
  };
}

/** Elige el parametro vigente en `fecha` (el de vigenteDesde mas reciente <= fecha). */
export function parametrosVigentesEn(
  historial: readonly ParametrosProductividad[],
  fecha: string,
): ParametrosProductividad {
  const dia = fecha.slice(0, 10);
  const candidatos = historial
    .filter((p) => p.vigenteDesde.slice(0, 10) <= dia)
    .sort((a, b) => (a.vigenteDesde < b.vigenteDesde ? 1 : a.vigenteDesde > b.vigenteDesde ? -1 : 0));
  return candidatos[0] ? normalizarParametros(candidatos[0]) : { ...PARAMETROS_DEFAULT };
}

/**
 * Nota informativa LFT (no automatica): limites tipicos para que direccion
 * confirme con la contadora. No inventa cifras de pago.
 */
export const NOTA_LFT_INFORMATIVA =
  'Referencia LFT (informativa, no automatica): jornada diurna max. 8 h, nocturna 7 h, mixta 7.5 h; ' +
  'extra: primeras 9 h/semana al doble, siguientes al triple; prima dominical y descanso semanal. ' +
  'Si la configuracion queda por debajo de lo legal, muestre aviso; no cambie los calculos de Adam sin pedido.';