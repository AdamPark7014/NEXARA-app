import { PETICION_APP } from './peticion-de-app.testing.js';
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

// La foto es obligatoria y se comprueba antes que nada: sin ella `register`
// corta ahí y estas pruebas nunca llegaban a lo que quieren fijar.
const entrada = { type: 'entrada' as const, photoBase64: 'data:image/jpeg;base64,AAAA' };

describe('entrada duplicada', () => {
  it('la comprobación previa sigue dando el mensaje claro', async () => {
    const { service } = build({
      attendance: { findFirst: jest.fn().mockResolvedValue({ id: 9 }) },
    });
    await expect(service.register(entrada as any, 3, PETICION_APP, 7)).rejects.toThrow(
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
    await expect(service.register(entrada as any, 3, PETICION_APP, 7)).rejects.toThrow(
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
    await expect(service.register(entrada as any, 3, PETICION_APP, 7)).rejects.toThrow(
      'Ya existe una entrada registrada para hoy',
    );
  });

  it('el registro lleva el día de la jornada resuelto', async () => {
    // Sin `workDate` no se puede exigir la regla en la base: convertir zonas no
    // es inmutable en Postgres y `timestamp::date` no se puede indexar asi.
    const { service, prisma } = build();
    await service.register(entrada as any, 3, PETICION_APP, 7);

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
    await expect(service.register(entrada as any, 3, PETICION_APP, 7)).rejects.toThrow('base caída');
  });

  it('sin usuario autenticado no registra nada', async () => {
    const { service, prisma } = build();
    await expect(service.register(entrada as any, 0, PETICION_APP, 7)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.attendance.create).not.toHaveBeenCalled();
  });

  it('no deja abrir jornada nueva con otra del MISMO día sin cerrar', async () => {
    const hoy = new Date(
      Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        new Date().getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
    // El día laboral de México puede ir un día por detrás del UTC; se calcula igual que el servicio.
    const { service } = build({
      attendance: { findFirst: jest.fn().mockResolvedValue(null) },
      attendanceDay: {
        findFirst: jest.fn().mockResolvedValue({ id: 5, isOpen: true, date: hoy }),
        upsert: jest.fn().mockResolvedValue({ id: 5 }),
        update: jest.fn().mockResolvedValue({}),
      },
    });
    const service2 = service as any;
    const diaDeHoy = service2.getDateOnly(new Date());
    service2.prisma.attendanceDay.findFirst = jest
      .fn()
      .mockResolvedValue({ id: 5, isOpen: true, date: diaDeHoy });

    await expect(service.register(entrada as any, 3, PETICION_APP, 7)).rejects.toThrow(
      /jornada abierta/,
    );
  });

  it('pero una jornada abierta de AYER se cierra sola y la entrada de hoy pasa', async () => {
    // Antes esto dejaba a la persona sin poder checar hasta que alguien tocaba la base.
    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { service, prisma } = build({
      attendance: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 1, user: { nombre: 'Ana' } }),
        delete: jest.fn().mockResolvedValue({}),
      },
      attendanceDay: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 5, userId: 3, isOpen: true, date: ayer, lastEntryAt: ayer }),
        upsert: jest.fn().mockResolvedValue({ id: 6, isOpen: true }),
        update: jest.fn().mockResolvedValue({}),
      },
    });

    await expect(service.register(entrada as any, 3, PETICION_APP, 7)).resolves.toMatchObject({
      message: expect.stringContaining('Entrada'),
    });
    // La salida inventada queda marcada como cierre automático y a revisión.
    const cierre = prisma.attendance.create.mock.calls
      .map((c: any[]) => c[0].data)
      .find((d: any) => d.cierreAutomatico);
    expect(cierre).toMatchObject({ type: 'salida', validacion: 'REVISAR' });
  });
});
