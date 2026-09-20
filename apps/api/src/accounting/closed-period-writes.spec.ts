import { BadRequestException } from '@nestjs/common';
import { AccountingService } from './accounting.service.js';
import { Prisma } from '@prisma/client';
import { jest } from '@jest/globals';

describe('AccountingService closed fiscal period guards', () => {
  let service: AccountingService;
  let prisma: PrismaClient;

  beforeEach(() => {
    prisma = {
      fiscalPeriod: {
        findFirst: jest.fn(),
        $transaction: jest.fn(),
      },
      invoice: {
        findFirst: jest.fn(),
      },
      bankTransaction: {
        findFirst: jest.fn(),
      },
      bankAccount: {
        findFirst: jest.fn(),
      },
    } as unknown as PrismaClient;

    service = new AccountingService(prisma, {}, {}, {}, () => '7', {});
  });

  const startDate = new Date('2026-08-01');
  const endDate = new Date('2026-08-31');

  it('registerPayment with paymentDate in closed period → rejects with BadRequestException matching /Periodo fiscal cerrado/', async () => {
    prisma.fiscalPeriod.findFirst.mockResolvedValue({ id: 3, name: 'Agosto 2026', isClosed: true, startDate, endDate });
    prisma.$transaction.mockRejectedValue(new Error('Not used'));

    await expect(service.registerPayment({ invoiceId: 1, amount: 100, paymentDate: '2026-08-15' }, 1, 7)).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('registerPayment when no covering period (findFirst null) → should NOT throw from period assert', async () => {
    prisma.fiscalPeriod.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockRejectedValue(new Error('Not used'));

    await expect(service.registerPayment({ invoiceId: 1, amount: 100, paymentDate: '2026-09-15' }, 1, 7)).rejects.toThrow(Error);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.anything());
  });

  it('createInvoice with issueDate in closed period → BadRequestException /Periodo fiscal cerrado/', async () => {
    prisma.fiscalPeriod.findFirst.mockResolvedValue({ id: 3, name: 'Agosto 2026', isClosed: true, startDate, endDate });
    prisma.invoice.findFirst.mockResolvedValue(null);

    await expect(service.createInvoice({ companyId: 7, issueDate: '2026-08-15' }, 1, 7)).rejects.toThrow(BadRequestException);
  });

  it('reconcileTransaction: bankTransaction.findFirst returns tx with transactionDate in closed period → BadRequestException', async () => {
    prisma.fiscalPeriod.findFirst.mockResolvedValue({ id: 3, name: 'Agosto 2026', isClosed: true, startDate, endDate });
    prisma.bankTransaction.findFirst.mockResolvedValue({ id: 1, transactionDate: '2026-08-15' });

    await expect(service.reconcileTransaction(1, 1, 7)).rejects.toThrow(BadRequestException);
  });

  it('importBankTransactions: bankAccount found, one tx with closed date → BadRequestException; createMany not called', async () => {
    prisma.fiscalPeriod.findFirst.mockResolvedValue({ id: 3, name: 'Agosto 2026', isClosed: true, startDate, endDate });
    prisma.bankAccount.findFirst.mockResolvedValue({ id: 1 });
    prisma.bankTransaction.findFirst.mockResolvedValue({ id: 1, transactionDate: '2026-08-15' });

    await expect(service.importBankTransactions(1, 1, 7)).rejects.toThrow(BadRequestException);
    expect(prisma.bankTransaction.createMany).not.toHaveBeenCalled();
  });

  it('cancelInvoice: invoice found with issueDate in closed period → BadRequestException before pac', async () => {
    prisma.fiscalPeriod.findFirst.mockResolvedValue({ id: 3, name: 'Agosto 2026', isClosed: true, startDate, endDate });
    prisma.invoice.findFirst.mockResolvedValue({ id: 1, issueDate: '2026-08-15' });

    await expect(service.cancelInvoice(1, 1, 7)).rejects.toThrow(BadRequestException);
  });

  it('deleteInvoice: invoice found with issueDate closed → BadRequestException', async () => {
    prisma.fiscalPeriod.findFirst.mockResolvedValue({ id: 3, name: 'Agosto 2026', isClosed: true, startDate, endDate });
    prisma.invoice.findFirst.mockResolvedValue({ id: 1, issueDate: '2026-08-15' });

    await expect(service.deleteInvoice(1, 1, 7)).rejects.toThrow(BadRequestException);
  });

  it('updateInvoiceDraft: invoice DRAFT with issueDate closed → BadRequestException', async () => {
    prisma.fiscalPeriod.findFirst.mockResolvedValue({ id: 3, name: 'Agosto 2026', isClosed: true, startDate, endDate });
    prisma.invoice.findFirst.mockResolvedValue({ id: 1, issueDate: '2026-08-15', status: 'DRAFT' });

    await expect(service.updateInvoiceDraft(1, 1, 7)).rejects.toThrow(BadRequestException);
  });
});