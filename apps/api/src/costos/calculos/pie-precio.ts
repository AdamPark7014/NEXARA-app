/**
 * Pie de precio: del costo directo al precio (Reglamento de la LOPSRM, arts. 212, 214, 216, 219 y
 * 220). Cada capa se calcula sobre todo lo anterior. Los cargos adicionales se aplican sobre el
 * importe total, así que el precio se despeja: PU = PV ÷ (1 − cargos).
 *
 * Módulo puro. Los porcentajes entran como fracción (0.15 = 15 %).
 */
import { redondear } from './numeros.js';

export type PorcentajesPie = {
  indirecto: number;
  financiamiento: number;
  utilidad: number;
  cargos?: number;
};

export type PiePrecio = {
  cd: number;
  ci: number;
  cf: number;
  cu: number;
  pv: number;
  ca: number;
  pu: number;
  /** PU ÷ CD: el factor de sobrecosto. */
  factor: number;
};

export function piePrecio(cd: number, p: PorcentajesPie): PiePrecio {
  const ci = cd * p.indirecto;
  const cf = (cd + ci) * p.financiamiento;
  const cu = (cd + ci + cf) * p.utilidad;
  const pv = cd + ci + cf + cu;
  const cargos = Math.min(0.99, Math.max(0, p.cargos ?? 0));
  const pu = pv / (1 - cargos);
  return {
    cd: redondear(cd),
    ci: redondear(ci),
    cf: redondear(cf),
    cu: redondear(cu),
    pv: redondear(pv),
    ca: redondear(pu - pv),
    pu: redondear(pu),
    factor: cd > 0 ? redondear(pu / cd, 4) : 0,
  };
}

/** Utilidad real sobre el costo si el precio ya está capturado. */
export function utilidadSobreCosto(precio: number, costo: number): number | null {
  if (!(costo > 0)) return null;
  return redondear((precio - costo) / costo, 4);
}

export type EntradaFinanciamiento = {
  /** Directo + indirecto que sale en cada periodo, en orden. */
  egresos: readonly number[];
  /** Anticipo como fracción del precio; entra en el periodo 0. */
  anticipo: number;
  /** En qué periodo se cobra el resto. */
  periodoCobro: number;
  /** Tasa anual, como fracción. */
  tasaAnual: number;
  /** Utilidad, como fracción: el ingreso depende del precio. */
  utilidad: number;
  periodosPorAnio?: number;
};

export type Financiamiento = {
  /** Fracción sobre directo + indirecto. */
  porcentaje: number;
  /** Veces que se recalculó hasta estabilizarse. */
  vueltas: number;
  interes: number;
  saldos: number[];
};

const TOPE_VUELTAS = 50;

/**
 * Art. 216: diferencia de ingresos y egresos por la tasa, entre directo + indirecto. El Reglamento
 * deja el procedimiento a cada dependencia; aquí el interés corre sobre el saldo negativo de cada
 * periodo. Da vueltas porque el ingreso depende del precio y el precio del financiamiento.
 */
export function financiamiento(e: EntradaFinanciamiento): Financiamiento {
  const total = e.egresos.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return { porcentaje: 0, vueltas: 0, interes: 0, saldos: [] };
  const periodos = Math.max(e.egresos.length, e.periodoCobro + 1);
  const tasa = e.tasaAnual / (e.periodosPorAnio ?? 12);

  let f = 0;
  let salida: Financiamiento = { porcentaje: 0, vueltas: 0, interes: 0, saldos: [] };
  for (let vuelta = 0; vuelta < TOPE_VUELTAS; vuelta += 1) {
    const precio = total * (1 + f) * (1 + e.utilidad);
    let saldo = e.anticipo * precio;
    let interes = 0;
    const saldos: number[] = [];
    for (let i = 0; i < periodos; i += 1) {
      saldo -= e.egresos[i] ?? 0;
      if (i === e.periodoCobro) saldo += (1 - e.anticipo) * precio;
      if (saldo < 0) interes += -saldo * tasa;
      saldos.push(redondear(saldo));
    }
    const nuevo = interes / total;
    salida = { porcentaje: redondear(nuevo, 4), vueltas: vuelta, interes: redondear(interes), saldos };
    if (Math.abs(nuevo - f) < 1e-6) break;
    f = nuevo;
  }
  return salida;
}
