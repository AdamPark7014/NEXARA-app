import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AttendanceService } from './attendance.service.js';

/**
 * Cumplimiento con uniforme: el jefe mira la foto de entrada y marca ✓ / ✗.
 * De aquí sale el KPI del dashboard; nadie puede calificarse a sí mismo.
 */

const jefe = { id: 10, email: 'operaciones@nexara.com.mx', roleKey: 'coord_operaciones' };
const tecnico = { id: 20, email: 'tecnico@nexara.com.mx', managerId: 10 };
const ajeno = { id: 30, email: 'ventas@nexara.com.mx', roleKey: 'vendedor' };
const rh = { id: 40, email: 'rh@nexara.com.mx', roleKey: 'rh' };
const christian = { id: 1, email: 'gerencia@nexara.com.mx' };

function build(checada: { id: number; userId: number; type: string } | null = { id: 5, userId: 20, type: 'entrada' }) {
  const prisma: any = {
    attendance: {
      findFirst: jest.fn().mockResolvedValue(checada),
      update: jest.fn().mockImplementation(({ where, data }: any) =>
        Promise.resolve({ id: where.id, userId: checada?.userId, ...data }),
      ),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([
        { id: 10, email: jefe.email, managerId: 1 },
        { id: tecnico.id, email: tecnico.email, managerId: tecnico.managerId },
        { id: 30, email: ajeno.email, managerId: 1 },
        { id: 40, email: rh.email, managerId: 1 },
      ]),
    },
  };
  const service = new AttendanceService(
    prisma as any,
    { emit: jest.fn(), emitToCompany: jest.fn(), server: null } as any,
    { notifyAttendanceChange: jest.fn(), notifyAttendanceFlagged: jest.fn() } as any,
  );
  return { service, prisma };
}

describe('marcar uniforme en la entrada', () => {
  it('su jefe marca ✓ y queda quién y cuándo', async () => {
    const { service, prisma } = build();
    const res = await service.marcarUniforme(jefe, 5, { ok: true }, 7);
    expect(prisma.attendance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: expect.objectContaining({ uniformeOk: true, uniformeRevisadoPorId: 10, uniformeRevisadoAt: expect.any(Date) }),
      }),
    );
    expect(res.message).toBe('Con uniforme');
    expect(typeof res.data.uniformeRevisadoAt).toBe('string');
  });

  it('✗ también se guarda, y null la regresa a «sin revisar»', async () => {
    const { service, prisma } = build();
    await service.marcarUniforme(jefe, 5, { ok: false }, 7);
    expect(prisma.attendance.update.mock.calls[0][0].data.uniformeOk).toBe(false);
    await service.marcarUniforme(jefe, 5, { ok: null }, 7);
    expect(prisma.attendance.update.mock.calls[1][0].data).toEqual({
      uniformeOk: null,
      uniformeRevisadoPorId: null,
      uniformeRevisadoAt: null,
    });
  });

  it('nadie califica su propio uniforme', async () => {
    const { service, prisma } = build({ id: 5, userId: 10, type: 'entrada' });
    await expect(service.marcarUniforme(jefe, 5, { ok: true }, 7)).rejects.toThrow(ForbiddenException);
    expect(prisma.attendance.update).not.toHaveBeenCalled();
  });

  it('alguien que no es su jefe no puede', async () => {
    const { service, prisma } = build();
    await expect(service.marcarUniforme(ajeno, 5, { ok: true }, 7)).rejects.toThrow(ForbiddenException);
    expect(prisma.attendance.update).not.toHaveBeenCalled();
  });

  it('RH y dirección sí, aunque no estén en su organigrama', async () => {
    const a = build();
    await a.service.marcarUniforme(rh, 5, { ok: true }, 7);
    expect(a.prisma.attendance.update).toHaveBeenCalled();
    const b = build();
    await b.service.marcarUniforme(christian, 5, { ok: false }, 7);
    expect(b.prisma.attendance.update).toHaveBeenCalled();
  });

  it('solo en entradas y con un valor válido', async () => {
    await expect(
      build({ id: 6, userId: 20, type: 'salida' }).service.marcarUniforme(jefe, 6, { ok: true }, 7),
    ).rejects.toThrow(BadRequestException);
    await expect(build().service.marcarUniforme(jefe, 5, { ok: 'si' as any }, 7)).rejects.toThrow(
      BadRequestException,
    );
    await expect(build().service.marcarUniforme(jefe, 5, {}, 7)).rejects.toThrow(BadRequestException);
    await expect(build(null).service.marcarUniforme(jefe, 99, { ok: true }, 7)).rejects.toThrow(NotFoundException);
  });
});
