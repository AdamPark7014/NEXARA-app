/**
 * Vehículos: de las cargas, los servicios y las salidas a rendimiento real, desgaste, próximo servicio
 * y costo de cada viaje (`docs/COSTOS-PRECIOS-UNITARIOS.md`, «Fase 3 ampliada»).
 *
 * Módulo puro: lo que entra ya viene leído de la base.
 */
import { redondear } from './numeros.js';
import { tarifaEquipo, type FichaEquipoCalculo, type TarifaEquipo } from './tarifa-equipo.js';

/** Con menos tanques medidos todavía manda el rendimiento oficial. */
export const TANQUES_PARA_RENDIMIENTO_REAL = 3;
/** El rendimiento real se calcula con los tanques más recientes: el uso de hace años ya no dice nada. */
const TANQUES_DEL_PROMEDIO = 8;
const CARGAS_DEL_PRECIO = 5;
/** Fuera de esto no es un rendimiento: alguien se equivocó al capturar el odómetro o los litros. */
const KM_POR_LITRO_MINIMO = 2;
const KM_POR_LITRO_MAXIMO = 40;
/** Un viaje más largo que esto se costea, pero se avisa: suele ser un dedazo en el odómetro. */
export const KM_VIAJE_SOSPECHOSO = 3000;
const KM_SERVICIO_PRONTO = 1000;
const DIAS_SERVICIO_PRONTO = 30;
/** Dos servicios así de cerca se hacen en la misma visita al taller. */
const KM_MISMA_VISITA = 500;

const DIA_MS = 86_400_000;

const dia = (f: Date | string): string => new Date(f).toISOString().slice(0, 10);

/* ── Gasolina ─────────────────────────────────────────────────────────────── */

export type CargaDeCalculo = {
  fecha: Date | string;
  odometro: number;
  litros: number;
  importe: number;
  tanqueLleno: boolean;
};

export type Tanque = { fecha: string; km: number; litros: number; kmPorLitro: number };

/**
 * Cada tanque va de un lleno al siguiente: los km entre los dos, entre los litros cargados después del
 * primero. Una carga parcial se suma a la siguiente. Lo anterior al primer lleno no se puede medir,
 * porque no se sabe con cuánto venía.
 */
export function tanquesMedidos(cargas: readonly CargaDeCalculo[]): Tanque[] {
  const orden = [...cargas].sort(
    (a, b) => a.odometro - b.odometro || new Date(a.fecha).getTime() - new Date(b.fecha).getTime(),
  );
  const tanques: Tanque[] = [];
  let base: CargaDeCalculo | null = null;
  let litros = 0;
  for (const c of orden) {
    if (!base) {
      if (c.tanqueLleno) base = c;
      continue;
    }
    litros += c.litros;
    if (!c.tanqueLleno) continue;
    const km = c.odometro - base.odometro;
    const rendimiento = litros > 0 ? km / litros : 0;
    if (rendimiento >= KM_POR_LITRO_MINIMO && rendimiento <= KM_POR_LITRO_MAXIMO) {
      tanques.push({ fecha: dia(c.fecha), km, litros: redondear(litros), kmPorLitro: redondear(rendimiento) });
    }
    base = c;
    litros = 0;
  }
  return tanques;
}

export type Rendimiento = {
  oficial: number | null;
  real: number | null;
  /** El que entra a la tarifa. */
  usado: number | null;
  fuente: 'REAL' | 'OFICIAL' | 'SIN_DATO';
  tanques: number;
  /** Tanques llenos que faltan para usar el real. */
  faltan: number;
};

export function rendimientoVigente(oficial: number | null | undefined, tanques: readonly Tanque[]): Rendimiento {
  const limpio = oficial != null && oficial > 0 ? oficial : null;
  const ultimos = tanques.slice(-TANQUES_DEL_PROMEDIO);
  const km = ultimos.reduce((a, t) => a + t.km, 0);
  const litros = ultimos.reduce((a, t) => a + t.litros, 0);
  const real = litros > 0 ? redondear(km / litros) : null;
  const alcanza = tanques.length >= TANQUES_PARA_RENDIMIENTO_REAL && real != null;
  return {
    oficial: limpio,
    real,
    usado: alcanza ? real : limpio,
    fuente: alcanza ? 'REAL' : limpio != null ? 'OFICIAL' : 'SIN_DATO',
    tanques: tanques.length,
    faltan: Math.max(0, TANQUES_PARA_RENDIMIENTO_REAL - tanques.length),
  };
}

/** Precio por litro de las últimas cargas, pesado por litros; sin cargas, el de la ficha. */
export function precioVigente(cargas: readonly CargaDeCalculo[], omision?: number | null): number | null {
  const ultimas = [...cargas]
    .filter((c) => c.litros > 0 && c.importe > 0)
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
    .slice(-CARGAS_DEL_PRECIO);
  const litros = ultimas.reduce((a, c) => a + c.litros, 0);
  if (litros > 0) return redondear(ultimas.reduce((a, c) => a + c.importe, 0) / litros);
  return omision != null && omision > 0 ? omision : null;
}

/** Autonomía con un tanque, al rendimiento que se esté usando. */
export function autonomia(tanqueLitros: number | null | undefined, rendimiento: number | null | undefined): number | null {
  if (!tanqueLitros || !rendimiento) return null;
  return Math.round(tanqueLitros * rendimiento);
}

/* ── Tarifa ───────────────────────────────────────────────────────────────── */

export type TarifaVehiculo = {
  tarifa: TarifaEquipo;
  rendimiento: Rendimiento;
  precioLitro: number | null;
};

/** La ficha pone lo que no cambia; rendimiento y precio salen de las cargas en cuanto las hay. */
export function tarifaDeVehiculo(
  ficha: FichaEquipoCalculo,
  oficial: number | null | undefined,
  cargas: readonly CargaDeCalculo[],
): TarifaVehiculo {
  const rendimiento = rendimientoVigente(oficial ?? ficha.rendimiento, tanquesMedidos(cargas));
  const precioLitro = precioVigente(cargas, ficha.precioCombustible);
  return {
    rendimiento,
    precioLitro,
    tarifa: tarifaEquipo({
      ...ficha,
      rendimiento: rendimiento.usado ?? undefined,
      precioCombustible: precioLitro ?? undefined,
    }),
  };
}

/** A dónde se va cada kilómetro, en palabras de quien lo lee. El orden es el de la ficha. */
export function desgloseDeTarifa(t: TarifaEquipo) {
  return [
    { clave: 'co', nombre: 'Gasolina', importe: t.co },
    { clave: 'd', nombre: 'Desgaste del vehículo', importe: t.d },
    { clave: 'im', nombre: 'Dinero invertido', importe: t.im },
    { clave: 'mn', nombre: 'Mantenimiento', importe: t.mn },
    { clave: 'sm', nombre: 'Seguro', importe: t.sm },
    { clave: 'n', nombre: 'Llantas', importe: t.n },
    { clave: 'lb', nombre: 'Aceite', importe: t.lb },
    { clave: 'otros', nombre: 'Tenencia y verificación', importe: t.otros },
  ].filter((p) => p.importe > 0);
}

/* ── Viajes ───────────────────────────────────────────────────────────────── */

/** Km de una salida ya cerrada. Sin los dos números, o si no avanzó, no hay viaje que costear. */
export function kmDeSalida(inicio: number | null | undefined, fin: number | null | undefined): number | null {
  if (inicio == null || fin == null) return null;
  const km = fin - inicio;
  return km > 0 ? km : null;
}

export type Lectura = { fecha: Date | string; odometro: number };

/** El odómetro no retrocede: la lectura más alta es la vigente. */
export function odometroVigente(lecturas: readonly Lectura[]): { km: number; fecha: string } | null {
  let mejor: Lectura | null = null;
  for (const l of lecturas) {
    if (l.odometro == null || l.odometro < 0) continue;
    if (!mejor || l.odometro > mejor.odometro) mejor = l;
  }
  return mejor ? { km: mejor.odometro, fecha: dia(mejor.fecha) } : null;
}

/**
 * Km recorridos en un periodo, según las lecturas: la última dentro del periodo menos la última antes
 * de empezar. Si no hay lectura anterior, cuenta desde la primera del periodo.
 */
export function kmDelPeriodo(lecturas: readonly Lectura[], desde: Date, hasta: Date): number {
  const orden = [...lecturas]
    .filter((l) => l.odometro != null && l.odometro >= 0)
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
  const antes = orden.filter((l) => new Date(l.fecha) < desde);
  const dentro = orden.filter((l) => new Date(l.fecha) >= desde && new Date(l.fecha) < hasta);
  if (!dentro.length) return 0;
  const base = antes.length ? Math.max(...antes.map((l) => l.odometro)) : dentro[0].odometro;
  return Math.max(0, Math.max(...dentro.map((l) => l.odometro)) - base);
}

/**
 * Lo que un vehículo cuesta aunque no salga: si recorrió menos de lo planeado, el seguro, el dinero
 * invertido y la tenencia de esos km no los absorbió ningún proyecto. Se reparte el plan por los días
 * transcurridos: a media semana de mes todavía no se ha fallado el mes entero.
 */
export function costoParado(
  t: TarifaEquipo,
  kmAlAnio: number,
  kmReales: number,
  fraccionDelAnio: number,
): { kmParados: number; importe: number } {
  const plan = Math.max(0, kmAlAnio) * Math.max(0, fraccionDelAnio);
  const kmParados = Math.max(0, plan - kmReales);
  return {
    kmParados: Math.round(kmParados),
    importe: redondear(kmParados * (t.im + t.sm + t.otros)),
  };
}

/* ── Desgaste ─────────────────────────────────────────────────────────────── */

export type ServicioDeCalculo = {
  fecha: Date | string;
  odometro: number | null;
  concepto: string;
  costo: number;
  planIds: readonly number[];
};

const RE_ACEITE = /aceite/i;
const RE_LLANTAS_NUEVAS = /(cambio|nuevas?|reemplazo).*(llanta|neum[aá]tico)|(llanta|neum[aá]tico).*(nuevas?|cambio|reemplazo)/i;

function ultimoKm(servicios: readonly ServicioDeCalculo[], patron: RegExp): number | null {
  const kms = servicios.filter((s) => s.odometro != null && patron.test(s.concepto)).map((s) => s.odometro as number);
  return kms.length ? Math.max(...kms) : null;
}

const porcentaje = (parte: number, total: number | null | undefined) =>
  total && total > 0 ? Math.min(100, Math.max(0, Math.round((parte / total) * 100))) : null;

/** Qué tanto se ha gastado cada cosa. Lo que no tiene dato sale en null, no en cero. */
export function desgaste(
  entrada: {
    odometro: number;
    odometroCompra?: number | null;
    vidaKm?: number | null;
    vidaLlantasKm?: number | null;
    aceiteCadaKm?: number | null;
  },
  servicios: readonly ServicioDeCalculo[],
) {
  const { odometro, vidaKm, vidaLlantasKm, aceiteCadaKm } = entrada;
  const recorridos = Math.max(0, odometro - (entrada.odometroCompra ?? 0));
  const baseLlantas = ultimoKm(servicios, RE_LLANTAS_NUEVAS) ?? entrada.odometroCompra ?? 0;
  const baseAceite = ultimoKm(servicios, RE_ACEITE);
  const kmLlantas = Math.max(0, odometro - baseLlantas);
  return {
    vida: { pct: porcentaje(recorridos, vidaKm), km: recorridos, totalKm: vidaKm ?? null },
    llantas: {
      pct: porcentaje(kmLlantas, vidaLlantasKm),
      quedanKm: vidaLlantasKm ? Math.max(0, vidaLlantasKm - kmLlantas) : null,
    },
    aceite: {
      pct: baseAceite != null ? porcentaje(odometro - baseAceite, aceiteCadaKm) : null,
      ultimoKm: baseAceite,
    },
  };
}

/** Lo que vale hoy según lo que ha perdido por kilómetro. No baja del valor de rescate. */
export function valorEstimado(ficha: FichaEquipoCalculo, d: number, km: number): number {
  const rescate = ficha.valor * (ficha.rescatePct ?? 0);
  return Math.round(Math.max(rescate, ficha.valor - d * Math.max(0, km)));
}

/* ── Programa de servicio ─────────────────────────────────────────────────── */

export type PlanDeCalculo = {
  id: number;
  concepto: string;
  cadaKm: number | null;
  cadaMeses: number | null;
  costoEstimado?: number | null;
  paginaManual?: number | null;
};

export type EstadoServicio = 'VENCIDO' | 'PRONTO' | 'OK';

export type ServicioProgramado = {
  id: number;
  concepto: string;
  paginaManual: number | null;
  cadaKm: number | null;
  cadaMeses: number | null;
  costoEstimado: number | null;
  ultimoKm: number | null;
  ultimaFecha: string | null;
  proximoKm: number | null;
  proximaFecha: string | null;
  faltanKm: number | null;
  faltanDias: number | null;
  estado: EstadoServicio;
};

function sumarMeses(fecha: Date, meses: number): Date {
  const d = new Date(fecha);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d;
}

/**
 * Cuándo le toca cada cosa. Si ya se hizo: la última vez más el intervalo. Si no hay registro: el
 * siguiente múltiplo arriba del odómetro con que se dio de alta, porque nadie sabe qué se le hizo antes.
 */
export function programaDeServicio(
  plan: readonly PlanDeCalculo[],
  servicios: readonly ServicioDeCalculo[],
  contexto: { odometro: number; odometroAlta?: number | null; fechaBase?: Date | string | null; hoy: Date },
): ServicioProgramado[] {
  return plan.map((p) => {
    const hechos = servicios
      .filter((s) => s.planIds.includes(p.id))
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    const ultimo = hechos[0] ?? null;

    let proximoKm: number | null = null;
    if (p.cadaKm) {
      if (ultimo?.odometro != null) proximoKm = ultimo.odometro + p.cadaKm;
      else {
        const alta = contexto.odometroAlta ?? 0;
        proximoKm = (Math.floor(alta / p.cadaKm) + 1) * p.cadaKm;
      }
    }
    let proximaFecha: Date | null = null;
    const baseFecha = ultimo?.fecha ?? contexto.fechaBase ?? null;
    if (p.cadaMeses && baseFecha) proximaFecha = sumarMeses(new Date(baseFecha), p.cadaMeses);

    const faltanKm = proximoKm != null ? proximoKm - contexto.odometro : null;
    const faltanDias = proximaFecha ? Math.ceil((proximaFecha.getTime() - contexto.hoy.getTime()) / DIA_MS) : null;
    const estado: EstadoServicio =
      (faltanKm != null && faltanKm < 0) || (faltanDias != null && faltanDias < 0)
        ? 'VENCIDO'
        : (faltanKm != null && faltanKm <= KM_SERVICIO_PRONTO) || (faltanDias != null && faltanDias <= DIAS_SERVICIO_PRONTO)
          ? 'PRONTO'
          : 'OK';

    return {
      id: p.id,
      concepto: p.concepto,
      paginaManual: p.paginaManual ?? null,
      cadaKm: p.cadaKm,
      cadaMeses: p.cadaMeses,
      costoEstimado: p.costoEstimado ?? null,
      ultimoKm: ultimo?.odometro ?? null,
      ultimaFecha: ultimo ? dia(ultimo.fecha) : null,
      proximoKm,
      proximaFecha: proximaFecha ? dia(proximaFecha) : null,
      faltanKm,
      faltanDias,
      estado,
    };
  });
}

/** Próxima visita al taller: lo vencido primero y, con ello, lo que toca casi al mismo tiempo. */
export function proximoServicio(programa: readonly ServicioProgramado[]) {
  const conKm = programa.filter((s) => s.proximoKm != null);
  const primero = [...programa].sort((a, b) => {
    const rango = (s: ServicioProgramado) => (s.estado === 'VENCIDO' ? 0 : 1);
    return (
      rango(a) - rango(b) ||
      (a.faltanKm ?? Number.MAX_SAFE_INTEGER) - (b.faltanKm ?? Number.MAX_SAFE_INTEGER) ||
      (a.faltanDias ?? Number.MAX_SAFE_INTEGER) - (b.faltanDias ?? Number.MAX_SAFE_INTEGER)
    );
  })[0];
  if (!primero) return null;
  const grupo =
    primero.proximoKm != null
      ? conKm.filter((s) => Math.abs((s.proximoKm as number) - (primero.proximoKm as number)) <= KM_MISMA_VISITA)
      : [primero];
  const fechas = grupo.map((s) => s.proximaFecha).filter((f): f is string => Boolean(f)).sort();
  return {
    km: primero.proximoKm,
    faltanKm: primero.faltanKm,
    fecha: fechas[0] ?? null,
    conceptos: grupo.map((s) => s.concepto),
    estado: primero.estado,
  };
}
