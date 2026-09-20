export const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  STAMPING: 'Timbrando',
  SENT: 'Enviada',
  PENDING: 'Pendiente',
  PARTIALLY_PAID: 'Pago parcial',
  PAID: 'Pagada',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
  CREDITED: 'Nota de crédito',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  RECEIVED: 'Recibida',
  ORDERED: 'Ordenada',
  OPEN: 'Abierta',
  CLOSED: 'Cerrada',
  POSTED: 'Contabilizada',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  PAID: 'Pagado',
  PARTIALLY_PAID: 'Pago parcial',
  CANCELLED: 'Cancelado',
  DRAFT: 'Borrador',
  MATCHED: 'Conciliada',
  UNMATCHED: 'Sin conciliar',
  VARIANCE: 'Diferencia',
  WAIVED: 'Eximida',
  NOT_REQUIRED: 'No requerida',
  ADJUSTED: 'Ajustada',
  SENT: 'Enviado',
  POSTED: 'Contabilizado',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
};

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: 'En curso',
  ACTIVE: 'Activo',
  ON_HOLD: 'En pausa',
  COMPLETED: 'Terminado',
  CLOSED: 'Cerrado',
  CANCELLED: 'Cancelado',
};

export function invoiceStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';

  const key = String(status).trim().toUpperCase();
  const label = INVOICE_STATUS_LABELS[key];

  if (label) return label;

  if (/^[A-Z_]+$/.test(status)) {
    return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  }

  return status;
}

export function paymentStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';

  const key = String(status).trim().toUpperCase();
  const label = PAYMENT_STATUS_LABELS[key];

  if (label) return label;

  if (/^[A-Z_]+$/.test(status)) {
    return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  }

  return status;
}

export function financeStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';

  const key = String(status).trim().toUpperCase();
  const invoiceLabel = INVOICE_STATUS_LABELS[key];
  if (invoiceLabel) return invoiceLabel;

  const paymentLabel = PAYMENT_STATUS_LABELS[key];
  if (paymentLabel) return paymentLabel;

  const projectLabel = PROJECT_STATUS_LABELS[key];
  if (projectLabel) return projectLabel;

  if (/^[A-Z_]+$/.test(status)) {
    return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  }

  return status;
}

export const financeMatchLabel = paymentStatusLabel;