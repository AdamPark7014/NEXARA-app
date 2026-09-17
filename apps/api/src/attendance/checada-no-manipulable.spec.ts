import { UnprocessableEntityException } from '@nestjs/common';
import { AttendanceService } from './attendance.service.js';
import { MENSAJE_UBICACION_SIMULADA, MOTIVO_VALIDACION } from './asistencia-confiable.js';

/**
 * Lo que el teléfono dice y lo que el servidor se cree.
 *
 * Los dos trucos baratos para fabricar una entrada puntual son atrasar el reloj
 * del teléfono y poner una app de GPS falso. Aquí se fija que ninguno funcione,
 * y que lo que no se puede comprobar quede marcado en vez de rechazado: la app
 * 1.0.2 que la gente ya tiene instalada no manda ninguno de los campos nuevos.
 */

const FOTO = 'data:image/jpeg;base64,AAAA';

function build(over: Record<string, any> = {}) {
  const prisma: any = {
    attendance: {
      create: jest.fn().mockResolvedValue({ id: 1, user: { nombre: 'Ana' } }),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ id: 1, user: { nombre: 'Ana' } }),
      delete: jest.fn().mockResolvedValue({}),
    },
    attendanceDay: {
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 1, isOpen: true }),
      update: jest.fn().mockResolvedValue({}),
    },
    user: { update: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
    notification: { create: jest.fn().mockResolvedValue({}) },
    locationTracking: { create: jest.fn().mockResolvedValue({}), updateMany: jest.fn() },
    ...over,
  };

  const notifyAttendanceFlagged = jest.fn().mockResolvedValue(undefined);
  const service = new AttendanceService(
    prisma as any,
    { emit: jest.fn(), emitToCompany: jest.fn(), server: null } as any,
    {
      notifyAttendanceChange: jest.fn().mockResolvedValue(undefined),
      notifyAttendanceFlagged,
    } as any,
  );
  return { service, prisma, notifyAttendanceFlagged };
}

const entrada = (extra: Record<string, unknown> = {}) => ({
  type: 'entrada' as const,
  photoBase64: FOTO,
  ...extra,
});

/** Lo que quedó escrito en la fila de asistencia. */
const fila = (prisma: any) => prisma.attendance.create.mock.calls[0][0].data;

describe('la hora del teléfono no decide nada', () => {
  it('un `timestamp` atrasado media hora no se guarda como hora de la checada', async () => {
    const { service, prisma } = build();
    const mentira = new Date(Date.now() - 45 * 60 * 1000).toISOString();

    await service.register(entrada({ timestamp: mentira }) as any, 3, undefined, 7);

    const guardada = fila(prisma);
    expect(guardada.timestamp.toISOString()).not.toBe(mentira);
    expect(Math.abs(guardada.timestamp.getTime() - Date.now())).toBeLessThan(5000);
    expect(guardada.validacion).toBe('REVISAR');
    expect(guardada.motivoValidacion).toContain(MOTIVO_VALIDACION.horaTelefono);
    // La hora que dijo el teléfono no se tira: queda como dato informativo.
    expect(guardada.clientCapturedAt?.toISOString()).toBe(mentira);
  });

  it('una checada sin conexión respeta su hora de captura y queda PENDIENTE', async () => {
    const { service, prisma } = build();
    const capturada = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

    await service.register(
      entrada({
        offline: true,
        capturedAt: capturada,
        latitude: 19.074,
        longitude: -98.278,
        accuracyM: 15,
      }) as any,
      3,
      undefined,
      7,
    );

    const guardada = fila(prisma);
    expect(guardada.timestamp.toISOString()).toBe(capturada);
    expect(guardada.offline).toBe(true);
    expect(guardada.validacion).toBe('PENDIENTE');
    expect(guardada.motivoValidacion).toBe(MOTIVO_VALIDACION.sinConexion);
  });

  it('la app vieja, que no manda nada nuevo, sigue checando sin marcas de hora', async () => {
    const { service, prisma } = build();

    await service.register(entrada({ latitude: 19.074, longitude: -98.278 }) as any, 3, undefined, 7);

    const guardada = fila(prisma);
    expect(guardada.validacion).toBe('OK');
    expect(guardada.offline).toBe(false);
    expect(guardada.fueraDeSitio).toBe(false);
  });
});

describe('ubicación simulada', () => {
  it('no se registra: 422 con el mensaje del contrato', async () => {
    const { service, prisma } = build();

    await expect(
      service.register(entrada({ mockLocation: true }) as any, 3, undefined, 7),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.attendance.create).not.toHaveBeenCalled();
  });

  it('y sus jefes se enteran del intento', async () => {
    const { service, notifyAttendanceFlagged } = build();

    await service
      .register(entrada({ mockLocation: true }) as any, 3, undefined, 7)
      .catch((e: Error) => expect(e.message).toBe(MENSAJE_UBICACION_SIMULADA));

    expect(notifyAttendanceFlagged).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 3, titulo: expect.stringContaining('simulada') }),
    );
  });
});

describe('lo que no se puede comprobar se marca, no se rechaza', () => {
  it('sin ubicación: se acepta y queda a revisar', async () => {
    const { service, prisma } = build();

    await service.register(entrada() as any, 3, undefined, 7);

    const guardada = fila(prisma);
    expect(guardada.validacion).toBe('REVISAR');
    expect(guardada.motivoValidacion).toBe(MOTIVO_VALIDACION.sinUbicacion);
  });

  it('precisión de 500 m: se acepta y queda a revisar', async () => {
    const { service, prisma } = build();

    await service.register(
      entrada({ latitude: 19.074, longitude: -98.278, accuracyM: 500 }) as any,
      3,
      undefined,
      7,
    );

    const guardada = fila(prisma);
    expect(guardada.accuracyM).toBe(500);
    expect(guardada.validacion).toBe('REVISAR');
    expect(guardada.motivoValidacion).toBe(MOTIVO_VALIDACION.ubicacionImprecisa);
  });

  it('checar desde casa: fuera de sitio, con la distancia, y sus jefes avisados', async () => {
    const { service, prisma, notifyAttendanceFlagged } = build();

    await service.register(
      entrada({ latitude: 19.25, longitude: -98.45, accuracyM: 15 }) as any,
      3,
      undefined,
      7,
    );

    const guardada = fila(prisma);
    expect(guardada.fueraDeSitio).toBe(true);
    expect(guardada.distanciaSitioM).toBeGreaterThan(300);
    expect(guardada.sitioNombre).toBe('Oficina');
    expect(notifyAttendanceFlagged).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: 'Checada fuera de sitio' }),
    );
  });

  it('checar en la oficina no marca ni avisa a nadie', async () => {
    const { service, prisma, notifyAttendanceFlagged } = build();

    await service.register(
      entrada({ latitude: 19.0741, longitude: -98.2781, accuracyM: 12 }) as any,
      3,
      undefined,
      7,
    );

    const guardada = fila(prisma);
    expect(guardada.validacion).toBe('OK');
    expect(guardada.fueraDeSitio).toBe(false);
    expect(notifyAttendanceFlagged).not.toHaveBeenCalled();
  });
});
