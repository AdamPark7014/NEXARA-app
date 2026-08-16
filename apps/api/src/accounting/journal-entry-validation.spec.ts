import { BadRequestException } from '@nestjs/common';
import { AccountingService } from './accounting.service.js';

/**
 * Validación de la póliza al crearse.
 *
 * Lo importante aquí no es que cuadre —eso ya se comprobaba— sino que las
 * cuentas sean **de la empresa**. El aislamiento por empresa actúa sobre los
 * `where` de las consultas, y un `create` escribe la clave foránea tal cual:
 * `debitAccountId` llegaba del cuerpo de la petición sin que nadie mirara de
 * quién era.
 */

const LINEA_OK = { debitAccountId: 1, creditAccountId: 2, debit: 100, credit: 0 };
const LINEA_CONTRA = { debitAccountId: 2, debit: 0, credit: 100 };

function build(over: Record<string, any> = {}) {
  const prisma = {
    account: { findMany: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]) },
    costCenter: { findMany: jest.fn().mockResolvedValue([]) },
    journalEntry: {
      create: jest.fn().mockResolvedValue({ id: 1, lines: [] }),
      count: jest.fn().mockResolvedValue(0),
    },
    fiscalPeriod: { findFirst: jest.fn().mockResolvedValue({ id: 5, status: 'OPEN' }) },
    companyProfile: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
    $queryRaw: jest.fn().mockResolvedValue([{ valor: 1 }]),
    ...over,
  };

  const folio = { next: jest.fn().mockResolvedValue('JE-000001') };
  const service = new AccountingService(
    prisma as any,
    { } as any,
    { } as any,
    { } as any,
    folio as any,
  );
  return { service, prisma, folio };
}

const crear = (service: AccountingService, lines: any[], companyId: number | null = 7) =>
  service.createJournalEntry(
    { date: '2026-08-16', description: 'prueba', companyId, lines },
    1,
  );

describe('cuadre y renglones', () => {
  it('rechaza una póliza sin renglones', async () => {
    // Sin renglones cuadra por vacio (0 = 0) y se guardaba un asiento fantasma.
    const { service } = build();
    await expect(crear(service, [])).rejects.toThrow(/al menos un renglón/);
  });

  it('rechaza importes negativos', async () => {
    // -100 contra -100 tambien cuadra, y corrompe la balanza sin que el total
    // lo delate.
    const { service } = build();
    await expect(
      crear(service, [
        { debitAccountId: 1, debit: -100, credit: 0 },
        { debitAccountId: 2, debit: 0, credit: -100 },
      ]),
    ).rejects.toThrow(/negativos/);
  });

  it('rechaza un renglón que no mueve nada', async () => {
    const { service } = build();
    await expect(crear(service, [{ debitAccountId: 1, debit: 0, credit: 0 }])).rejects.toThrow(
      /Debe o Haber/,
    );
  });

  it('sigue rechazando lo descuadrado', async () => {
    const { service } = build();
    await expect(
      crear(service, [
        { debitAccountId: 1, debit: 100, credit: 0 },
        { debitAccountId: 2, debit: 0, credit: 90 },
      ]),
    ).rejects.toThrow(/no cuadran/);
  });

  it('tolera el céntimo de redondeo', async () => {
    const { service } = build();
    await expect(
      crear(service, [
        { debitAccountId: 1, debit: 100, credit: 0 },
        { debitAccountId: 2, debit: 0, credit: 100.009 },
      ]),
    ).resolves.toBeDefined();
  });
});

describe('las cuentas deben ser de la empresa', () => {
  it('consulta las cuentas acotadas a la empresa', async () => {
    const { service, prisma } = build();
    await crear(service, [LINEA_OK, LINEA_CONTRA]);

    const args = prisma.account.findMany.mock.calls[0][0];
    expect(args.where.companyId).toBe(7);
    expect(args.where.id.in.sort()).toEqual([1, 2]);
  });

  it('rechaza una cuenta que no es de la empresa', async () => {
    // Era el agujero: se podia asentar contra el catalogo de otra empresa.
    const { service } = build({ account: { findMany: jest.fn().mockResolvedValue([{ id: 1 }]) } });
    await expect(crear(service, [LINEA_OK, LINEA_CONTRA])).rejects.toThrow(
      /no disponible en esta empresa/,
    );
  });

  it('el mensaje no distingue "no existe" de "es de otra empresa"', async () => {
    // Distinguirlo convertiria el error en un buscador del catalogo ajeno.
    const { service } = build({ account: { findMany: jest.fn().mockResolvedValue([{ id: 1 }]) } });
    await expect(crear(service, [LINEA_OK, LINEA_CONTRA])).rejects.toThrow(
      /Cuenta contable no disponible en esta empresa: 2/,
    );
  });

  it('valida también el centro de costo', async () => {
    const { service } = build({
      costCenter: { findMany: jest.fn().mockResolvedValue([]) },
    });
    await expect(
      crear(service, [
        { ...LINEA_OK, costCenterId: 99 },
        LINEA_CONTRA,
      ]),
    ).rejects.toThrow(/Centro de costo no disponible/);
  });

  it('no consulta centros de costo si ningún renglón los usa', async () => {
    const { service, prisma } = build();
    await crear(service, [LINEA_OK, LINEA_CONTRA]);
    expect(prisma.costCenter.findMany).not.toHaveBeenCalled();
  });

  it('una póliza correcta pasa', async () => {
    const { service, prisma } = build();
    await expect(crear(service, [LINEA_OK, LINEA_CONTRA])).resolves.toBeDefined();
    expect(prisma.journalEntry.create).toHaveBeenCalled();
  });

  it('el folio sale del contador atómico, no de un count()', async () => {
    const { service, folio } = build();
    await crear(service, [LINEA_OK, LINEA_CONTRA]);
    expect(folio.next).toHaveBeenCalledWith('JOURNAL_ENTRY', 7);
  });
});
