import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OvertimeApprovalsService } from './overtime-approvals.service.js';

/** Organigrama: 1 dirección · 8 jefe de 16 · 16 instalador · 41 contadora (jefe: 1). */
const JEFES: Record<number, number | null> = { 1: null, 8: 1, 16: 8, 41: 1 };

function armar(fila: Record<string, unknown> | null = { id: 5, userId: 16, estado: 'PENDIENTE', companyId: 1 }) {
  const update = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 5, ...data }));
  const prisma = {
    overtimeApproval: { findFirst: jest.fn().mockResolvedValue(fila), update },
    user: { findUnique: jest.fn(async ({ where }: { where: { id: number } }) => ({ managerId: JEFES[where.id] ?? null })) },
  };
  return { service: new OvertimeApprovalsService(prisma as never), update };
}

describe('solo un jefe decide el tiempo extra (Adam, 29-10)', () => {
  it('su jefe directo sí, y el jefe de su jefe también', async () => {
    const a = armar();
    await expect(a.service.decide(5, 'APROBADO', { id: 8 }, null, 1)).resolves.toMatchObject({ estado: 'APROBADO', aprobadoPorId: 8 });
    const b = armar();
    await expect(b.service.decide(5, 'RECHAZADO', { id: 1, roleKey: 'administrativo' }, 'no', 1)).resolves.toMatchObject({ estado: 'RECHAZADO' });
  });

  it('dirección sí, aunque no esté en la cadena', async () => {
    const a = armar({ id: 5, userId: 41, estado: 'PENDIENTE', companyId: 1 });
    await expect(a.service.decide(5, 'APROBADO', { id: 2, roleKey: 'ceo' }, null, 1)).resolves.toMatchObject({ aprobadoPorId: 2 });
  });

  it('la contadora o RH sin ser su jefe no; nadie el suyo', async () => {
    const a = armar();
    await expect(a.service.decide(5, 'APROBADO', { id: 41, roleKey: 'administrativo' }, null, 1)).rejects.toThrow(ForbiddenException);
    expect(a.update).not.toHaveBeenCalled();
    const b = armar();
    await expect(b.service.decide(5, 'APROBADO', { id: 16, roleKey: 'ceo' }, null, 1)).rejects.toThrow('propias horas extra');
  });

  it('una fila ya decidida no se vuelve a decidir', async () => {
    const a = armar({ id: 5, userId: 16, estado: 'APROBADO', companyId: 1 });
    await expect(a.service.decide(5, 'RECHAZADO', { id: 8 }, null, 1)).rejects.toThrow(BadRequestException);
  });
});
