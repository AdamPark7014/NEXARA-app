import {
  APPROVAL_STATUS,
  PAYMENT_STATUS,
  approvalStatusVariants,
  isApprovedStatus,
  isPaidStatus,
  normalizeApprovalStatus,
  normalizePaymentStatus,
  paymentStatusVariants,
} from './operational-status.js';

describe('normalizePaymentStatus', () => {
  it('unifica las dos grafías de pagado', () => {
    // El fallo real: RRHH escribía 'Pagado' y la tabla de multas 'Pagada',
    // así que una multa pagada seguía apareciendo pendiente en el otro panel.
    expect(normalizePaymentStatus('Pagado')).toBe(PAYMENT_STATUS.PAGADO);
    expect(normalizePaymentStatus('Pagada')).toBe(PAYMENT_STATUS.PAGADO);
  });

  it('unifica el resto de variantes de género', () => {
    expect(normalizePaymentStatus('Aprobada')).toBe(PAYMENT_STATUS.APROBADO);
    expect(normalizePaymentStatus('Rechazada')).toBe(PAYMENT_STATUS.RECHAZADO);
    expect(normalizePaymentStatus('Cancelada')).toBe(PAYMENT_STATUS.CANCELADO);
  });

  it('tolera mayúsculas y espacios', () => {
    expect(normalizePaymentStatus('  PAGADO  ')).toBe(PAYMENT_STATUS.PAGADO);
    expect(normalizePaymentStatus('pagada')).toBe(PAYMENT_STATUS.PAGADO);
  });

  it('rechaza valores desconocidos', () => {
    // El servicio de multas lo usa para validar la escritura: un valor inventado
    // debe fallar en vez de guardarse.
    expect(normalizePaymentStatus('Semipagado')).toBeNull();
    expect(normalizePaymentStatus('')).toBeNull();
    expect(normalizePaymentStatus(null)).toBeNull();
    expect(normalizePaymentStatus(undefined)).toBeNull();
  });
});

describe('normalizeApprovalStatus', () => {
  it('unifica las grafías de aprobación', () => {
    expect(normalizeApprovalStatus('Aprobado')).toBe(APPROVAL_STATUS.APROBADO);
    expect(normalizeApprovalStatus('Aprobada')).toBe(APPROVAL_STATUS.APROBADO);
    expect(normalizeApprovalStatus('Rechazada')).toBe(APPROVAL_STATUS.RECHAZADO);
  });

  it('no acepta estados de pago que no son de aprobación', () => {
    expect(normalizeApprovalStatus('Pagado')).toBeNull();
    expect(normalizeApprovalStatus('Cancelado')).toBeNull();
  });
});

describe('helpers de lectura', () => {
  it('isPaidStatus reconoce ambas grafías', () => {
    expect(isPaidStatus('Pagado')).toBe(true);
    expect(isPaidStatus('Pagada')).toBe(true);
    expect(isPaidStatus('Pendiente')).toBe(false);
    expect(isPaidStatus('Aprobado')).toBe(false);
  });

  it('isApprovedStatus distingue aprobado de pagado', () => {
    expect(isApprovedStatus('Aprobada')).toBe(true);
    expect(isApprovedStatus('Pagado')).toBe(false);
  });
});

describe('variantes para consultas', () => {
  it('las de pago incluyen ambas grafías', () => {
    const variants = paymentStatusVariants(PAYMENT_STATUS.PAGADO);
    expect(variants).toEqual(expect.arrayContaining(['Pagado', 'Pagada']));
  });

  it('las de aprobación incluyen ambas grafías', () => {
    const variants = approvalStatusVariants(APPROVAL_STATUS.APROBADO);
    expect(variants).toEqual(expect.arrayContaining(['Aprobado', 'Aprobada']));
  });

  it('no repiten valores', () => {
    const variants = paymentStatusVariants(PAYMENT_STATUS.PENDIENTE);
    expect(new Set(variants).size).toBe(variants.length);
  });
});
