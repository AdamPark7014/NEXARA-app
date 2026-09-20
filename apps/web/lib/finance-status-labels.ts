/**
 * Etiquetas en español para las claves que viajan por la API de contabilidad.
 *
 * Regla: la clave **no se cambia** —es contrato con el servidor—; se traduce al
 * pintarla. Si una clave no está en la tabla se devuelve lo que llegó, legible:
 * preferimos un dato crudo a inventar una traducción.
 *
 * Todo lo que traduzca un enum de contabilidad vive aquí, para que dos
 * pantallas hermanas no llamen distinto a la misma cosa.
 */
export const FINANCE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  STAMPING: "Timbrando",
  SENT: "Enviada",
  PARTIALLY_PAID: "Pago parcial",
  PAID: "Pagada",
  OVERDUE: "Vencida",
  CANCELLED: "Cancelada",
  CREDITED: "Nota de crédito",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
  RECEIVED: "Recibida",
  ORDERED: "Ordenada",
  OPEN: "Abierta",
  CLOSED: "Cerrada",
  PENDING: "Pendiente",
  IN_PROGRESS: "En curso",
  ACTIVE: "Activo",
  ON_HOLD: "En pausa",
  COMPLETED: "Terminado",
  NOT_REQUIRED: "No requerida",
  MATCHED: "Conciliada",
  VARIANCE: "Diferencia",
  WAIVED: "Eximida",
  UNMATCHED: "Sin conciliar",
  ADJUSTED: "Ajustada",
  POSTED: "Contabilizada",
  IGNORED: "Ignorada",
  PARTIAL: "Parcial",
  PLANNED: "Planeado",
  CANCELED: "Cancelada",
};

export function financeStatusLabel(status: string | null | undefined): string {
  const raw = (status ?? "").trim();
  if (!raw) return "—";
  const key = raw.toUpperCase();
  const known = FINANCE_STATUS_LABELS[key];
  if (known) return known;
  // Ya viene en español u otra etiqueta humana: no tocar.
  if (raw !== key) return raw;
  if (/^[A-Z][A-Z0-9_]*$/.test(key)) {
    return key
      .split("_")
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(" ");
  }
  return raw;
}

/**
 * Cómo se movió el dinero. La clave es la del sistema (`BANK_TRANSFER`); quien
 * cobra lee «Transferencia».
 */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  SPEI: "SPEI",
  BANK_TRANSFER: "Transferencia",
  TRANSFER: "Transferencia",
  WIRE: "Transferencia",
  CASH: "Efectivo",
  CHECK: "Cheque",
  CHEQUE: "Cheque",
  CREDIT_CARD: "Tarjeta de crédito",
  CARD_CREDIT: "Tarjeta de crédito",
  DEBIT_CARD: "Tarjeta de débito",
  CARD_DEBIT: "Tarjeta de débito",
  CARD: "Tarjeta",
  DOMICILIACION: "Domiciliación",
  DIRECT_DEBIT: "Domiciliación",
  COMPENSATION: "Compensación",
  OTHER: "Otro",
};

export function paymentMethodLabel(method: string | null | undefined): string {
  const raw = (method ?? "").trim();
  if (!raw) return "—";
  return PAYMENT_METHOD_LABELS[raw.toUpperCase()] ?? financeStatusLabel(raw);
}

/**
 * Claves del SAT que viajan en el CFDI. Enseñarle «PPD» a quien factura está
 * bien —viene impreso en su factura—; enseñarle solo el número, no. Por eso se
 * pinta la clave **y** lo que significa.
 */
export const SAT_METODO_PAGO: Record<string, string> = {
  PUE: "PUE · pago en una sola exhibición",
  PPD: "PPD · pago en parcialidades o diferido",
};

export function satMetodoPagoLabel(clave: string | null | undefined): string {
  const raw = (clave ?? "").trim();
  if (!raw) return "—";
  return SAT_METODO_PAGO[raw.toUpperCase()] ?? raw;
}

/** Catálogo `c_FormaPago` del SAT — las claves que de verdad se usan. */
export const SAT_FORMA_PAGO: Record<string, string> = {
  "01": "01 · Efectivo",
  "02": "02 · Cheque nominativo",
  "03": "03 · Transferencia electrónica",
  "04": "04 · Tarjeta de crédito",
  "05": "05 · Monedero electrónico",
  "06": "06 · Dinero electrónico",
  "08": "08 · Vales de despensa",
  "12": "12 · Dación en pago",
  "15": "15 · Condonación",
  "17": "17 · Compensación",
  "23": "23 · Novación",
  "28": "28 · Tarjeta de débito",
  "29": "29 · Tarjeta de servicios",
  "30": "30 · Aplicación de anticipos",
  "99": "99 · Por definir",
};

export function satFormaPagoLabel(clave: string | null | undefined): string {
  const raw = (clave ?? "").trim();
  if (!raw) return "—";
  return SAT_FORMA_PAGO[raw.padStart(2, "0")] ?? raw;
}

/** Catálogo `c_UsoCFDI` del SAT — para qué dijo el receptor que usaría la factura. */
export const SAT_USO_CFDI: Record<string, string> = {
  G01: "G01 · Adquisición de mercancías",
  G02: "G02 · Devoluciones, descuentos o bonificaciones",
  G03: "G03 · Gastos en general",
  I01: "I01 · Construcciones",
  I02: "I02 · Mobiliario y equipo de oficina",
  I03: "I03 · Equipo de transporte",
  I04: "I04 · Equipo de cómputo",
  I05: "I05 · Herramienta y equipo",
  I06: "I06 · Comunicaciones telefónicas",
  I08: "I08 · Otra maquinaria y equipo",
  D01: "D01 · Honorarios médicos",
  D10: "D10 · Colegiaturas",
  P01: "P01 · Por definir",
  S01: "S01 · Sin efectos fiscales",
  CP01: "CP01 · Pagos",
  CN01: "CN01 · Nómina",
};

export function satUsoCfdiLabel(clave: string | null | undefined): string {
  const raw = (clave ?? "").trim();
  if (!raw) return "—";
  return SAT_USO_CFDI[raw.toUpperCase()] ?? raw;
}

/** Catálogo de motivos de cancelación del SAT: cuatro claves, y ninguna se explica sola. */
export const SAT_MOTIVO_CANCELACION: Record<string, string> = {
  "01": "se emitió con errores y se sustituyó por otra factura",
  "02": "se emitió con errores y no se sustituyó",
  "03": "la operación no se llevó a cabo",
  "04": "la operación ya está en una factura global",
};

export function satMotivoCancelacionLabel(clave: string | null | undefined): string | null {
  const raw = (clave ?? "").trim();
  if (!raw) return null;
  return SAT_MOTIVO_CANCELACION[raw.padStart(2, "0")] ?? raw;
}

/**
 * Bitácora de auditoría. El servidor guarda `CREATE` / `Invoice`; quien revisa
 * quiere leer «Alta» y «Factura».
 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  CREATE: "Alta",
  CREATED: "Alta",
  UPDATE: "Cambio",
  UPDATED: "Cambio",
  DELETE: "Baja",
  DELETED: "Baja",
  DELETEMANY: "Baja en lote",
  UPDATEMANY: "Cambio en lote",
  APPROVE: "Autorización",
  APPROVE_STEP: "Autorización de un paso",
  APPROVE_WORKFLOW: "Autorización completa",
  REJECT: "Rechazo",
  ACK: "Enterado",
  EXPORT: "Exportación",
  MARK_PAID: "Marcada como pagada",
  PERIOD_CLOSE: "Cierre de periodo",
  REQUEST_REOPEN: "Petición de reapertura",
  CONFIRM_RESOLVED: "Confirmación de resuelto",
  LOGIN_SUCCESS: "Entrada al sistema",
  LOGIN_FAILED: "Intento de entrada fallido",
  FORCE_LOGOUT: "Salida forzada",
  JOURNAL_FAILED: "Falló el asiento contable",
  AP_INVOICE_FAILED: "Falló la factura de proveedor",
  NOTIFY: "Aviso enviado",
  CHECKOUT: "Salida registrada",
  FINDFIRST: "Consulta",
};

export function auditActionLabel(action: string | null | undefined): string {
  const raw = (action ?? "").trim();
  if (!raw) return "—";
  return AUDIT_ACTION_LABELS[raw.toUpperCase()] ?? financeStatusLabel(raw);
}

/** Qué se tocó. Los nombres del modelo son ingleses; la bitácora no tiene por qué serlo. */
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  INVOICE: "Factura",
  PAYMENT: "Pago",
  EXPENSE: "Gasto",
  JOURNALENTRY: "Póliza",
  FISCALPERIOD: "Periodo fiscal",
  PURCHASEORDER: "Orden de compra",
  PURCHASEREQUISITION: "Requisición de compra",
  GOODSRECEIPT: "Entrada de almacén",
  SUPPLIER: "Proveedor",
  SALESCLIENT: "Cliente",
  SALESLEAD: "Prospecto",
  SALESOPPORTUNITY: "Oportunidad",
  SALESPROJECT: "Proyecto",
  COTIZACION: "Cotización",
  ACTIVITY: "Actividad",
  ATTENDANCE: "Asistencia",
  ATTENDANCEJUSTIFICATION: "Justificación de asistencia",
  EMPLOYEEPAYMENT: "Pago a personal",
  LUNCHBREAK: "Comida",
  FINE: "Multa",
  STOCKLEVEL: "Existencias",
  STOCKMOVEMENT: "Movimiento de almacén",
  MAINTENANCEORDER: "Orden de mantenimiento",
  MAINTENANCECONTRACTVISIT: "Visita de contrato",
  TOOLREQUEST: "Solicitud de herramienta",
  TOOLRENEWAL: "Renovación de herramienta",
  TOOLKITASSIGNMENT: "Asignación de herramienta",
  CLIENTTICKETREQUEST: "Solicitud del cliente",
  AUTH: "Acceso",
  PORTALAUTH: "Acceso al portal",
  USER: "Usuario",
  EXPORT: "Exportación",
  INVENTORY: "Inventario",
  CAMERA: "Cámara",
};

export function auditEntityLabel(entity: string | null | undefined): string {
  const raw = (entity ?? "").trim();
  if (!raw) return "—";
  return AUDIT_ENTITY_LABELS[raw.toUpperCase()] ?? raw;
}

/**
 * Nombres de campo del modelo, tal como quedan guardados en la bitácora. Los
 * que salen en contabilidad se traducen; el resto se deja legible —separado en
 * palabras— en vez de inventarle un nombre en español.
 */
export const AUDIT_FIELD_LABELS: Record<string, string> = {
  amount: "Monto",
  totalamount: "Total",
  paidamount: "Pagado",
  subtotal: "Subtotal",
  taxamount: "Impuestos",
  balance: "Saldo",
  currency: "Moneda",
  exchangerate: "Tipo de cambio",
  status: "Estado",
  type: "Tipo",
  invoicenumber: "Folio",
  folio: "Folio",
  cfdiuuid: "Folio fiscal",
  uuid: "Folio fiscal",
  cfdixml: "Archivo XML",
  cfdiusage: "Para qué se usa",
  satpaymentform: "Cómo se paga",
  satpaymentmethod: "Cuándo se paga",
  cancelreason: "Motivo de cancelación",
  issuedate: "Fecha de emisión",
  duedate: "Fecha de vencimiento",
  paymentdate: "Fecha de pago",
  startdate: "Inicio",
  enddate: "Fin",
  isclosed: "Cerrado",
  closedat: "Cerrado el",
  name: "Nombre",
  description: "Descripción",
  notes: "Notas",
  reference: "Referencia",
  method: "Forma de pago",
  rfc: "RFC",
  email: "Correo",
  phone: "Teléfono",
  isactive: "Activo",
  creditdays: "Días de crédito",
  creditlimit: "Límite de crédito",
  supplierid: "Proveedor",
  clientid: "Cliente",
  projectid: "Proyecto",
  companyid: "Empresa",
  userid: "Usuario",
  createdat: "Dado de alta",
  updatedat: "Última modificación",
};

export function auditFieldLabel(field: string | null | undefined): string {
  const raw = (field ?? "").trim();
  if (!raw) return "—";
  const known = AUDIT_FIELD_LABELS[raw.toLowerCase()];
  if (known) return known;
  // Sin traducción: al menos se separa en palabras, para que `satPaymentForm`
  // no se lea como una sola. No se traduce lo que no está en la tabla.
  const palabras = raw
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return palabras.charAt(0).toUpperCase() + palabras.slice(1);
}
