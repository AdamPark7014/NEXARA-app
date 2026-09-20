/**
 * Norma de empaque: capturar en cajas y guardar en piezas.
 *
 * Quien recibe material teclea lo que tiene enfrente —«3 cajas»—, no 300 piezas. El
 * inventario sigue llevándose en la unidad base del producto, así que el movimiento
 * guarda las dos cosas: lo que se tecleó (`cantidadCapturada` × `unidadCaptura`, con su
 * `factorConversion`) y el resultado en unidad base (`quantity`). Así la lista puede
 * decir «2 cajas · 24 pz» y la existencia nunca se descuadra.
 *
 * Aritmética pura: ni Prisma ni Decimal. `WarehouseService` convierte antes de escribir.
 */

/** Presentación tal como vive en `ProductPackaging`. */
export type Empaque = {
  id?: number;
  nombre: string;
  piezasPorUnidad: number;
  esDefaultCompra?: boolean | null;
  codigoBarras?: string | null;
};

/** Lo que manda un formulario de movimiento o de compra. */
export type CapturaEmpaque = {
  /** Id de `ProductPackaging`, cuando se eligió de la lista. */
  packagingId?: number | null;
  /** Nombre de la presentación, cuando se eligió por texto («Caja»). */
  unidadCaptura?: string | null;
  /** Lo que tecleó la persona, en esa presentación. */
  cantidadCapturada?: number | null;
  /** Cantidad directa en unidad base (lo de siempre). */
  quantity?: number | null;
};

/** Lo que se guarda en `StockMovement` / `PurchaseOrderItem`. */
export type ConversionEmpaque = {
  /** Siempre en unidad base. Es lo que mueve la existencia. */
  quantity: number;
  unidadCaptura: string | null;
  factorConversion: number | null;
  cantidadCapturada: number | null;
};

export const MAX_LARGO_UNIDAD = 60;

function numero(valor: unknown): number | null {
  if (valor == null || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** 4 decimales, igual que `Decimal(14,4)`. */
export function redondear4(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 10_000) / 10_000;
}

/** Compara nombres de presentación sin acentos ni mayúsculas: «Caja» == «caja». */
export function claveEmpaque(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * La presentación que pidió la captura. Primero por id (lo que manda la web), luego por
 * nombre (lo que mandan las apps y los importadores viejos).
 */
export function buscarEmpaque(
  empaques: readonly Empaque[],
  captura: Pick<CapturaEmpaque, 'packagingId' | 'unidadCaptura'>,
): Empaque | null {
  const id = numero(captura.packagingId);
  if (id != null) {
    const porId = empaques.find((e) => e.id === id);
    if (porId) return porId;
  }
  const nombre = (captura.unidadCaptura || '').trim();
  if (!nombre) return null;
  const clave = claveEmpaque(nombre);
  return empaques.find((e) => claveEmpaque(e.nombre) === clave) ?? null;
}

/** La que se propone al comprar: la marcada por defecto, si no la más grande. */
export function empaqueDeCompra(empaques: readonly Empaque[]): Empaque | null {
  if (!empaques.length) return null;
  const marcado = empaques.find((e) => e.esDefaultCompra);
  if (marcado) return marcado;
  return [...empaques].sort((a, b) => Number(b.piezasPorUnidad) - Number(a.piezasPorUnidad))[0] ?? null;
}

export class EmpaqueInvalidoError extends Error {}

/**
 * Convierte lo capturado a unidad base.
 *
 * - Sin presentación: se respeta `quantity` tal cual (el flujo de siempre).
 * - Con presentación: `quantity = cantidadCapturada × piezasPorUnidad`, y se conserva lo
 *   tecleado para poder enseñar «2 cajas · 24 pz» y para auditar.
 *
 * Lanza `EmpaqueInvalidoError` con mensaje en español cuando la captura no cuadra; el
 * servicio lo traduce a `BadRequestException`.
 */
export function convertirCaptura(
  captura: CapturaEmpaque,
  empaques: readonly Empaque[] = [],
): ConversionEmpaque {
  const pidioEmpaque =
    numero(captura.packagingId) != null || Boolean((captura.unidadCaptura || '').trim());

  if (!pidioEmpaque) {
    const cantidad = numero(captura.quantity);
    if (cantidad == null || cantidad <= 0) {
      throw new EmpaqueInvalidoError('La cantidad debe ser mayor a cero');
    }
    return {
      quantity: redondear4(cantidad),
      unidadCaptura: null,
      factorConversion: null,
      cantidadCapturada: null,
    };
  }

  const empaque = buscarEmpaque(empaques, captura);
  if (!empaque) {
    const nombre = (captura.unidadCaptura || '').trim();
    throw new EmpaqueInvalidoError(
      nombre
        ? `El producto no tiene registrada la presentación «${nombre}». Regístrala en el catálogo o captura en piezas.`
        : 'La presentación seleccionada ya no existe en el producto.',
    );
  }

  const factor = numero(empaque.piezasPorUnidad);
  if (factor == null || factor <= 0) {
    throw new EmpaqueInvalidoError(
      `La presentación «${empaque.nombre}» no dice cuántas piezas trae. Corrígela en el catálogo.`,
    );
  }

  const capturada = numero(captura.cantidadCapturada) ?? numero(captura.quantity);
  if (capturada == null || capturada <= 0) {
    throw new EmpaqueInvalidoError(`Indica cuántas ${empaque.nombre.toLowerCase()} son.`);
  }

  return {
    quantity: redondear4(capturada * factor),
    unidadCaptura: empaque.nombre.slice(0, MAX_LARGO_UNIDAD),
    factorConversion: redondear4(factor),
    cantidadCapturada: redondear4(capturada),
  };
}

/** Plural de andar por casa: «2 cajas», «1 caja», «3 rollos». */
export function pluralEmpaque(nombre: string, cantidad: number): string {
  const limpio = nombre.trim();
  if (!limpio) return limpio;
  if (Math.abs(cantidad - 1) < 1e-9) return limpio.toLowerCase();
  const bajo = limpio.toLowerCase();
  if (/[aeiou]$/.test(bajo)) return `${bajo}s`;
  if (/[zs]$/.test(bajo)) return `${bajo.replace(/z$/, 'c')}es`;
  return `${bajo}es`;
}

/** Número sin ceros de adorno: 2, 2.5, 0.25. */
export function cantidadLegible(valor: number): string {
  const n = redondear4(valor);
  return Number.isInteger(n) ? String(n) : String(n).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Lo que ve el almacenista en la lista de movimientos: «2 cajas · 24 pz».
 * Sin presentación devuelve solo la unidad base: «24 pz».
 */
export function etiquetaCantidad(
  movimiento: {
    quantity: number;
    unidadCaptura?: string | null;
    cantidadCapturada?: number | null;
  },
  unidadBase = 'pz',
): string {
  const base = numero(movimiento.quantity) ?? 0;
  const baseTexto = `${cantidadLegible(base)} ${unidadBase}`.trim();
  const capturada = numero(movimiento.cantidadCapturada);
  const unidad = (movimiento.unidadCaptura || '').trim();
  if (!unidad || capturada == null || capturada <= 0) return baseTexto;
  return `${cantidadLegible(capturada)} ${pluralEmpaque(unidad, capturada)} · ${baseTexto}`;
}
