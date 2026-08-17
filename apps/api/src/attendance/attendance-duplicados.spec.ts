import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AttendanceService } from './attendance.service.js';

/**
 * Duplicados de asistencia bajo concurrencia.
 *
 * `register` comprueba si ya hay entrada del día y luego crea. Entre las dos
 * cosas caben dos peticiones —un doble toque en el móvil, un reintento por red
 * mala— y ambas pasaban la comprobación. En producción ya ocurrió: un usuario
 * con dos salidas el mismo día. De estos registros sale la nómina.
 *
 * Ahora lo impide un índice único; estas pruebas fijan que el choque del índice
 * se traduzca al mismo mensaje que da la comprobación previa, para que quien lo
 * lea no tenga que distinguir un caso del otro.
 */

const P2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
  code: 'P2002',
  clientVersion: 'test',
});

function build(over: Record<string, any> = {}) {
  const prisma = {
    attendance: {
      create: jest.fn().mockResolvedValue({ id: 1, user: { nombre: 'Ana' } }),
      findFirst: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({}),
    },
    attendanceDay: {
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 1, isOpen: true }),
      update: jest.fn().mockResolvedValue({}),
    },
    user: { update: jest.fn().mockResolvedValue({}) },
    notification: { create: jest.fn().mockResolvedValue({}) },
    locationTracking: { create: jest.fn().mockResolvedValue({}) },
    ...over,
  };

  const service = new AttendanceService(
    prisma as any,
    { emit: jest.fn(), emitToCompany: jest.fn(), server: null } as any,
    { notifyAttendanceChange: jest.fn().mockResolvedValue(undefined) } as any,
  );
  return { service, prisma };
}

const entrada = { type: 'entrada' as const };

describe('entrada duplicada', () => {
  it('la comprobación previa sigue dando el mensaje claro', async () => {
    const { service } = build({
      attendance: { findFirst: jest.fn().mockResolvedValue({ id: 9 }) },
    });
    await expect(service.register(entrada as any, 3, undefined, 7)).rejects.toThrow(
      'Ya existe una entrada registrada para hoy',
    );
  });

  it('si dos peticiones cruzan la comprobación, la base para la segunda', async () => {
    // Es el caso real: doble toque en el movil.
    const { service } = build({
      attendance: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(P2002),
      },
    });
    await expect(service.register(entrada as any, 3, undefined, 7)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('y el mensaje es el mismo que el de la comprobación previa', async () => {
    const { service } = build({
      attendance: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(P2002),
      },
    });
    await expect(service.register(entrada as any, 3, undefined, 7)).rejects.toThrow(
      'Ya existe una entrada registrada para hoy',
    );
  });

  it('el registro lleva el día de la jornada resuelto', async () => {
    // Sin `workDate` no se puede exigir la regla en la base: convertir zonas no
    // es inmutable en Postgres y `timestamp::date` no se puede indexar asi.
    const { service, prisma } = build();
    await service.register(entrada as any, 3, undefined, 7);

    const data = prisma.attendance.create.mock.calls[0][0].data;
    expect(data.workDate).toBeInstanceOf(Date);
    expect(data.type).toBe('entrada');
  });

  it('un error que no sea de unicidad se propaga tal cual', async () => {
    // Tragarlo dejaria pasar fallos reales disfrazados de duplicado.
    const caida = new Error('base caída');
    const { service } = build({
      attendance: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(caida),
      },
    });
    await expect(service.register(entrada as any, 3, undefined, 7)).rejects.toThrow('base caída');
  });

  it('sin usuario autenticado no registra nada', async () => {
    const { service, prisma } = build();
    await expect(service.register(entrada as any, 0, undefined, 7)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.attendance.create).not.toHaveBeenCalled();
  });

  it('no deja abrir jornada nueva con una anterior sin cerrar', async () => {
    const { service } = build({
      attendance: { findFirst: jest.fn().mockResolvedValue(null) },
      attendanceDay: { findFirst: jest.fn().mockResolvedValue({ id: 5, isOpen: true }) },
    });
    await expect(service.register(entrada as any, 3, undefined, 7)).rejects.toThrow(
      /jornada abierta/,
    );
  });
});
