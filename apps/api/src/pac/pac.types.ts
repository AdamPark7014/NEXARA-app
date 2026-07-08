/**
 * Tipos compartidos del módulo PAC (Proveedor Autorizado de Certificación).
 * Cada adapter (Facturama, SW Sapien, Finkok, Mock) implementa `IPacAdapter`.
 */

export type PacProvider = 'mock' | 'facturama' | 'sw' | 'finkok';

export interface PacStampInput {
  /** Folio interno del ERP — se mapea a `Folio` en CFDI 4.0. */
  invoiceNumber: string;
  /** Serie del CFDI (ej. "A"). */
  serie?: string | null;
  /** Folio del CFDI (numérico). Si se omite, se usa el sufijo numérico del invoiceNumber. */
  folio?: string | null;
  total: number;
  subtotal: number;
  taxTotal: number;
  currency: string;
  exchangeRate?: number | null;
  paymentForm?: string | null;
  paymentMethod?: string | null;
  cfdiUsage?: string | null;
  /** Tipo de comprobante: I = Ingreso (factura), E = Egreso (nota de crédito). */
  tipoComprobante?: 'I' | 'E';
  /** UUIDs relacionados (para notas de crédito / sustituciones). */
  relatedUuids?: string[];
  /** Tipo de relación SAT (01 = nota de crédito, 04 = sustitución, etc.). */
  relationType?: string;
  emisor: {
    rfc: string;
    name: string;
    regime?: string | null;
    zipCode?: string | null;
  };
  receptor: {
    rfc: string;
    name: string;
    zipCode?: string | null;
    regime?: string | null;
  };
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
    taxRate?: number;
    satProductKey?: string | null;
    satUnitKey?: string | null;
    zipCode?: string | null;
    unitName?: string | null;
    ivaRetAmount?: number;
    isrRetAmount?: number;
    iepsAmount?: number;
    iepsRate?: number;
  }>;
}

/** Entrada para timbrar un Complemento de Pago (CFDI tipo P, Pagos 2.0). */
export interface PacPaymentComplementInput {
  invoiceNumber: string;
  serie?: string | null;
  folio?: string | null;
  emisor: { rfc: string; name: string; regime?: string | null; zipCode?: string | null };
  receptor: { rfc: string; name: string; zipCode?: string | null; regime?: string | null };
  payment: {
    date: string; // ISO
    paymentForm: string; // FP01, FP03...
    amount: number;
    currency: string;
    exchangeRate?: number | null;
    operationNumber?: string | null;
  };
  /** Documentos relacionados que este pago liquida. */
  relatedDocs: Array<{
    uuid: string;
    serie?: string | null;
    folio?: string | null;
    currency: string;
    paymentMethod: string; // PPD
    partialityNumber: number; // NumParcialidad
    previousBalance: number; // ImpSaldoAnt
    amountPaid: number; // ImpPagado
    remainingBalance: number; // ImpSaldoInsoluto
  }>;
}

export interface PacStampResult {
  /** Folio fiscal CFDI 4.0 (UUID). */
  uuid: string;
  /** Fecha oficial de timbrado en hora local SAT. */
  stampedAt: Date;
  /** Número de certificado SAT (20 dígitos). */
  satCertNumber: string;
  /** XML CFDI 4.0 timbrado (raw). */
  xml: string;
  /** Selo digital del CFDI. */
  satSignature?: string | null;
  /** PDF URL si el PAC también genera la representación impresa. */
  pdfUrl?: string | null;
  /** Provider que efectuó el timbrado. */
  provider: PacProvider;
}

export interface PacCancelInput {
  uuid: string;
  emisorRfc: string;
  /** Motivo SAT 4.0: 01, 02, 03 o 04. */
  cancelReason: '01' | '02' | '03' | '04';
  /** UUID sustituto cuando cancelReason = 01. */
  substitutionUuid?: string | null;
}

export interface PacCancelResult {
  accepted: boolean;
  acuse?: string | null;
  cancelledAt: Date;
  provider: PacProvider;
}

export interface IPacAdapter {
  readonly provider: PacProvider;
  stamp(input: PacStampInput): Promise<PacStampResult>;
  cancel(input: PacCancelInput): Promise<PacCancelResult>;
  /** Timbra un Complemento de Pago (CFDI tipo P). Opcional por adapter. */
  stampPayment?(input: PacPaymentComplementInput): Promise<PacStampResult>;
}
