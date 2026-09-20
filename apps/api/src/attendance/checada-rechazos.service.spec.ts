import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { AttendanceService } from './attendance.service.js';
import { MOTIVO_RECHAZO } from './asistencia-confiable.js';
import { PETICION_APP, peticionDeApp } from './peticion-de-app.testing.js';

/**
 * Lo que pasa con un intento que no se acepta.
 *
 * Antes, un 422 por ubicación simulada no dejaba rastro: al día siguiente no había forma
 * de demostrar que había ocurrido. Ahora el intento se guarda —quién, cuándo, desde
 * dónde, con qué teléfono y por qué— aunque la checada no entre a la nómina.
 *
 * También se fija aquí la decisión del dueño: desde el navegador no se checa, y la
 * puerta que queda abierta es que un jefe lo registre con motivo.
 */

const FOTO = 'data:image/jpeg;base64,AAAA';
const OFICINA = { latitude: 19.074, longitude: -98.278 };

function build(over: Record<string, any> = {}) {
  const prisma: any = {
    attendance: {
      create: jest.fn().mockResolvedValue({ id: 1, user: { nombre: 'Ana' } }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 1, user: { nombre: 'Ana' } }),
    },
    attendanceDay: {
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 1, isOpen: true }),
      update: jest.fn().mockResolvedValue({}),
    },
    attendanceRejection: {
      create: jest.fn().mockResolvedValue({ id: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    notification: { create: jest.fn().mockResolvedValue({}) },
    locationTracking: { create: jest.fn().mockResolvedValue({}), updateMany: jest.fn() },
    ...over,
  };

  const notifyAttendanceFlagged = jest.fn().mockResolvedValue(undefined);
  const service = new AttendanceService(
    prisma as any,
    { emit: jest.fn(), emitToCompany: jest.fn(), server: null } as any,
    { notifyAttendanceChange: jest.fn().mockResolvedValue(undefined), notifyAttendanceFlagged } as any,
  );
  return { service, prisma, notifyAttendanceFlagged };
}

const entrada = (extra: Record<string, unknown> = {}) => ({
  type: 'entrada' as const,
  photoBase64: FOTO,
  ...extra,
});

/** Lo que quedó escrito como intento rechazado. */
const rechazo = (prisma: any) => prisma.attendanceRejection.create.mock.calls[0][0].data;

describe('el intento rechazado queda registrado', () => {
  it('ubicación simulada: no se guarda la checada, pero sí quién lo intentó', async () => {
    const { service, prisma } = build();

    await expect(
      service.register(
        entrada({ mockLocation: true, latitude: 19.5, longitude: -98.5, accuracyM: 12 }) as any,
        3,
        PETICION_APP,
        7,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(prisma.attendance.create).not.toHaveBeenCalled();
    const fila = rechazo(prisma);
    expect(fila).toMatchObject({
      userId: 3,
      type: 'entrada',
      motivo: MOTIVO_RECHAZO.ubicacionSimulada,
      origen: 'ANDROID',
      companyId: 7,
      lat: 19.5,
      lng: -98.5,
      accuracyM: 12,
    });
    // El teléfono con el que se intentó: es lo que RH necesita para hablar con alguien.
    expect(String(fila.deviceInfo)).toMatch(/Android/);
    expect(fila.at).toBeInstanceOf(Date);
  });

  it('y sus jefes se enteran', async () => {
    const { service, notifyAttendanceFlagged } = build();

    await service
      .register(entrada({ mockLocation: true }) as any, 3, PETICION_APP, 7)
      .catch(() => undefined);

    expect(notifyAttendanceFlagged).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: 'Intento de checada con ubicación simulada' }),
    );
  });

  it('el registro no se cae si la tabla de intentos falla: primero está no dejar pasar la checada', async () => {
    const { service, prisma } = build({
      attendanceRejection: {
        create: jest.fn().mockRejectedValue(new Error('base caída')),
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    await expect(
      service.register(entrada({ mockLocation: true }) as any, 3, PETICION_APP, 7),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.attendance.create).not.toHaveBeenCalled();
  });
});

describe('desde el navegador no se checa', () => {
  const chrome =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36';

  it('la web recibe un 422 que dice qué hacer', async () => {
    const { service, prisma } = build();

    await expect(
      service.register(entrada({ ...OFICINA }) as any, 3, { headers: { 'user-agent': chrome } }, 7),
    ).rejects.toThrow(/app NEXARA/i);

    expect(prisma.attendance.create).not.toHaveBeenCalled();
    expect(rechazo(prisma)).toMatchObject({
      motivo: MOTIVO_RECHAZO.desdeNavegador,
      origen: 'WEB',
    });
  });

  it('no se despierta a los jefes por eso: es alguien que abrió la web, no un fraude', async () => {
    const { service, notifyAttendanceFlagged } = build();

    await service
      .register(entrada() as any, 3, { headers: { 'user-agent': chrome } }, 7)
      .catch(() => undefined);

    expect(notifyAttendanceFlagged).not.toHaveBeenCalled();
  });

  it('desde la app sí pasa, y queda anotado de cuál', async () => {
    const { service, prisma } = build();

    await service.register(
      entrada({ ...OFICINA, accuracyM: 10 }) as any,
      3,
      peticionDeApp('NexaraApp/1.4.0 (iOS 18.1; iPhone 16 Pro)'),
      7,
    );

    expect(prisma.attendance.create.mock.calls[0][0].data).toMatchObject({ origen: 'IOS' });
    expect(prisma.attendanceRejection.create).not.toHaveBeenCalled();
  });
});

describe('comprobaciones que solo ve el servidor', () => {
  it('Puebla y Ciudad de México con diez minutos de diferencia: no se acepta', async () => {
    const { service, prisma } = build({
      attendance: {
        create: jest.fn().mockResolvedValue({ id: 1, user: { nombre: 'Ana' } }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([
          {
            timestamp: new Date(Date.now() - 10 * 60_000),
            type: 'entrada',
            entryLatitude: 19.0414,
            entryLongitude: -98.2063,
            exitLatitude: null,
            exitLongitude: null,
          },
        ]),
        update: jest.fn(),
      },
    });

    await expect(
      service.register(
        entrada({ latitude: 19.4326, longitude: -99.1332, accuracyM: 10 }) as any,
        3,
        PETICION_APP,
        7,
      ),
    ).rejects.toThrow(/distancia imposible/i);

    const fila = rechazo(prisma);
    expect(fila.motivo).toBe(MOTIVO_RECHAZO.viajeImposible);
    expect(String(fila.detalle)).toMatch(/km\/h/);
  });

  it('una medición de hace media hora no dice dónde está su dueño', async () => {
    const { service, prisma } = build();

    await expect(
      service.register(
        entrada({ ...OFICINA, accuracyM: 10, fixAgeMs: 45 * 60_000 }) as any,
        3,
        PETICION_APP,
        7,
      ),
    ).rejects.toThrow(/ubicación vieja/i);

    expect(rechazo(prisma).motivo).toBe(MOTIVO_RECHAZO.ubicacionVieja);
  });

  it('una de hace siete minutos se acepta, pero queda para revisar', async () => {
    const { service, prisma } = build();

    await service.register(
      entrada({ ...OFICINA, accuracyM: 10, fixAgeMs: 7 * 60_000 }) as any,
      3,
      PETICION_APP,
      7,
    );

    const guardada = prisma.attendance.create.mock.calls[0][0].data;
    expect(guardada.validacion).toBe('REVISAR');
    expect(guardada.motivoValidacion).toMatch(/no era del momento/i);
    expect(guardada.fixAgeMs).toBe(7 * 60_000);
  });

  it('la misma coordenada exacta tres veces se marca, pero no deja a nadie sin checar', async () => {
    const calcada = {
      timestamp: new Date(Date.now() - 24 * 3_600_000),
      type: 'entrada',
      entryLatitude: OFICINA.latitude,
      entryLongitude: OFICINA.longitude,
      exitLatitude: null,
      exitLongitude: null,
    };
    const { service, prisma } = build({
      attendance: {
        create: jest.fn().mockResolvedValue({ id: 1, user: { nombre: 'Ana' } }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([calcada, { ...calcada }]),
        update: jest.fn(),
      },
    });

    await service.register(entrada({ ...OFICINA, accuracyM: 10 }) as any, 3, PETICION_APP, 7);

    const guardada = prisma.attendance.create.mock.calls[0][0].data;
    expect(guardada.validacion).toBe('REVISAR');
    expect(guardada.motivoValidacion).toMatch(/misma coordenada/i);
  });
});

describe('la salida de emergencia: el jefe registra la checada', () => {
  const jefe = { id: 9, email: 'rh@nexara.com.mx', roleKey: 'rh', permissions: [] };

  it('queda con quién la puso, por qué, y en REVISAR', async () => {
    const { service, prisma } = build();

    const r = await service.registrarPorJefe(
      jefe,
      { userId: 3, type: 'entrada', motivo: 'Se le descompuso el teléfono en la obra' },
      7,
    );

    expect(r.message).toMatch(/Entrada registrada/);
    const guardada = prisma.attendance.create.mock.calls[0][0].data;
    expect(guardada).toMatchObject({
      userId: 3,
      type: 'entrada',
      registradaPorId: 9,
      motivoRegistro: 'Se le descompuso el teléfono en la obra',
      // Nadie midió nada: no es una checada como las demás y así se ve.
      validacion: 'REVISAR',
      origen: null,
    });
    expect(guardada.photoUrl).toBeUndefined();
  });

  it('sin motivo de verdad no se registra', async () => {
    const { service, prisma } = build();

    await expect(
      service.registrarPorJefe(jefe, { userId: 3, type: 'entrada', motivo: 'ok' }, 7),
    ).rejects.toThrow(/motivo/i);
    expect(prisma.attendance.create).not.toHaveBeenCalled();
  });

  it('nadie se registra su propia checada por esta puerta', async () => {
    const { service } = build();

    await expect(
      service.registrarPorJefe(jefe, { userId: 9, type: 'entrada', motivo: 'Olvidé checar hoy' }, 7),
    ).rejects.toThrow(/desde la app/i);
  });

  it('un jefe no puede registrarle la checada a quien no es de su equipo', async () => {
    const { service } = build({
      user: {
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          { id: 9, email: 'coordinador@nexara.com.mx', managerId: null },
          { id: 3, email: 'otra@nexara.com.mx', managerId: 50 },
        ]),
      },
    });

    await expect(
      service.registrarPorJefe(
        { id: 9, email: 'coordinador@nexara.com.mx', roleKey: 'coordinador', permissions: [] },
        { userId: 3, type: 'entrada', motivo: 'Se quedó sin batería el teléfono' },
        7,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('no se puede fabricar una checada del futuro', async () => {
    const { service } = build();

    await expect(
      service.registrarPorJefe(
        jefe,
        {
          userId: 3,
          type: 'entrada',
          timestamp: new Date(Date.now() + 3 * 3_600_000).toISOString(),
          motivo: 'Adelantando la checada de mañana',
        },
        7,
      ),
    ).rejects.toThrow(/futuro/i);
  });
});
