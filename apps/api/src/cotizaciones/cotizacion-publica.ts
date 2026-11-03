/**
 * Lo que ve el cliente en el enlace de firma. No pide sesión: lo lee cualquiera que tenga el enlace.
 *
 * Lista blanca: ni costo, ni margen, ni proveedor. Los importes son los del PDF del cliente, donde el
 * precio de cada partida ya trae el margen general; con el precio guardado, la diferencia contra el
 * total lo delataría. IEPS y retención tampoco salen, porque ese PDF no los imprime.
 *
 * Puro, con pruebas.
 */
import { formatoDesdeCotizacion } from './cotizacion-formato-nexara.js';
import { puedeFirmarse } from './estado-cotizacion.js';

/** Un borrador con enlace ya salió antes y lo están corrigiendo: el cliente no ve precios a medio escribir. */
export const EN_REVISION = 'Esta cotización está en revisión. Tu asesor te enviará la versión actualizada.';

type CotizacionDelFormato = Parameters<typeof formatoDesdeCotizacion>[0];

export function vistaPublica(
  quote: CotizacionDelFormato & {
    quoteNumber: string;
    issueDate: Date | string;
    validUntil?: Date | string | null;
    status: unknown;
    clientName?: string | null;
    clientCompany?: string | null;
    clientEmail?: string | null;
    projectName?: string | null;
  },
  hoy?: Date,
) {
  const pdf = formatoDesdeCotizacion(quote);
  const permiso = puedeFirmarse({ estado: quote.status, validUntil: quote.validUntil, hoy });
  return {
    quoteNumber: quote.quoteNumber,
    issueDate: quote.issueDate,
    validUntil: quote.validUntil ?? null,
    status: quote.status,
    clientName: quote.clientName ?? null,
    clientCompany: quote.clientCompany ?? null,
    clientEmail: quote.clientEmail ?? null,
    projectName: quote.projectName ?? null,
    currency: pdf.moneda,
    subtotal: pdf.subtotal,
    taxTotal: pdf.iva,
    total: pdf.total,
    items: pdf.partidas.map((p, i) => ({
      id: i + 1,
      name: p.titulo,
      qty: p.cantidad,
      unitPrice: p.precioUnitario,
      lineTotal: p.importe,
    })),
    /** Por qué ya no se firma; `null` si sigue abierta. */
    motivoSinFirma: permiso.ok ? null : (permiso.motivo ?? null),
  };
}
