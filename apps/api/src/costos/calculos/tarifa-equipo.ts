/**
 * Tarifa de un equipo: vehículo o herramienta mayor (Reglamento de la LOPSRM, arts. 194 a 208).
 *
 *   Fijos:    D = (Vm − Vr) / Ve     Im = (Vm + Vr) i / 2Ha     Sm = (Vm + Vr) s / 2Ha     Mn = Ko × D
 *   Consumos: Co = Pc / rendimiento  Lb = aceite / cada cuánto  N = Pn / Vn
 *
 * El Reglamento habla de horas efectivas. Aquí la unidad es la que tenga sentido para el equipo:
 * kilómetros para una camioneta y días para un OTDR. La fórmula es la misma. La operación (`Po`) no
 * se suma: el técnico ya se carga aparte, con su reloj.
 *
 * Módulo puro.
 */
import { redondear } from './numeros.js';

export const UNIDADES_EQUIPO = ['KM', 'HORA', 'DIA'] as const;
export type UnidadEquipo = (typeof UNIDADES_EQUIPO)[number];

export type FichaEquipoCalculo = {
  /** Valor nuevo, con llantas (Vm antes de descontarlas). */
  valor: number;
  /** Valor de las llantas o piezas especiales. Se descuenta de Vm y se carga aparte (N). */
  valorLlantas?: number;
  /** Rescate como fracción del valor (Vr = valor × fracción). */
  rescatePct?: number;
  /** Ve: vida económica en la unidad del equipo. */
  vidaUnidades: number;
  /** Ha: unidades que trabaja en un año. */
  unidadesAnio: number;
  /** i: tasa anual, como fracción. */
  tasaInteres?: number;
  /** s: prima anual de seguro, como fracción. */
  primaSeguro?: number;
  /** Ko: coeficiente de mantenimiento mayor y menor. */
  ko?: number;
  /** Rendimiento: unidades por litro (km/L). Sin motor, vacío. */
  rendimiento?: number;
  precioCombustible?: number;
  costoAceite?: number;
  aceiteCadaUnidades?: number;
  /** Vn: vida de las llantas en la unidad del equipo. */
  vidaLlantasUnidades?: number;
  /** Tenencia, verificación y demás gastos fijos al año que no están en el Reglamento. */
  otrosAnuales?: number;
};

export type TarifaEquipo = {
  d: number;
  im: number;
  sm: number;
  mn: number;
  co: number;
  lb: number;
  n: number;
  otros: number;
  fijos: number;
  consumos: number;
  total: number;
};

const dividir = (a: number, b: number | undefined): number => (b && b > 0 ? a / b : 0);

export function tarifaEquipo(f: FichaEquipoCalculo): TarifaEquipo {
  const llantas = f.valorLlantas ?? 0;
  const vm = Math.max(0, f.valor - llantas);
  const vr = f.valor * (f.rescatePct ?? 0);
  const ha = f.unidadesAnio;

  const d = dividir(Math.max(0, vm - vr), f.vidaUnidades);
  const im = dividir((vm + vr) * (f.tasaInteres ?? 0), 2 * ha);
  const sm = dividir((vm + vr) * (f.primaSeguro ?? 0), 2 * ha);
  const mn = (f.ko ?? 0) * d;
  const otros = dividir(f.otrosAnuales ?? 0, ha);

  const co = dividir(f.precioCombustible ?? 0, f.rendimiento);
  const lb = dividir(f.costoAceite ?? 0, f.aceiteCadaUnidades);
  const n = dividir(llantas, f.vidaLlantasUnidades);

  const fijos = d + im + sm + mn + otros;
  const consumos = co + lb + n;
  return {
    d: redondear(d, 4),
    im: redondear(im, 4),
    sm: redondear(sm, 4),
    mn: redondear(mn, 4),
    co: redondear(co, 4),
    lb: redondear(lb, 4),
    n: redondear(n, 4),
    otros: redondear(otros, 4),
    fijos: redondear(fijos, 4),
    consumos: redondear(consumos, 4),
    total: redondear(fijos + consumos, 2),
  };
}
