/**
 * Catálogo de series de folio.
 *
 * Cada serie dice de qué tabla se siembra el contador la primera vez y cómo se
 * formatea el número. Los nombres de tabla y columna se interpolan en SQL como
 * identificadores, así que **sólo pueden salir de aquí**: nunca de la petición.
 */

export type SerieKey =
  | 'JOURNAL_ENTRY'
  | 'INVOICE'
  | 'MAINTENANCE_ORDER'
  | 'MAINTENANCE_CONTRACT'
  | 'PURCHASE_REQUISITION'
  | 'PURCHASE_ORDER'
  | 'GOODS_RECEIPT'
  | 'PURCHASE_RFQ'
  | 'TENDER'
  | 'STOCK_MOVEMENT'
  | 'CYCLE_COUNT'
  | 'MANAGED_DOCUMENT';

export type SerieDef = {
  /** Tabla física de donde se siembra el contador. */
  tabla: string;
  /** Columna que guarda el folio. */
  columna: string;
  /** Prefijo fijo, o función si depende de la fecha (licitaciones van por año). */
  prefijo: string | ((at: Date) => string);
  /** Dígitos del consecutivo. */
  ancho: number;
};

export const FOLIO_SERIES: Record<SerieKey, SerieDef> = {
  JOURNAL_ENTRY: { tabla: 'journal_entries', columna: 'entryNumber', prefijo: 'JE-', ancho: 6 },
  INVOICE: { tabla: 'invoices', columna: 'invoiceNumber', prefijo: 'INV-', ancho: 6 },
  MAINTENANCE_ORDER: { tabla: 'maintenance_orders', columna: 'orderNumber', prefijo: 'MO-', ancho: 6 },
  MAINTENANCE_CONTRACT: {
    tabla: 'maintenance_contracts',
    columna: 'contractNumber',
    prefijo: 'MC-',
    ancho: 5,
  },
  PURCHASE_REQUISITION: {
    tabla: 'purchase_requisitions',
    columna: 'reqNumber',
    prefijo: 'REQ-',
    ancho: 6,
  },
  PURCHASE_ORDER: { tabla: 'purchase_orders', columna: 'poNumber', prefijo: 'PO-', ancho: 6 },
  GOODS_RECEIPT: { tabla: 'goods_receipts', columna: 'receiptNumber', prefijo: 'GR-', ancho: 6 },
  PURCHASE_RFQ: { tabla: 'purchase_rfqs', columna: 'rfqNumber', prefijo: 'RFQ-', ancho: 6 },
  // Las licitaciones reinician cada año: la serie incluye el año, así que el
  // contador de 2027 nace en cero sin tocar el de 2026.
  TENDER: {
    tabla: 'tenders',
    columna: 'tenderNumber',
    prefijo: (at) => `LIC-${at.getFullYear()}-`,
    ancho: 5,
  },
  STOCK_MOVEMENT: { tabla: 'stock_movements', columna: 'movementNumber', prefijo: 'SM-', ancho: 6 },
  CYCLE_COUNT: { tabla: 'cycle_counts', columna: 'countNumber', prefijo: 'CC-', ancho: 6 },
  MANAGED_DOCUMENT: {
    tabla: 'managed_documents',
    columna: 'documentNumber',
    prefijo: 'DOC-',
    ancho: 6,
  },
};

/** Prefijo efectivo de una serie en un momento dado. */
export function resolvePrefijo(serie: SerieKey, at: Date = new Date()): string {
  const def = FOLIO_SERIES[serie];
  return typeof def.prefijo === 'function' ? def.prefijo(at) : def.prefijo;
}

/** Formatea el consecutivo con su prefijo. */
export function formatFolio(serie: SerieKey, valor: number, at: Date = new Date()): string {
  const def = FOLIO_SERIES[serie];
  return `${resolvePrefijo(serie, at)}${String(valor).padStart(def.ancho, '0')}`;
}

/**
 * Identificadores SQL válidos: sin comillas, sin espacios, sin punto y coma.
 *
 * El catálogo es una constante del código, pero esto convierte "confía en el
 * autor" en algo que la máquina comprueba: si alguien añade una serie con un
 * nombre raro, revienta al arrancar y no en una inyección.
 */
export function assertIdentificadorSeguro(nombre: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nombre)) {
    throw new Error(`Identificador SQL inválido en el catálogo de folios: ${nombre}`);
  }
  return nombre;
}
