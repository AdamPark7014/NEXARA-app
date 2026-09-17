import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AttendanceService } from './attendance.service.js';
import { MOTIVO_VALIDACION } from './asistencia-confiable.js';

/**
 * La salida que nadie registró y la hora que alguien tuvo que corregir.
 *
 * Dos agujeros de los que sale la nómina: una jornada sin salida seguía abierta
 * —y al día siguiente esa persona no podía checar—, y no había forma de
 * arreglar una hora mal puesta sin entrar a la base a mano.
 */

function build(over: Record<string, any> = {}) {
  const prisma: any = {
    attendance: {
      create: jest.fn().mockResolvedValue({ id: 11 }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 5, ...data })),
    },
    attendanceDay: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
    },
    attendanceCorrection: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
    notification: { create: jest.fn().mockResolvedValue({}) },
    ...over,
  };
  const notifyAttendanceFlagged = jest.fn().mockResolvedValue(undefined);
  const service = new AttendanceService(
    prisma as any,
    { emit: jest.fn(), emitToCompany: jest.fn(), server: null } as any,
    { notifyAttendanceChange: jest.fn(), notifyAttendanceFlagged } as any,
  );
  return { service, prisma, notifyAttendanceFlagged };
}

describe('cierre automático de las 23:30', () => {
  it('pone la salida a entrada + 9 h y deja la jornada cerrada', async () => {
    const entrada = new Date('2026-09-17T15:00:00Z'); // 09:00 mx
    const { service, prisma } = build({
      attendanceDay: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 3, userId: 7, lastEntryAt: entrada, companyId: 1 }]),
        update: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({}),
      },
    });

    const res = await service.cerrarJornadasOlvidadas(new Date('2026-09-18T05:30:00Z'));

    expect(res.cerradas).toBe(1);
    const salida = prisma.attendance.create.mock.calls[0][0].data;
    expect(salida.timestamp.toISOString()).toBe('2026-09-18T00:00:00.000Z');
    expect(salida.cierreAutomatico).toBe(true);
    expect(salida.validacion).toBe('REVISAR');
    expect(salida.motivoValidacion).toBe(MOTIVO_VALIDACION.cierreAutomatico);
    expect(prisma.attendanceDay.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isOpen: false, totalMinutes: { increment: 540 } }),
      }),
    );
  });

  it('avisa a la persona y a sus jefes', async () => {
    const entrada = new Date('2026-09-17T15:00:00Z');
    const { service, notifyAttendanceFlagged } = build({
      attendanceDay: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 3, userId: 7, lastEntryAt: entrada, companyId: 1 }]),
        update: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({}),
      },
    });

    await service.cerrarJornadasOlvidadas(new Date('2026-09-18T05:30:00Z'));

    expect(notifyAttendanceFlagged).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, avisarPersona: true }),
    );
  });

  it('sin jornadas abiertas no inventa nada', async () => {
    const { service, prisma } = build();
    await expect(service.cerrarJornadasOlvidadas()).resolves.toEqual({ cerradas: 0 });
    expect(prisma.attendance.create).not.toHaveBeenCalled();
  });
});

describe('corregir la hora de una checada', () => {
  const christian = { id: 1, email: 'gerencia@nexara.com.mx' };
  const rh = { id: 2, email: 'rh@nexara.com.mx', roleKey: 'rh' };
  const coordinador = { id: 3, email: 'coord@nexara.com.mx', roleKey: 'coord_operaciones' };
  const cuerpo = { timestamp: '2026-09-17T14:05:00Z', motivo: 'Entró a planta sin señal' };

  it('un coordinador no puede mover una hora', async () => {
    const { service, prisma } = build();
    await expect(service.corregirChecada(coordinador as any, 5, cuerpo, 7)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.attendance.update).not.toHaveBeenCalled();
  });

  it('un motivo de menos de 10 caracteres no vale', async () => {
    const { service } = build();
    await expect(
      service.corregirChecada(christian as any, 5, { ...cuerpo, motivo: 'error' }, 7),
    ).rejects.toThrow(BadRequestException);
  });

  it('dirección corrige y queda el antes, el después y el motivo', async () => {
    const antes = new Date('2026-09-17T15:00:00Z');
    const { service, prisma } = build({
      attendance: {
        findFirst: jest.fn().mockResolvedValue({ id: 5, userId: 7, type: 'entrada', timestamp: antes }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ id: 5 }),
        create: jest.fn(),
      },
    });

    await service.corregirChecada(christian as any, 5, cuerpo, 7);

    expect(prisma.attendance.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ validacion: 'OK' }) }),
    );
    expect(prisma.attendanceCorrection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attendanceId: 5,
        antes,
        motivo: 'Entró a planta sin señal',
        porId: 1,
      }),
    });
  });

  it('RH también puede', async () => {
    const { service, prisma } = build({
      attendance: {
        findFirst: jest.fn().mockResolvedValue({
          id: 5,
          userId: 7,
          type: 'salida',
          timestamp: new Date('2026-09-18T01:00:00Z'),
        }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ id: 5 }),
        create: jest.fn(),
      },
    });

    await service.corregirChecada(rh as any, 5, cuerpo, 7);

    expect(prisma.attendanceCorrection.create).toHaveBeenCalled();
  });

  it('una hora inválida no toca la checada', async () => {
    const { service, prisma } = build();
    await expect(
      service.corregirChecada(christian as any, 5, { timestamp: 'ayer', motivo: cuerpo.motivo }, 7),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.attendance.update).not.toHaveBeenCalled();
  });
});
