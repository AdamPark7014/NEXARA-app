import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_MATCH_CONFIG,
  ReconciliationMatchService,
  classifyMovement,
  folioAppearsIn,
  matchBankMovements,
  scoreCandidate,
  summarizeMatches,
  type BankMovementInput,
  type NexaraCandidateInput,
} from './reconciliation-match.service.js';
import { ReconciliationMatchController } from './reconciliation-match.controller.js';
import { PERMISSIONS } from '../common/permissions.js';

/**
 * Conciliación bancaria — motor de sugerencias.
 *
 * Tres bloques, en orden de importancia:
 *   1. El motor puro: qué empareja, qué descarta y con qué razones.
 *   2. El aislamiento por empresa: ninguna consulta sale sin `companyId`, y
 *      un id de otra empresa no se puede conciliar (hubo un incidente).
 *   3. El contrato de autorización declarado en el controlador.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

function movimiento(over: Partial<BankMovementInput> = {}): BankMovementInput {
  return {
    id: 1,
    date: '2026-09-10',
    amount: 5800,
    isDebit: false,
    description: 'SPEI RECIBIDO',
    ...over,
  };
}

function factura(over: Partial<NexaraCandidateInput> = {}): NexaraCandidateInput {
  return {
    id: 100,
    kind: 'INVOICE',
    folio: 'F-182',
    date: '2026-09-10',
    amount: 5800,
    direction: 'IN',
    ...over,
  };
}

// ── 1. Motor puro ───────────────────────────────────────────────────────────

describe('motor de conciliación — reglas de emparejamiento', () => {
  it('monto exacto y mismo día: sugerencia alta con la razón "monto exacto"', () => {
    const [match] = matchBankMovements([movimiento()], [factura()]);
    expect(match.state).toBe('SUGERENCIA_ALTA');
    expect(match.best?.score).toBeGreaterThanOrEqual(DEFAULT_MATCH_CONFIG.highConfidenceScore);
    expect(match.best?.reasons).toContain('monto exacto');
    expect(match.best?.reasons).toContain('mismo día');
    expect(match.best?.exactAmount).toBe(true);
    expect(match.best?.amountDelta).toBe(0);
  });

  it('monto distinto pero dentro de tolerancia: DISCREPANCIA, no sugerencia', () => {
    const [match] = matchBankMovements([movimiento()], [factura({ amount: 5810 })]);
    expect(match.state).toBe('DISCREPANCIA');
    expect(match.best?.exactAmount).toBe(false);
    expect(match.best?.amountDelta).toBe(10);
    expect(match.best?.reasons.join(' ')).toMatch(/diferencia de/);
  });

  it('monto fuera de tolerancia: el candidato se descarta y queda PENDIENTE', () => {
    const [match] = matchBankMovements([movimiento()], [factura({ amount: 9900 })]);
    expect(match.candidates).toHaveLength(0);
    expect(match.state).toBe('PENDIENTE');
  });

  it('la tolerancia es configurable: con tolerancia cero, 10 pesos ya sobran', () => {
    const [conDefecto] = matchBankMovements([movimiento()], [factura({ amount: 5810 })]);
    expect(conDefecto.candidates).toHaveLength(1);

    const [sinTolerancia] = matchBankMovements([movimiento()], [factura({ amount: 5810 })], {
      amountToleranceAbs: 0,
      amountTolerancePct: 0,
    });
    expect(sinTolerancia.candidates).toHaveLength(0);
    expect(sinTolerancia.state).toBe('PENDIENTE');
  });

  it('fuera de la ventana de fecha: se descarta aunque el monto sea exacto', () => {
    const [match] = matchBankMovements([movimiento()], [factura({ date: '2026-09-25' })]);
    expect(match.candidates).toHaveLength(0);
    expect(match.state).toBe('PENDIENTE');
  });

  it('la ventana de fecha es configurable', () => {
    const [match] = matchBankMovements([movimiento()], [factura({ date: '2026-09-25' })], {
      dateWindowDays: 20,
    });
    expect(match.candidates).toHaveLength(1);
    expect(match.best?.dayDelta).toBe(15);
  });

  it('el vencimiento también sirve de fecha de referencia', () => {
    const [match] = matchBankMovements(
      [movimiento()],
      [factura({ date: '2026-08-12', dueDate: '2026-09-10' })],
    );
    expect(match.candidates).toHaveLength(1);
    expect(match.best?.dayDelta).toBe(0);
    expect(match.best?.reasons).toContain('vence el mismo día');
  });

  it('el folio dentro de la descripción suma y se explica en las razones', () => {
    const conFolio = scoreCandidate(
      movimiento({ description: 'TRANSFERENCIA PAGO FACT F-182', date: '2026-09-13' }),
      factura(),
    );
    const sinFolio = scoreCandidate(
      movimiento({ description: 'TRANSFERENCIA RECIBIDA', date: '2026-09-13' }),
      factura(),
    );
    expect(conFolio?.reasons).toContain('folio F-182 en la referencia');
    expect(conFolio!.score).toBeGreaterThan(sinFolio!.score);
  });

  it('folioAppearsIn acepta la forma compacta y el bloque numérico suelto', () => {
    expect(folioAppearsIn('F-182', 'PAGO FACT F182 ACME')).toBe(true);
    expect(folioAppearsIn('F-182', 'REFERENCIA 182 ACME')).toBe(true);
    expect(folioAppearsIn('F-182', 'DEPOSITO 1829 ACME')).toBe(false);
    expect(folioAppearsIn('F-1', 'DEPOSITO 1 ACME')).toBe(false);
  });

  it('la clave de rastreo SPEI dispara la razón correspondiente', () => {
    const scored = scoreCandidate(
      movimiento({ speiTrackingKey: 'CR1234567890' }),
      factura({ kind: 'PAYMENT', speiTrackingKey: 'CR1234567890' }),
    );
    expect(scored?.reasons.join(' ')).toContain('clave de rastreo SPEI');
  });

  it('el RFC de la contraparte suma más que el parecido de nombre', () => {
    const porRfc = scoreCandidate(
      movimiento({ counterpartyRfc: 'ACM010101AA1', counterpartyName: 'ACME CORP' }),
      factura({ counterpartyRfc: 'ACM010101AA1', counterpartyName: 'ACME CORP' }),
    );
    const porNombre = scoreCandidate(
      movimiento({ counterpartyName: 'ACME CORP' }),
      factura({ counterpartyName: 'ACME CORPORATIVO' }),
    );
    expect(porRfc?.reasons.join(' ')).toContain('mismo RFC');
    expect(porNombre?.reasons.join(' ')).toContain('contraparte');
    expect(porRfc!.score).toBeGreaterThan(porNombre!.score);
  });

  it('un cargo contra una cuenta por cobrar penaliza y lo dice', () => {
    const alineado = scoreCandidate(movimiento(), factura());
    const invertido = scoreCandidate(movimiento({ isDebit: true }), factura());
    expect(invertido?.reasons).toContain('el sentido del movimiento no coincide');
    expect(invertido!.score).toBeLessThan(alineado!.score);
  });

  it('dos candidatos igual de buenos: SUGERENCIA_MULTIPLE, ordenados por score', () => {
    const [match] = matchBankMovements(
      [movimiento()],
      [factura(), factura({ id: 101, folio: 'F-183' })],
    );
    expect(match.candidates).toHaveLength(2);
    expect(match.state).toBe('SUGERENCIA_MULTIPLE');
    expect(match.candidates[0].score).toBeGreaterThanOrEqual(match.candidates[1].score);
  });

  it('un ganador claro entre varios sí es SUGERENCIA_ALTA', () => {
    const [match] = matchBankMovements(
      [movimiento({ description: 'PAGO FACT F-182' })],
      [factura(), factura({ id: 101, folio: 'F-900', date: '2026-09-14' })],
    );
    expect(match.state).toBe('SUGERENCIA_ALTA');
    expect(match.best?.candidate.folio).toBe('F-182');
  });

  it('sin candidatos: PENDIENTE', () => {
    const [match] = matchBankMovements([movimiento()], []);
    expect(match.state).toBe('PENDIENTE');
    expect(match.best).toBeNull();
  });

  it('un movimiento ya conciliado no genera sugerencias', () => {
    const [match] = matchBankMovements([movimiento({ reconciled: true })], [factura()]);
    expect(match.state).toBe('CONCILIADO');
    expect(match.candidates).toHaveLength(0);
  });

  it('el score nunca sale del rango 0-100', () => {
    const scored = scoreCandidate(
      movimiento({
        description: 'SPEI F-182 REF900',
        reference: 'REF900',
        speiTrackingKey: 'CR1',
        counterpartyRfc: 'ACM010101AA1',
        counterpartyName: 'ACME CORP',
      }),
      factura({
        reference: 'REF900',
        speiTrackingKey: 'CR1',
        counterpartyRfc: 'ACM010101AA1',
        counterpartyName: 'ACME CORP',
      }),
    );
    expect(scored!.score).toBeLessThanOrEqual(100);
    expect(scored!.score).toBeGreaterThanOrEqual(0);
  });

  it('classifyMovement respeta el margen de dominancia', () => {
    const base = scoreCandidate(movimiento(), factura())!;
    const flojo = { ...base, score: base.score - 2 };
    expect(classifyMovement(movimiento(), [base, flojo])).toBe('SUGERENCIA_MULTIPLE');
    expect(classifyMovement(movimiento(), [base])).toBe('SUGERENCIA_ALTA');
  });

  it('summarizeMatches cuenta cada estado', () => {
    const matches = matchBankMovements(
      [
        movimiento({ id: 1 }),
        movimiento({ id: 2, reconciled: true }),
        movimiento({ id: 3, amount: 123456 }),
        movimiento({ id: 4, amount: 5810, date: '2026-09-10' }),
      ],
      [factura()],
    );
    const resumen = summarizeMatches(matches);
    expect(resumen.total).toBe(4);
    expect(resumen.conciliados).toBe(1);
    expect(resumen.sugerenciaAlta).toBe(1);
    expect(resumen.pendientes).toBe(1);
    expect(resumen.discrepancias).toBe(1);
    expect(resumen.sugeridos).toBe(resumen.sugerenciaAlta + resumen.sugerenciaMultiple);
  });
});

// ── 2. Aislamiento por empresa ──────────────────────────────────────────────

const EMPRESA = 7;
const OTRA_EMPRESA = 9;

function build(over: Record<string, any> = {}) {
  const prisma = {
    bankAccount: {
      findMany: jest.fn().mockResolvedValue([
        { id: 10, name: 'Banorte operativa', bankName: 'Banorte', currency: 'MXN', currentBalance: 0 },
      ]),
      findFirst: jest.fn().mockResolvedValue({ id: 10, companyId: EMPRESA }),
    },
    bankTransaction: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 500,
          transactionDate: new Date('2026-09-10T00:00:00.000Z'),
          description: 'SPEI RECIBIDO FACT F-182',
          amount: 5800,
          isDebit: false,
          externalRef: 'REF900',
          speiTrackingKey: null,
          concept: null,
          beneficiaryRef: null,
          counterpartyName: 'ACME CORP',
          counterpartyRfc: null,
          reconciliation: null,
        },
      ]),
      findFirst: jest.fn().mockResolvedValue({
        id: 500,
        amount: 5800,
        companyId: EMPRESA,
        description: 'SPEI RECIBIDO FACT F-182',
        reconciliation: null,
      }),
    },
    invoice: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 100,
          invoiceNumber: 'F-182',
          type: 'ACCOUNTS_RECEIVABLE',
          status: 'SENT',
          issueDate: new Date('2026-09-10T00:00:00.000Z'),
          dueDate: new Date('2026-09-25T00:00:00.000Z'),
          totalAmount: 5800,
          paidAmount: 0,
          receptorName: 'ACME CORP',
          receptorRfc: 'ACM010101AA1',
          emisorName: 'NEXARA',
          emisorRfc: 'NEX010101AA1',
          client: { name: 'ACME CORP', taxId: 'ACM010101AA1' },
          supplier: null,
          salesProjectOrder: { orderId: 'OC-1', project: { name: 'CCTV Planta Norte' } },
        },
      ]),
      findFirst: jest.fn().mockResolvedValue({
        id: 100,
        companyId: EMPRESA,
        invoiceNumber: 'F-182',
      }),
    },
    payment: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({
        id: 300,
        companyId: EMPRESA,
        reference: 'PAGO-300',
        invoice: { invoiceNumber: 'F-182' },
      }),
    },
    ...over,
  };
  const accounting = { reconcileTransaction: jest.fn().mockResolvedValue({ id: 999 }) };
  const service = new ReconciliationMatchService(prisma as any, accounting as any);
  return { service, prisma, accounting };
}

/** Todo `where` que llega a Prisma debe traer el companyId de la empresa activa. */
function expectScopedToCompany(call: any, companyId: number) {
  expect(call).toBeDefined();
  const where = call[0]?.where ?? {};
  expect(where.companyId).toBe(companyId);
}

describe('ReconciliationMatchService — aislamiento por empresa', () => {
  it('sugerencias sin empresa activa: Forbidden, y no toca la base', async () => {
    const { service, prisma } = build();
    await expect(service.getSuggestions({}, null)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.bankAccount.findMany).not.toHaveBeenCalled();
  });

  it('cada consulta de sugerencias lleva el companyId en el where', async () => {
    const { service, prisma } = build();
    await service.getSuggestions({}, EMPRESA);

    expectScopedToCompany(prisma.bankAccount.findMany.mock.calls[0], EMPRESA);
    expectScopedToCompany(prisma.bankTransaction.findMany.mock.calls[0], EMPRESA);
    expectScopedToCompany(prisma.invoice.findMany.mock.calls[0], EMPRESA);
    expectScopedToCompany(prisma.payment.findMany.mock.calls[0], EMPRESA);
  });

  it('una cuenta bancaria de otra empresa no existe para mí', async () => {
    const { service } = build({
      bankAccount: {
        findMany: jest.fn().mockResolvedValue([
          { id: 10, name: 'Banorte', bankName: 'Banorte', currency: 'MXN', currentBalance: 0 },
        ]),
        // El where con companyId ya no la encuentra.
        findFirst: jest.fn().mockResolvedValue(null),
      },
    });
    await expect(service.getSuggestions({ accountId: 77 }, EMPRESA)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('devuelve movimientos con estado, candidatos y razones', async () => {
    const { service } = build();
    const res = await service.getSuggestions({}, EMPRESA);

    expect(res.cuentaSeleccionada).toBe(10);
    expect(res.movimientos).toHaveLength(1);
    const mov = res.movimientos[0];
    expect(mov.estado).toBe('SUGERENCIA_ALTA');
    expect(mov.candidatos[0]).toMatchObject({
      tipo: 'INVOICE',
      folio: 'F-182',
      proyecto: 'CCTV Planta Norte',
    });
    expect(mov.candidatos[0].razones).toContain('monto exacto');
    expect(res.resumen.sugerenciaAlta).toBe(1);
  });

  it('sin cuentas bancarias devuelve la lista vacía, no revienta', async () => {
    const { service, prisma } = build({
      bankAccount: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    });
    const res = await service.getSuggestions({}, EMPRESA);
    expect(res.cuentas).toHaveLength(0);
    expect(res.movimientos).toHaveLength(0);
    expect(res.resumen.total).toBe(0);
    expect(prisma.bankTransaction.findMany).not.toHaveBeenCalled();
  });

  it('aplicar sin empresa activa: Forbidden y sin escritura', async () => {
    const { service, accounting } = build();
    await expect(
      service.applyMatch(
        { transactionId: 500, candidateKind: 'INVOICE', candidateId: 100 },
        42,
        null,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(accounting.reconcileTransaction).not.toHaveBeenCalled();
  });

  it('aplicar sobre una transacción de otra empresa: 404 y sin escritura', async () => {
    const { service, accounting } = build({
      bankTransaction: { findMany: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.applyMatch(
        { transactionId: 500, candidateKind: 'INVOICE', candidateId: 100 },
        42,
        EMPRESA,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(accounting.reconcileTransaction).not.toHaveBeenCalled();
  });

  it('aplicar con una factura de otra empresa: 404 y sin escritura', async () => {
    const { service, accounting } = build({
      invoice: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.applyMatch(
        { transactionId: 500, candidateKind: 'INVOICE', candidateId: 100 },
        42,
        EMPRESA,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(accounting.reconcileTransaction).not.toHaveBeenCalled();
  });

  it('una fila sellada con otra empresa tampoco pasa', async () => {
    const { service, accounting } = build({
      bankTransaction: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({
          id: 500,
          amount: 5800,
          companyId: OTRA_EMPRESA,
          description: 'fuga',
          reconciliation: null,
        }),
      },
    });
    await expect(
      service.applyMatch(
        { transactionId: 500, candidateKind: 'INVOICE', candidateId: 100 },
        42,
        EMPRESA,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(accounting.reconcileTransaction).not.toHaveBeenCalled();
  });

  it('no re-concilia una transacción que ya tiene conciliación', async () => {
    const { service, accounting } = build({
      bankTransaction: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({
          id: 500,
          amount: 5800,
          companyId: EMPRESA,
          description: 'ya',
          reconciliation: { id: 1 },
        }),
      },
    });
    await expect(
      service.applyMatch(
        { transactionId: 500, candidateKind: 'INVOICE', candidateId: 100 },
        42,
        EMPRESA,
      ),
    ).rejects.toThrow(/ya está conciliada/);
    expect(accounting.reconcileTransaction).not.toHaveBeenCalled();
  });

  it('aplicar reutiliza reconcileTransaction y registra quién y con qué', async () => {
    const { service, accounting } = build();
    const res = await service.applyMatch(
      { transactionId: 500, candidateKind: 'INVOICE', candidateId: 100, score: 93 },
      42,
      EMPRESA,
    );

    expect(accounting.reconcileTransaction).toHaveBeenCalledTimes(1);
    const [txId, dto, userId, tenantId] = accounting.reconcileTransaction.mock.calls[0];
    expect(txId).toBe(500);
    expect(dto.matchedAmount).toBe(5800);
    expect(dto.notes).toContain('Factura F-182');
    expect(dto.notes).toContain('score 93');
    expect(userId).toBe(42);
    expect(tenantId).toBe(EMPRESA);
    expect(res.ok).toBe(true);
    expect(res.conciliadoPor).toBe(42);
    expect(res.conciliadoEn).toBeTruthy();
  });

  it('aplicar sobre un pago valida el pago contra la empresa', async () => {
    const { service, prisma, accounting } = build();
    await service.applyMatch(
      { transactionId: 500, candidateKind: 'PAYMENT', candidateId: 300 },
      42,
      EMPRESA,
    );
    expectScopedToCompany(prisma.payment.findFirst.mock.calls[0], EMPRESA);
    expect(accounting.reconcileTransaction.mock.calls[0][1].notes).toContain('Pago PAGO-300');
  });
});

// ── 3. Contrato de autorización ─────────────────────────────────────────────

describe('conciliación — contrato de autorización', () => {
  const rbacDe = (handler: unknown) =>
    (Reflect.getMetadata('rbac', handler as object) ?? {}) as {
      permissions?: string[];
      anyPermissions?: string[];
    };

  it('ver sugerencias: banca, contabilidad o consola', () => {
    const meta = rbacDe(ReconciliationMatchController.prototype.sugerencias);
    expect(meta.anyPermissions).toEqual(
      expect.arrayContaining([
        PERMISSIONS.BANKING_VIEW,
        PERMISSIONS.CONTABILIDAD_VIEW,
        PERMISSIONS.CONSOLE_ADMIN,
      ]),
    );
  });

  it('aplicar un match exige banking.reconcile (no basta con ver)', () => {
    const meta = rbacDe(ReconciliationMatchController.prototype.aplicar);
    expect(meta.permissions).toEqual([PERMISSIONS.BANKING_RECONCILE]);
    expect(meta.permissions).not.toContain(PERMISSIONS.BANKING_VIEW);
  });

  it('un rol de campo no tiene ninguno de los permisos requeridos', () => {
    const permisosDeCampo = ['ops.view', 'activities.view'];
    const ver = rbacDe(ReconciliationMatchController.prototype.sugerencias).anyPermissions ?? [];
    const aplicar = rbacDe(ReconciliationMatchController.prototype.aplicar).permissions ?? [];
    expect(permisosDeCampo.some((p) => ver.includes(p))).toBe(false);
    expect(permisosDeCampo.some((p) => aplicar.includes(p))).toBe(false);
  });
});
