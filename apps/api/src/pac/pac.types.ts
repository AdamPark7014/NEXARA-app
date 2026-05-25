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
  emisor: {
    rfc: string;
    name: string;
    regime?: string | null;
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
    unitName?: string | null;
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
}
