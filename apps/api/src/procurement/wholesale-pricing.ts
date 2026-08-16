/**
 * Precio de compra a mayorista.
 *
 * El esquema sólo tenía `SupplierProduct.price`: un precio único, de modo que
 * comprar 5 piezas y comprar 500 costaba lo mismo. El organigrama nombra
 * "Compras con Mayorista" como función propia de Administración, y un mayorista
 * se distingue precisamente por el escalón por volumen y el crédito pactado.
 *
 * Todo aquí es cálculo puro sobre números: sin Prisma, sin `Decimal`, sin fechas
 * implícitas. Quien llama convierte antes de entrar.
 */

/** Un escalón: a partir de `cantidadMinima` piezas, el precio es `unitPrice`. */
export type PriceBreak = {
  id?: number;
  cantidadMinima: number;
  unitPrice: number;
  currency?: string | null;
  vigenteDesde?: Date | null;
  vigenteHasta?: Date | null;
  activo?: boolean;
};

export type WholesaleTerms = {
  esMayorista?: boolean;
  creditoDias?: number | null;
  limiteCredito?: number | null;
  descuentoBase?: number | null;
  leadTimeDias?: number | null;
  pedidoMinimo?: number | null;
};

/**
 * Un escalón cuenta si está activo y la fecha cae dentro de su vigencia.
 *
 * La comparación es por **día de calendario**, no por instante. La vigencia es
 * una columna `@db.Date` —una fecha sin hora ni zona— que Prisma devuelve como
 * medianoche UTC; medirla contra un instante con `<`/`>` hacía que un convenio
 * vigente hasta el día 16 caducara la tarde del 15 en cualquier zona detrás de
 * UTC, que es justo donde opera la empresa.
 */
export function isBreakUsable(pb: PriceBreak, at: Date): boolean {
  if (pb.activo === false) return false;
  const hoy = localCalendarDay(at);
  if (pb.vigenteDesde && hoy < storedCalendarDay(pb.vigenteDesde)) return false;
  // `vigenteHasta` es inclusivo: un escalón que vence el día 30 sirve el día 30.
  if (pb.vigenteHasta && hoy > storedCalendarDay(pb.vigenteHasta)) return false;
  return true;
}

/** Día de calendario como AAAAMMDD; comparar enteros evita líos de horario. */
function toDayNumber(y: number, m: number, d: number): number {
  return y * 10000 + m * 100 + d;
}

/** Fecha guardada (`@db.Date`): sus componentes viven en UTC. */
function storedCalendarDay(d: Date): number {
  return toDayNumber(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** "Hoy" para quien compra: el día del calendario donde está parado. */
function localCalendarDay(d: Date): number {
  return toDayNumber(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/**
 * El escalón que aplica a una cantidad: el de mayor `cantidadMinima` que no la
 * supere. Con empate gana el más barato — si el mayorista dejó dos escalones al
 * mismo volumen, cobrarle al cliente el caro sería un error nuestro.
 *
 * Devuelve `null` si ninguno aplica; entonces manda el precio de lista.
 */
export function pickPriceBreak(
  breaks: PriceBreak[],
  quantity: number,
  at: Date = new Date(),
): PriceBreak | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  let best: PriceBreak | null = null;
  for (const pb of breaks) {
    if (!isBreakUsable(pb, at)) continue;
    if (!(quantity >= pb.cantidadMinima)) continue;
    if (
      !best ||
      pb.cantidadMinima > best.cantidadMinima ||
      (pb.cantidadMinima === best.cantidadMinima && pb.unitPrice < best.unitPrice)
    ) {
      best = pb;
    }
  }
  return best;
}

export type ResolvedPrice = {
  unitPrice: number;
  /** De dónde salió: escalón por volumen, descuento de convenio o lista. */
  origen: 'ESCALON' | 'DESCUENTO_BASE' | 'LISTA';
  cantidadMinima: number | null;
  priceBreakId: number | null;
  /** Ahorro contra el precio de lista, para justificar la compra. */
  ahorroUnitario: number;
};

/**
 * Precio unitario para una línea de compra.
 *
 * Orden: escalón por volumen → descuento de convenio → precio de lista. El
 * escalón gana porque ya es el precio negociado para ese volumen; encimarle el
 * descuento base lo contaría dos veces.
 */
export function resolveUnitPrice(input: {
  listPrice: number;
  quantity: number;
  breaks?: PriceBreak[];
  terms?: WholesaleTerms | null;
  at?: Date;
}): ResolvedPrice {
  const listPrice = Number(input.listPrice) || 0;
  const at = input.at ?? new Date();

  const pb = pickPriceBreak(input.breaks ?? [], input.quantity, at);
  if (pb) {
    return {
      unitPrice: round2(pb.unitPrice),
      origen: 'ESCALON',
      cantidadMinima: pb.cantidadMinima,
      priceBreakId: pb.id ?? null,
      ahorroUnitario: round2(Math.max(0, listPrice - pb.unitPrice)),
    };
  }

  const descuento = Number(input.terms?.descuentoBase ?? 0);
  if (descuento > 0 && descuento < 100) {
    const precio = round2(listPrice * (1 - descuento / 100));
    return {
      unitPrice: precio,
      origen: 'DESCUENTO_BASE',
      cantidadMinima: null,
      priceBreakId: null,
      ahorroUnitario: round2(listPrice - precio),
    };
  }

  return {
    unitPrice: round2(listPrice),
    origen: 'LISTA',
    cantidadMinima: null,
    priceBreakId: null,
    ahorroUnitario: 0,
  };
}

export type CreditStatus = {
  /** null = sin crédito pactado; se compra de contado. */
  limite: number | null;
  saldo: number;
  disponible: number | null;
  /** Cuánto se pasaría del límite esta compra. 0 si cabe. */
  excedente: number;
  /** true cuando la compra cabe en el crédito disponible. */
  dentroDelLimite: boolean;
  creditoDias: number | null;
};

/**
 * Crédito disponible con el mayorista.
 *
 * Sin límite pactado no hay nada que vigilar: se informa el saldo y ya. Esto
 * **avisa**, no bloquea — quién puede rebasar el límite es una decisión de
 * Dirección Administrativa, y el flujo de autorización de la OC ya existe.
 */
export function creditStatus(
  terms: WholesaleTerms | null | undefined,
  saldoActual: number,
  importeNuevaCompra = 0,
): CreditStatus {
  const saldo = round2(Math.max(0, Number(saldoActual) || 0));
  const limiteRaw = terms?.limiteCredito;
  const limite =
    limiteRaw === null || limiteRaw === undefined || !Number.isFinite(Number(limiteRaw))
      ? null
      : round2(Number(limiteRaw));

  if (limite === null || limite <= 0) {
    return {
      limite: null,
      saldo,
      disponible: null,
      excedente: 0,
      dentroDelLimite: true,
      creditoDias: terms?.creditoDias ?? null,
    };
  }

  const disponible = round2(limite - saldo);
  const compra = Math.max(0, Number(importeNuevaCompra) || 0);
  const excedente = round2(Math.max(0, saldo + compra - limite));

  return {
    limite,
    saldo,
    disponible,
    excedente,
    dentroDelLimite: excedente === 0,
    creditoDias: terms?.creditoDias ?? null,
  };
}

/**
 * Avisos previos a emitir la orden: pedido mínimo y crédito.
 *
 * Devuelve texto para mostrarle a quien compra, no excepciones: una orden que
 * no llega al mínimo o que roza el límite sigue siendo legítima —a veces urge—,
 * y quien la autoriza debe verlo, no chocarse con un 400.
 */
export function purchaseWarnings(input: {
  terms: WholesaleTerms | null | undefined;
  importe: number;
  credito: CreditStatus;
}): string[] {
  const avisos: string[] = [];
  const minimo = Number(input.terms?.pedidoMinimo ?? 0);

  if (minimo > 0 && input.importe < minimo) {
    avisos.push(
      `El pedido (${money(input.importe)}) no alcanza el mínimo pactado de ${money(minimo)}.`,
    );
  }

  if (!input.credito.dentroDelLimite) {
    avisos.push(
      `Excede el límite de crédito en ${money(input.credito.excedente)} ` +
        `(saldo ${money(input.credito.saldo)} de ${money(input.credito.limite ?? 0)}).`,
    );
  }

  return avisos;
}

/** Fecha de vencimiento según los días de crédito pactados. */
export function dueDateFromTerms(terms: WholesaleTerms | null | undefined, orderDate: Date): Date {
  const dias = Number(terms?.creditoDias ?? 0);
  const due = new Date(orderDate);
  if (Number.isFinite(dias) && dias > 0) due.setDate(due.getDate() + Math.floor(dias));
  return due;
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function money(n: number): string {
  return `$${round2(n).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}
