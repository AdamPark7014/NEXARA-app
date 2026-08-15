/**
 * Vocabulario canónico de estados operativos en español.
 *
 * Varias columnas de estado son texto libre (`Fine.estatusPago`,
 * `Expense.estatusPago`, `Viatico.estatus`, `VehicleControl.estatusAprobacion`…)
 * y distintas pantallas llegaron a escribir grafías distintas para el mismo
 * estado. El caso comprobado: el panel de RRHH marcaba una multa como `Pagado`
 * mientras la tabla de multas escribía y leía `Pagada`, de modo que una multa
 * pagada desde un sitio seguía apareciendo pendiente en el otro.
 *
 * Aquí se fija el vocabulario y se normaliza en la escritura, para que la base
 * de datos deje de acumular variantes. La lectura es tolerante a las grafías
 * históricas ya almacenadas.
 */

export const PAYMENT_STATUS = {
  PENDIENTE: 'Pendiente',
  APROBADO: 'Aprobado',
  PAGADO: 'Pagado',
  RECHAZADO: 'Rechazado',
  CANCELADO: 'Cancelado',
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

export const APPROVAL_STATUS = {
  PENDIENTE: 'Pendiente',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
} as const;

export type ApprovalStatus = (typeof APPROVAL_STATUS)[keyof typeof APPROVAL_STATUS];

/** Grafías aceptadas por estado, comparadas ya normalizadas. */
const PAYMENT_ALIASES: Record<PaymentStatus, string[]> = {
  [PAYMENT_STATUS.PENDIENTE]: ['pendiente'],
  [PAYMENT_STATUS.APROBADO]: ['aprobado', 'aprobada'],
  [PAYMENT_STATUS.PAGADO]: ['pagado', 'pagada'],
  [PAYMENT_STATUS.RECHAZADO]: ['rechazado', 'rechazada'],
  [PAYMENT_STATUS.CANCELADO]: ['cancelado', 'cancelada'],
};

const APPROVAL_ALIASES: Record<ApprovalStatus, string[]> = {
  [APPROVAL_STATUS.PENDIENTE]: ['pendiente'],
  [APPROVAL_STATUS.APROBADO]: ['aprobado', 'aprobada'],
  [APPROVAL_STATUS.RECHAZADO]: ['rechazado', 'rechazada'],
};

function normalizeKey(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function resolve<T extends string>(raw: unknown, aliases: Record<T, string[]>): T | null {
  const key = normalizeKey(raw);
  if (!key) return null;
  for (const [canonical, list] of Object.entries(aliases) as Array<[T, string[]]>) {
    if (list.includes(key)) return canonical;
  }
  return null;
}

/** Estado de pago canónico, o `null` si el valor no se reconoce. */
export function normalizePaymentStatus(raw: unknown): PaymentStatus | null {
  return resolve(raw, PAYMENT_ALIASES);
}

/** Estado de aprobación canónico, o `null` si el valor no se reconoce. */
export function normalizeApprovalStatus(raw: unknown): ApprovalStatus | null {
  return resolve(raw, APPROVAL_ALIASES);
}

function variantsOf(canonical: string, aliases: string[]): string[] {
  const out = new Set<string>([canonical]);
  for (const alias of aliases) {
    out.add(alias.charAt(0).toUpperCase() + alias.slice(1));
  }
  return [...out];
}

/** Todas las grafías almacenadas equivalentes a un estado de pago. */
export function paymentStatusVariants(status: PaymentStatus): string[] {
  return variantsOf(status, PAYMENT_ALIASES[status] ?? []);
}

/** Todas las grafías almacenadas equivalentes a un estado de aprobación. */
export function approvalStatusVariants(status: ApprovalStatus): string[] {
  return variantsOf(status, APPROVAL_ALIASES[status] ?? []);
}

/** True si el valor almacenado representa "pagado", en cualquier grafía. */
export function isPaidStatus(raw: unknown): boolean {
  return normalizePaymentStatus(raw) === PAYMENT_STATUS.PAGADO;
}

/** True si el valor almacenado representa "aprobado", en cualquier grafía. */
export function isApprovedStatus(raw: unknown): boolean {
  return normalizeApprovalStatus(raw) === APPROVAL_STATUS.APROBADO;
}
