import { NotFoundException } from '@nestjs/common';
import { AccountingService } from './accounting.service.js';

/**
 * 3-way match — IDOR / cross-tenant: evaluateThreeWayMatch debe sellar por
 * companyId igual que waiveThreeWayMatch y getInvoice.
 */

const EMPRESA = 7;
const OTRA_EMPRESA = 99;

function build(over: Record<string, unknown> = {}) {
  const prisma = {
    invoice: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
    goodsReceiptItem: { findMany: jest.fn().mockResolvedValue([]) },
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

describe('3-way match · aislamiento por empresa (evaluateThreeWayMatch)', () => {
  it('findFirst con scope de otra empresa devuelve null → 404 y sin update', async () => {
    const { service, prisma } = build();
    await expect(service.evaluateThreeWayMatch(10, 1, EMPRESA)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const where = (prisma.invoice.findFirst as jest.Mock).mock.calls[0][0].where;
    expect(where.companyId).toBe(EMPRESA);
    expect(where.id).toBe(10);
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });

  it('fila con companyId distinto al activo: assertCompanyAccess → 404 y sin update', async () => {
    const { service, prisma } = build({
      invoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 10,
          companyId: OTRA_EMPRESA,
          deletedAt: null,
          type: 'ACCOUNTS_PAYABLE',
          purchaseOrderId: 1,
          goodsReceiptId: null,
          matchStatus: 'PENDING',
          items: [],
          purchaseOrder: { items: [] },
          goodsReceipt: null,
        }),
        update: jest.fn(),
      },
    });
    await expect(service.evaluateThreeWayMatch(10, 1, EMPRESA)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });
});
