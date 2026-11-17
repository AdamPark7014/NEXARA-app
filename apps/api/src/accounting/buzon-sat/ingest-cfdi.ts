/**
 * Reglas puras para ingerir un CFDI del buzón SAT como Invoice (idempotente por UUID).
 */
import type { CfdiLeido } from '../mesa-contable/cfdi-xml.js';

export type SentidoCfdi = 'recibido' | 'emitido';

export function sentidoCfdi(cfdi: CfdiLeido, rfcEmpresa: string): SentidoCfdi {
  const emp = rfcEmpresa.trim().toUpperCase();
  if (cfdi.emisor.rfc === emp) return 'emitido';
  return 'recibido';
}

export function coincideImporte(a: number, b: number, pct = 0.01): boolean {
  const base = Math.max(Math.abs(a), Math.abs(b), 0.01);
  return Math.abs(a - b) / base <= pct;
}

export function dentroDeDias(fechaA: string, fechaB: string, dias = 7): boolean {
  const a = Date.parse(`${fechaA.slice(0, 10)}T12:00:00Z`);
  const b = Date.parse(`${fechaB.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= dias * 86_400_000;
}

export type DatosInvoiceDesdeCfdi = {
  invoiceNumber: string;
  type: 'ACCOUNTS_PAYABLE' | 'ACCOUNTS_RECEIVABLE';
  status: 'SENT' | 'PAID' | 'CANCELLED';
  issueDate: Date;
  dueDate: Date;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  currency: string;
  cfdiUuid: string;
  cfdiXml: string;
  cfdiVersion: string;
  cfdiSerie: string | null;
  cfdiFolio: string | null;
  emisorRfc: string;
  emisorName: string | null;
  receptorRfc: string;
  receptorName: string | null;
  receptorZipCode: string | null;
  ivaRetenido: number;
  isrRetenido: number;
  origenSat: boolean;
  satEstatus: 'vigente' | 'cancelado';
  isCancelled: boolean;
  notes: string;
};

export function datosInvoiceDesdeCfdi(
  cfdi: CfdiLeido,
  xml: string,
  sentido: SentidoCfdi,
  cancelado = false,
): DatosInvoiceDesdeCfdi {
  const fecha = new Date(`${cfdi.fecha || '1970-01-01'}T12:00:00Z`);
  const recibido = sentido === 'recibido';
  return {
    invoiceNumber: `SAT-${cfdi.uuid.slice(0, 8)}`,
    type: recibido ? 'ACCOUNTS_PAYABLE' : 'ACCOUNTS_RECEIVABLE',
    status: cancelado ? 'CANCELLED' : 'SENT',
    issueDate: fecha,
    dueDate: new Date(fecha.getTime() + 30 * 86_400_000),
    subtotal: Math.round((cfdi.subtotal - cfdi.descuento) * 100) / 100,
    taxAmount: Math.round((cfdi.iva + cfdi.otrosTraslados) * 100) / 100,
    totalAmount: cfdi.total,
    paidAmount: 0,
    currency: cfdi.moneda || 'MXN',
    cfdiUuid: cfdi.uuid,
    cfdiXml: xml,
    cfdiVersion: cfdi.version || '4.0',
    cfdiSerie: cfdi.serie,
    cfdiFolio: cfdi.folio,
    emisorRfc: cfdi.emisor.rfc,
    emisorName: cfdi.emisor.nombre,
    receptorRfc: cfdi.receptor.rfc,
    receptorName: cfdi.receptor.nombre,
    receptorZipCode: cfdi.receptor.cp,
    ivaRetenido: cfdi.ivaRetenido,
    isrRetenido: cfdi.isrRetenido,
    origenSat: true,
    satEstatus: cancelado ? 'cancelado' : 'vigente',
    isCancelled: cancelado,
    notes: `Buzón SAT · ${sentido} · ${cfdi.tipo}`,
  };
}
