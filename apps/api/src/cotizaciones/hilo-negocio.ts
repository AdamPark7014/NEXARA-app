/**
 * En qué va una cotización después de ganarse: cómo se aceptó, su factura y su cobro. La cadena que
 * enseñan la cotización y el proyecto sale de aquí (Mapa de Core, Bloque A).
 *
 * Módulo puro (sin Nest ni Prisma) para poder probarlo con jest.
 */

export const MEDIOS_ACEPTACION = ['FIRMA', 'WHATSAPP', 'CORREO', 'EN_PERSONA'] as const;
export type MedioAceptacion = (typeof MEDIOS_ACEPTACION)[number];

export type FacturaDelHilo = {
  id: number;
  status: string;
  isCancelled?: boolean | null;
  invoiceNumber?: string | null;
  cfdiSerie?: string | null;
  cfdiFolio?: string | null;
  totalAmount?: unknown;
  paidAmount?: unknown;
};

export type EstadoFactura = 'SIN_FACTURA' | 'BORRADOR' | 'FACTURADA';
export type EstadoCobro = 'PENDIENTE' | 'PARCIAL' | 'PAGADA';

export type Facturacion = {
  factura: { estado: EstadoFactura; id: number | null; folio: string | null };
  cobro: { estado: EstadoCobro };
};

export const FACTURACION_VACIA: Facturacion = {
  factura: { estado: 'SIN_FACTURA', id: null, folio: null },
  cobro: { estado: 'PENDIENTE' },
};

const SELLADA = new Set(['STAMPING', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE']);

function folioDe(f: FacturaDelHilo): string | null {
  const cfdi = [f.cfdiSerie, f.cfdiFolio].filter(Boolean).join('-');
  return cfdi || f.invoiceNumber || null;
}

/**
 * Lo que dicen las facturas de una cotización. Una cancelada o acreditada no cuenta, y un borrador
 * todavía no es factura. Con anticipos hay varias: se cobró cuando se cobraron todas.
 */
export function facturacionDe(facturas: readonly FacturaDelHilo[]): Facturacion {
  const vivas = facturas.filter((f) => !f.isCancelled && f.status !== 'CANCELLED' && f.status !== 'CREDITED');
  const selladas = vivas.filter((f) => SELLADA.has(f.status));
  if (!selladas.length) {
    const borrador = vivas.find((f) => f.status === 'DRAFT');
    return borrador
      ? { factura: { estado: 'BORRADOR', id: borrador.id, folio: folioDe(borrador) }, cobro: { estado: 'PENDIENTE' } }
      : FACTURACION_VACIA;
  }
  const ultima = selladas[selladas.length - 1]!;
  const pagadas = selladas.filter((f) => f.status === 'PAID').length;
  const conAbono = selladas.some((f) => f.status === 'PARTIALLY_PAID' || Number(f.paidAmount ?? 0) > 0);
  const cobro: EstadoCobro = pagadas === selladas.length ? 'PAGADA' : pagadas > 0 || conAbono ? 'PARCIAL' : 'PENDIENTE';
  return { factura: { estado: 'FACTURADA', id: ultima.id, folio: folioDe(ultima) }, cobro: { estado: cobro } };
}

/** Las partidas de la cotización, como el alcance del proyecto que nace de ella. */
export function alcanceDePartidas(
  items: ReadonlyArray<{ id: number; name?: string | null; qty?: number | null; unit?: string | null }>,
): Array<{ kind: 'ENTREGABLE'; titulo: string; detalle?: string; origenClave: string }> {
  return items.flatMap((item) => {
    const titulo = String(item.name ?? '').trim();
    if (!titulo) return [];
    const unidad = String(item.unit ?? '').trim();
    const detalle = item.qty ? [item.qty, unidad].filter(Boolean).join(' ') : unidad || undefined;
    return [{ kind: 'ENTREGABLE' as const, titulo: titulo.slice(0, 240), detalle, origenClave: `partida:${item.id}` }];
  });
}
