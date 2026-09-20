/**
 * Reabastecimiento de material circulante.
 *
 * El almacén no debe adivinar cuánto cable o cuántos conectores guardar: se calcula
 * con lo que de verdad salió. De los movimientos de salida de los últimos 60–90 días
 * sale el consumo por día; con el `leadTimeDias` del proveedor y los días de colchón
 * (`stockSeguridadDias`) sale el mínimo, y el máximo suma un lote de compra.
 *
 * Solo aplica a productos marcados `esCirculante`: el equipo que se compra por
 * proyecto no se repone solo y meterlo aquí llenaría la lista de ruido.
 *
 * Todo aquí es aritmética pura sin Prisma ni fechas del sistema, para poder probarlo.
 * `ReabastecimientoService` es quien lee la base y guarda `minCalculado`/`maxCalculado`.
 */

/** Ventana de consumo que se mira hacia atrás. El dueño pidió «entre 60 y 90 días». */
export const VENTANA_CONSUMO_DIAS = 90;
/** Con menos historia que esto el promedio miente; se usa igual pero se marca. */
export const VENTANA_CONSUMO_MINIMA_DIAS = 60;
/** Si el producto no dice cuánto tarda el proveedor, se asume una semana. */
export const LEAD_TIME_POR_DEFECTO_DIAS = 7;
/** Colchón por defecto sobre el lead time. */
export const STOCK_SEGURIDAD_POR_DEFECTO_DIAS = 3;

/** Movimiento de salida ya normalizado a unidad base. */
export type MovimientoConsumo = {
  /** Cantidad en unidad base del producto. Siempre positiva. */
  quantity: number;
  createdAt: Date;
};

export type ParametrosProducto = {
  /** Días que tarda el proveedor en surtir. */
  leadTimeDias?: number | null;
  /** Días de consumo que se guardan de colchón sobre el lead time. */
  stockSeguridadDias?: number | null;
  /** Compra mínima al proveedor, en unidad base. */
  compraMinima?: number | null;
  /** Piezas que trae la presentación de compra por defecto («Caja» = 100). */
  piezasPorEmpaque?: number | null;
};

export type CalculoMinMax = {
  /** Promedio de salida por día en la ventana. */
  consumoDiario: number;
  /** Existencia bajo la cual hay que pedir. */
  min: number;
  /** Hasta dónde conviene subir cuando se pide. */
  max: number;
  /** Tamaño del lote que se compra (empaque / compra mínima / consumo del lead time). */
  lote: number;
  leadTimeDias: number;
  stockSeguridadDias: number;
  /** Días con historia real dentro de la ventana. */
  diasConsiderados: number;
  /** true cuando la historia no llega a `VENTANA_CONSUMO_MINIMA_DIAS`. */
  historiaCorta: boolean;
};

/** Un número utilizable, o `null` si no lo es. Evita que un Decimal raro envenene el cálculo. */
function numero(valor: unknown): number | null {
  if (valor == null || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** Positivo o `null`. Un lead time de 0 o negativo es dato basura, no «inmediato». */
function positivo(valor: unknown): number | null {
  const n = numero(valor);
  return n != null && n > 0 ? n : null;
}

/** Redondeo a 4 decimales: la misma precisión que `Decimal(14,4)` de la base. */
export function redondear4(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 10_000) / 10_000;
}

/**
 * Consumo por día dentro de la ventana. Solo cuentan las salidas; una entrada o un
 * traspaso no es consumo.
 *
 * Se divide entre los días de la ventana, no entre los días que tuvieron movimiento:
 * un material que salió una vez en 90 días consume poco, y así queda.
 */
export function consumoDiario(
  movimientos: readonly MovimientoConsumo[],
  opciones: { hasta: Date; dias?: number },
): { consumoDiario: number; total: number; diasConsiderados: number; historiaCorta: boolean } {
  const dias = Math.max(1, Math.trunc(opciones.dias ?? VENTANA_CONSUMO_DIAS));
  const hasta = opciones.hasta.getTime();
  const desde = hasta - dias * 86_400_000;

  let total = 0;
  let masViejo: number | null = null;
  for (const mov of movimientos) {
    const t = mov.createdAt instanceof Date ? mov.createdAt.getTime() : new Date(mov.createdAt).getTime();
    if (!Number.isFinite(t) || t < desde || t > hasta) continue;
    const cantidad = numero(mov.quantity);
    if (cantidad == null || cantidad <= 0) continue;
    total += cantidad;
    if (masViejo == null || t < masViejo) masViejo = t;
  }

  // Con historia corta (producto nuevo) el promedio sobre 90 días saldría ridículamente
  // bajo y nunca alertaría. Se divide entre los días que sí existen.
  const diasConHistoria =
    masViejo == null ? dias : Math.max(1, Math.ceil((hasta - masViejo) / 86_400_000));
  const diasConsiderados = Math.min(dias, diasConHistoria);

  return {
    consumoDiario: redondear4(total / diasConsiderados),
    total: redondear4(total),
    diasConsiderados,
    historiaCorta: diasConsiderados < Math.min(dias, VENTANA_CONSUMO_MINIMA_DIAS),
  };
}

/**
 * Sube una cantidad al siguiente múltiplo del empaque y nunca deja pedir menos que la
 * compra mínima del proveedor. Pedir «media caja» no existe.
 */
export function redondearACompra(cantidad: number, producto: ParametrosProducto): number {
  const base = Math.max(0, numero(cantidad) ?? 0);
  if (base <= 0) return 0;

  const compraMinima = positivo(producto.compraMinima);
  const empaque = positivo(producto.piezasPorEmpaque);

  let resultado = base;
  if (compraMinima != null && resultado < compraMinima) resultado = compraMinima;
  if (empaque != null) resultado = Math.ceil(redondear4(resultado / empaque) - 1e-9) * empaque;
  return redondear4(resultado);
}

/**
 * Mínimo y máximo de un producto en un almacén.
 *
 * - `min` = consumo diario × (lead time + días de seguridad). Es el punto en que hay
 *   que pedir para no quedarse sin material mientras llega.
 * - `lote` = lo que conviene pedir de un jalón: el consumo del lead time, subido al
 *   empaque y a la compra mínima.
 * - `max` = `min` + `lote`.
 *
 * Sin consumo en la ventana el resultado es 0/0: no se inventa un mínimo para algo que
 * nadie usa (eso es justo lo que el reporte de dead stock tiene que enseñar).
 */
export function calcularMinMax(
  params: ParametrosProducto & {
    movimientos: readonly MovimientoConsumo[];
    hasta: Date;
    ventanaDias?: number;
  },
): CalculoMinMax {
  const leadTimeDias = positivo(params.leadTimeDias) ?? LEAD_TIME_POR_DEFECTO_DIAS;
  const seguridad = numero(params.stockSeguridadDias);
  const stockSeguridadDias =
    seguridad != null && seguridad >= 0 ? seguridad : STOCK_SEGURIDAD_POR_DEFECTO_DIAS;

  const consumo = consumoDiario(params.movimientos, {
    hasta: params.hasta,
    dias: params.ventanaDias,
  });

  if (consumo.consumoDiario <= 0) {
    return {
      consumoDiario: 0,
      min: 0,
      max: 0,
      lote: 0,
      leadTimeDias,
      stockSeguridadDias,
      diasConsiderados: consumo.diasConsiderados,
      historiaCorta: consumo.historiaCorta,
    };
  }

  const min = redondear4(consumo.consumoDiario * (leadTimeDias + stockSeguridadDias));
  const lote = redondearACompra(consumo.consumoDiario * leadTimeDias, params);
  const max = redondear4(min + lote);

  return {
    consumoDiario: consumo.consumoDiario,
    min,
    max,
    lote,
    leadTimeDias,
    stockSeguridadDias,
    diasConsiderados: consumo.diasConsiderados,
    historiaCorta: consumo.historiaCorta,
  };
}

export type SugerenciaCompra = {
  /** Existencia libre (on-hand − apartado). */
  disponible: number;
  /** true cuando toca pedir. */
  reponer: boolean;
  /** Lo que falta para llegar al máximo, sin redondear. */
  faltante: number;
  /** Lo que hay que comprar, ya subido a empaque y compra mínima. */
  sugerido: number;
  /** Días de material que quedan al ritmo actual. `null` si no hay consumo. */
  diasDeCobertura: number | null;
};

/**
 * Qué comprar de un renglón. Se dispara con existencia **menor o igual** al mínimo:
 * quedarse justo en el mínimo ya es tarde, porque el proveedor tarda el lead time.
 */
export function sugerenciaReabastecimiento(
  params: ParametrosProducto & {
    onHand: number;
    reservado?: number | null;
    min: number;
    max: number;
    consumoDiario?: number | null;
  },
): SugerenciaCompra {
  const onHand = numero(params.onHand) ?? 0;
  const reservado = Math.max(0, numero(params.reservado) ?? 0);
  const disponible = redondear4(onHand - reservado);
  const min = Math.max(0, numero(params.min) ?? 0);
  const max = Math.max(min, numero(params.max) ?? 0);
  const consumo = positivo(params.consumoDiario);

  const diasDeCobertura = consumo == null ? null : redondear4(Math.max(0, disponible) / consumo);
  const reponer = min > 0 && disponible <= min;
  const faltante = reponer ? redondear4(Math.max(0, max - disponible)) : 0;

  return {
    disponible,
    reponer,
    faltante,
    sugerido: reponer ? redondearACompra(faltante, params) : 0,
    diasDeCobertura,
  };
}
