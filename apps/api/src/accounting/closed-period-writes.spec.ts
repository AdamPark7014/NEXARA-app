import { BadRequestException } from '@nestjs/common';
import { AccountingService } from './accounting.service.js';

/**
 * Periodo fiscal cerrado debe bloquear escrituras que mueven dinero o
 * alteran facturas/banco — no solo la reversa de pólizas.
 */

const EMPRESA = 7;

const PERIODO_CERRADO = {
  id: 3,
  name: 'Agosto 2026',
  startDate: new Date('2026-08-01T00:00:00.000Z'),
  endDate: new Date('2026-08-31T23:59:59.000Z'),
  isClosed: true,
  companyId: EMPRESA,
};

function build(over: Record<string, any> = {}) {
  const prisma = {
    fiscalPeriod: {
      findFirst: jest.fn().mockResolvedValue(PERIODO_CERRADO),
    },
    invoice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 10,
        issueDate: new Date('2026-08-15T12:00:00.000Z'),
        companyId: EMPRESA,
        deletedAt: null,
        status: 'DRAFT',
        cfdiUuid: null,
        isCancelled: false,
        payments: [],
        items: [],
        emisorRfc: 'AAA010101AAA',
      }),
      updateMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    bankAccount: {
      findFirst: jest.fn().mockResolvedValue({ id: 5, companyId: EMPRESA }),
    },
    bankTransaction: {
      findFirst: jest.fn().mockResolvedValue({
        id: 20,
        transactionDate: new Date('2026-08-15T12:00:00.000Z'),
        amount: 100,
        bankAccountId: 5,
        companyId: EMPRESA,
        reconciliation: null,
        bankAccount: { id: 5, companyId: EMPRESA },
      }),
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
    companyProfile: { findFirst: jest.fn().mockResolvedValue({ id: EMPRESA }) },
    ...over,
  };

  const service = new AccountingService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    { next: jest.fn() } as any,
    {} as any,
  );
  return { service, prisma };
}

describe('periodo fiscal cerrado · escrituras', () => {
  it('registerPayment rechaza paymentDate en periodo cerrado', async () => {
    const { service, prisma } = build();
    await expect(
      service.registerPayment(
        { invoiceId: 10, amount: 100, paymentDate: '2026-08-15' },
        1,
        EMPRESA,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.registerPayment(
        { invoiceId: 10, amount: 100, paymentDate: '2026-08-15' },
        1,
        EMPRESA,
      ),
    ).rejects.toThrow(/Periodo fiscal cerrado/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('registerPayment pasa el assert si no hay periodo que cubra la fecha', async () => {
    const { service } = build({
      fiscalPeriod: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockRejectedValue(new Error('llego-a-transaccion')),
    });
    await expect(
      service.registerPayment(
        { invoiceId: 10, amount: 100, paymentDate: '2026-09-15' },
        1,
        EMPRESA,
      ),
    ).rejects.toThrow(/llego-a-transaccion/);
  });

  it('createInvoice rechaza issueDate en periodo cerrado', async () => {
    const { service } = build();
    await expect(
      service.createInvoice(
        {
          type: 'ACCOUNTS_RECEIVABLE',
          issueDate: '2026-08-15',
          dueDate: '2026-09-15',
          companyId: EMPRESA,
          items: [{ description: 'x', quantity: 1, unitPrice: 10 }],
        },
        1,
      ),
    ).rejects.toThrow(/Periodo fiscal cerrado/);
  });

  it('updateInvoiceDraft rechaza issueDate del borrador en periodo cerrado', async () => {
    const { service } = build();
    await expect(
      service.updateInvoiceDraft(10, { notes: 'x' }, 1, EMPRESA),
    ).rejects.toThrow(/Periodo fiscal cerrado/);
  });

  it('deleteInvoice rechaza issueDate en periodo cerrado', async () => {
    const { service } = build();
    await expect(service.deleteInvoice(10, 1, EMPRESA)).rejects.toThrow(/Periodo fiscal cerrado/);
  });

  it('cancelInvoice rechaza issueDate en periodo cerrado', async () => {
    const { service } = build();
    await expect(
      service.cancelInvoice(10, { cancelReason: '02' }, 1, EMPRESA),
    ).rejects.toThrow(/Periodo fiscal cerrado/);
  });

  it('reconcileTransaction rechaza transactionDate en periodo cerrado', async () => {
    const { service } = build();
    await expect(
      service.reconcileTransaction(20, { matchedAmount: 100 }, 1, EMPRESA),
    ).rejects.toThrow(/Periodo fiscal cerrado/);
  });

  it('importBankTransactions rechaza transactionDate en periodo cerrado', async () => {
    const { service, prisma } = build();
    await expect(
      service.importBankTransactions(
        5,
        [
          {
            transactionDate: '2026-08-15',
            description: 'SPEI',
            amount: 50,
            isDebit: false,
          },
        ],
        EMPRESA,
      ),
    ).rejects.toThrow(/Periodo fiscal cerrado/);
    expect(prisma.bankTransaction.createMany).not.toHaveBeenCalled();
  });

  it('stampInvoice rechaza issueDate en periodo cerrado', async () => {
    const { service, prisma } = build();
    await expect(service.stampInvoice(10, 1, EMPRESA)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.stampInvoice(10, 1, EMPRESA)).rejects.toThrow(/Periodo fiscal cerrado/);
    expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('createCreditNote rechaza issueDate de la factura original en periodo cerrado', async () => {
    const { service, prisma } = build({
      invoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 10,
          issueDate: new Date('2026-08-15T12:00:00.000Z'),
          companyId: EMPRESA,
          cfdiUuid: '550e8400-e29b-41d4-a716-446655440000',
          isCancelled: false,
          invoiceNumber: 'F-001',
          totalAmount: 116,
          clientId: 1,
          currency: 'MXN',
          satPaymentForm: '03',
          satPaymentMethod: 'PUE',
          emisorRfc: 'AAA010101AAA',
          emisorName: 'Emisor',
          emisorRegime: '601',
          receptorRfc: 'BBB010101BBB',
          receptorName: 'Receptor',
          receptorRegime: '601',
          receptorZipCode: '01000',
          cfdiSerie: 'A',
          items: [
            {
              description: 'Servicio',
              quantity: 1,
              unitPrice: 100,
              taxRate: 16,
              total: 116,
              satProductKey: '84111506',
              satUnitKey: 'E48',
              unitName: 'Servicio',
            },
          ],
        }),
        updateMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    });
    await expect(
      service.createCreditNote(10, { reason: 'Devolución parcial' }, 1, EMPRESA),
    ).rejects.toThrow(/Periodo fiscal cerrado/);
    expect(prisma.invoice.create).not.toHaveBeenCalled();
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });
});
