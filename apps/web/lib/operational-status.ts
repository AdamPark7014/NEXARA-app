/**
 * Estados operativos en español, lado cliente.
 *
 * Espejo de `apps/api/src/common/status/operational-status.ts`. Existe porque
 * distintos paneles llegaron a escribir grafías distintas del mismo estado
 * (`Pagado` en RRHH, `Pagada` en la tabla de multas), de modo que una multa
 * pagada desde un sitio seguía apareciendo pendiente en el otro.
 *
 * La API ya normaliza en la escritura; estas funciones cubren las filas
 * históricas que quedaron con la grafía antigua.
 */

export const PAYMENT_STATUS = {
  PENDIENTE: 'Pendiente',
  APROBADO: 'Aprobado',
  PAGADO: 'Pagado',
  RECHAZADO: 'Rechazado',
  CANCELADO: 'Cancelado',
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

const PAYMENT_ALIASES: Record<PaymentStatus, string[]> = {
  [PAYMENT_STATUS.PENDIENTE]: ['pendiente'],
  [PAYMENT_STATUS.APROBADO]: ['aprobado', 'aprobada'],
  [PAYMENT_STATUS.PAGADO]: ['pagado', 'pagada'],
  [PAYMENT_STATUS.RECHAZADO]: ['rechazado', 'rechazada'],
  [PAYMENT_STATUS.CANCELADO]: ['cancelado', 'cancelada'],
};

function normalizeKey(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/** Estado de pago canónico, o `null` si no se reconoce. */
export function normalizePaymentStatus(raw: unknown): PaymentStatus | null {
  const key = normalizeKey(raw);
  if (!key) return null;
  for (const [canonical, aliases] of Object.entries(PAYMENT_ALIASES) as Array<
    [PaymentStatus, string[]]
  >) {
    if (aliases.includes(key)) return canonical;
  }
  return null;
}

/** True si el valor representa "pagado", en cualquier grafía. */
export function isPaid(raw: unknown): boolean {
  return normalizePaymentStatus(raw) === PAYMENT_STATUS.PAGADO;
}

/** True si el valor representa "cancelado", en cualquier grafía. */
export function isCancelled(raw: unknown): boolean {
  return normalizePaymentStatus(raw) === PAYMENT_STATUS.CANCELADO;
}

/** True mientras la multa/gasto siga vivo: ni pagado ni cancelado. */
export function isOutstanding(raw: unknown): boolean {
  const status = normalizePaymentStatus(raw);
  return status !== PAYMENT_STATUS.PAGADO && status !== PAYMENT_STATUS.CANCELADO;
}
