import { BadRequestException, ConflictException } from '@nestjs/common';
import { EmployeePaymentsService } from './employee-payments.service';

const D = (f: string) => new Date(`${f}T00:00:00.000Z`);

function armar(op: { status?: string; sueltos?: number[]; ligados?: number; poliza?: () => Promise<any>; claim?: number } = {}) {
  const pago: any = {
    id: 9,
    userId: 5,
    companyId: 1,
    status: op.status ?? 'Borrador',
    amount: 2540,
    periodFrom: D('2026-11-16'),
    periodTo: D('2026-11-22'),
    paidAt: null,
    journalEntryId: null,
    contabilidadRef: null,
    evidenceUrls: [],
  };
  const prisma: any = {
    employeePayment: {
      findFirst: jest.fn(async () => ({ ...pago })),
      update: jest.fn(async ({ data }: any) => ({ ...pago, ...data })),
      updateMany: jest.fn(async () => ({ count: op.claim ?? 1 })),
      create: jest.fn(async ({ data }: any) => ({ ...pago, ...data })),
    },
    nominaPagoRegistro: {
      findMany: jest.fn(async () => (op.sueltos ?? []).map((monto) => ({ monto }))),
      count: jest.fn(async () => op.ligados ?? 0),
    },
    companyProfile: { findFirst: jest.fn(async () => ({ id: 1 })), findUnique: jest.fn(async () => ({ id: 1 })) },
    $executeRaw: jest.fn(async () => 1),
  };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  const accounting: any = { postOperationalDisbursement: jest.fn(op.poliza ?? (async () => ({ id: 77, entryNumber: 'PAG-77' }))) };
  const audit: any = { log: jest.fn(async () => undefined) };
  return { service: new EmployeePaymentsService(prisma, accounting, audit, {} as any), prisma, accounting };
}

describe('marcar pagado en la lista', () => {
  it('con pagos a medias en la pestaña «Pago» se niega y no asienta póliza', async () => {
    const { service, accounting } = armar({ sueltos: [1500] });
    await expect(service.markPagado(9, 1, 1)).rejects.toThrow('Ya hay $1500.00 pagados en la pestaña «Pago»');
    expect(accounting.postOperationalDisbursement).not.toHaveBeenCalled();
  });

  it('aparta el pago antes de la póliza y lo deja pagado', async () => {
    const { service, prisma, accounting } = armar();
    const r: any = await service.markPagado(9, 1, 1);
    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.employeePayment.updateMany.mock.invocationCallOrder[0]).toBeLessThan(accounting.postOperationalDisbursement.mock.invocationCallOrder[0]);
    expect(r).toMatchObject({ status: 'Pagado', journalEntryId: 77 });
  });

  it('dos a la vez: la segunda no asienta otra póliza', async () => {
    const { service, accounting } = armar({ claim: 0 });
    await expect(service.markPagado(9, 1, 1)).rejects.toBeInstanceOf(ConflictException);
    expect(accounting.postOperationalDisbursement).not.toHaveBeenCalled();
  });

  it('si la póliza falla, regresa a como estaba', async () => {
    const { service, prisma } = armar({ poliza: async () => { throw new BadRequestException('Periodo cerrado'); } });
    await expect(service.markPagado(9, 1, 1)).rejects.toThrow('Periodo cerrado');
    expect(prisma.employeePayment.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { status: 'Borrador', paidAt: null } }),
    );
    expect(prisma.employeePayment.update).not.toHaveBeenCalled();
  });

  it('registrar como Pagado con parciales no deja un Borrador suelto', async () => {
    const { service, prisma } = armar({ sueltos: [500] });
    await expect(
      service.create({ id: 1 }, { userId: 5, periodFrom: '2026-11-16', periodTo: '2026-11-22', amount: 100, status: 'Pagado' } as any, [], 1),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.employeePayment.create).not.toHaveBeenCalled();
  });

  it('un pago que nació de «Pago» no cambia de importe; su nota sí', async () => {
    const { service } = armar({ ligados: 2, status: 'Pagado' });
    await expect(service.update(9, { amount: 1 } as any, undefined, 1, 1)).rejects.toThrow('viene de la pestaña');
    await expect(service.update(9, { status: 'Borrador' } as any, undefined, 1, 1)).rejects.toThrow('viene de la pestaña');
    await expect(service.update(9, { note: 'ok', amount: 2540 } as any, undefined, 1, 1)).resolves.toMatchObject({ note: 'ok' });
  });
});
