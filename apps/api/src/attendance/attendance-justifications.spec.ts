import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import {
  AttendanceJustificationsService,
  canJustifyAbsence,
  fechaCorta,
  JUSTIFY_FORBIDDEN,
  parseJustificationDate,
  UNJUSTIFY_FORBIDDEN,
} from './attendance-justifications.service';

const CHRISTIAN = { id: 1, email: 'gerencia@nexara.com.mx', isSuperAdmin: true };
const CLAUDIA = { id: 8, email: 'claudia.bernal@nexara.com.mx', isSuperAdmin: true };
const ADAM = { id: 9, email: 'developer@nexara.com.mx', isSuperAdmin: true };
const JEFE = { id: 4, email: 'jose.ramirez@nexara.com.mx', permissions: ['attendance.manage'] };
const TECNICO = { id: 5, email: 'soporte@nexara.com.mx', permissions: ['attendance.view'] };
const MOTIVO = 'Cita médica con comprobante del IMSS';

function build(over: { entrada?: boolean; existente?: boolean; persona?: unknown } = {}) {
  const prisma = {
    user: {
      findFirst: jest
        .fn()
        .mockResolvedValue(over.persona === undefined ? { id: 5, email: 'soporte@nexara.com.mx' } : over.persona),
    },
    attendance: { findFirst: jest.fn().mockResolvedValue(over.entrada ? { id: 77 } : null) },
    attendanceJustification: {
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(over.existente || where.id ? { id: 3 } : null),
      ),
      create: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: 3,
          userId: data.userId,
          date: data.date,
          reason: data.reason,
          createdAt: new Date('2026-09-17T16:00:00Z'),
          justifiedBy: { id: data.justifiedById, nombre: 'Christian Del Pozo' },
        }),
      ),
      delete: jest.fn().mockResolvedValue({ id: 3 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const hierarchy = { notifyAbsenceJustified: jest.fn().mockResolvedValue(undefined) };
  const service = new AttendanceJustificationsService(prisma as any, hierarchy as any);
  return { service, prisma, hierarchy };
}

describe('faltas justificadas · reglas', () => {
  it('solo Christian y su equivalente justifican (ni la cuenta de desarrollo ni los jefes)', () => {
    expect(canJustifyAbsence(CHRISTIAN)).toBe(true);
    expect(canJustifyAbsence(CLAUDIA)).toBe(true);
    expect(canJustifyAbsence(ADAM)).toBe(false);
    expect(canJustifyAbsence(JEFE)).toBe(false);
    expect(canJustifyAbsence(null)).toBe(false);
  });

  it('la fecha es AAAA-MM-DD real y no futura', () => {
    const hoy = new Date('2026-09-17T18:00:00Z');
    expect(parseJustificationDate('2026-09-16', hoy)).toBe('2026-09-16');
    expect(parseJustificationDate('2026-09-17', hoy)).toBe('2026-09-17');
    expect(parseJustificationDate('2026-09-18', hoy)).toBeNull();
    expect(parseJustificationDate('2026-02-30', hoy)).toBeNull();
    expect(parseJustificationDate('16/09/2026', hoy)).toBeNull();
  });

  it('escribe la fecha del aviso como «mié 16 sep»', () => {
    expect(fechaCorta('2026-09-16')).toBe('mié 16 sep');
  });
});

describe('AttendanceJustificationsService', () => {
  it('Christian justifica: guarda motivo, quién y el día, sin crear checadas, y avisa', async () => {
    const { service, prisma, hierarchy } = build();
    const dto = await service.justify(CHRISTIAN, { userId: 5, fecha: '2026-09-16', motivo: MOTIVO }, 7);

    const data = prisma.attendanceJustification.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ userId: 5, companyId: 7, reason: MOTIVO, justifiedById: 1 });
    expect(data.date.toISOString()).toBe('2026-09-16T00:00:00.000Z');
    expect((prisma.attendance as any).create).toBeUndefined();
    expect(dto).toMatchObject({
      fecha: '2026-09-16',
      motivo: MOTIVO,
      estado: 'FALTA_JUSTIFICADA',
      etiqueta: `Falta justificada · ${MOTIVO}`,
      justificadaPor: { id: 1, nombre: 'Christian Del Pozo' },
    });
    expect(hierarchy.notifyAbsenceJustified).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 5, actorId: 1, fecha: 'mié 16 sep', motivo: MOTIVO }),
    );
  });

  it('un jefe, la persona o la cuenta de desarrollo reciben 403', async () => {
    const { service, prisma } = build();
    for (const actor of [JEFE, TECNICO, ADAM]) {
      await expect(service.justify(actor, { userId: 5, fecha: '2026-09-16', motivo: MOTIVO }, 7)).rejects.toThrow(
        new ForbiddenException(JUSTIFY_FORBIDDEN),
      );
    }
    expect(prisma.attendanceJustification.create).not.toHaveBeenCalled();
  });

  it('el motivo es obligatorio (mínimo 10 caracteres)', async () => {
    const { service } = build();
    await expect(service.justify(CHRISTIAN, { userId: 5, fecha: '2026-09-16', motivo: 'enfermo' }, 7)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('un día con checada de entrada no es falta', async () => {
    const { service } = build({ entrada: true });
    await expect(service.justify(CHRISTIAN, { userId: 5, fecha: '2026-09-16', motivo: MOTIVO }, 7)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('no se justifica dos veces el mismo día', async () => {
    const { service } = build({ existente: true });
    await expect(service.justify(CHRISTIAN, { userId: 5, fecha: '2026-09-16', motivo: MOTIVO }, 7)).rejects.toThrow(
      ConflictException,
    );
  });

  it('solo Christian quita una falta justificada', async () => {
    const { service, prisma } = build();
    await expect(service.remove(JEFE, 3, 7)).rejects.toThrow(new ForbiddenException(UNJUSTIFY_FORBIDDEN));
    expect(prisma.attendanceJustification.delete).not.toHaveBeenCalled();
    await expect(service.remove(CLAUDIA, 3, 7)).resolves.toEqual({ removed: true, id: 3 });
  });

  it('cada quien ve las suyas; ver las de otro exige gestión de asistencia', async () => {
    const { service } = build();
    await expect(service.listForUser(TECNICO, {}, 7)).resolves.toEqual([]);
    await expect(service.listForUser(TECNICO, { userId: '6' }, 7)).rejects.toThrow(ForbiddenException);
    await expect(service.listForUser(JEFE, { userId: '5' }, 7)).resolves.toEqual([]);
  });
});
