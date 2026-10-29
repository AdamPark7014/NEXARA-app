import { UnprocessableEntityException } from '@nestjs/common';
import { AttendanceService } from './attendance.service.js';
import { MOTIVO_RECHAZO } from './asistencia-confiable.js';
import { tramosQueCuentan } from './estado-ubicacion.js';
import { PETICION_APP } from './peticion-de-app.testing.js';
import {
  MENSAJE_SIN_PERMISO_UBICACION,
  MENSAJE_UBICACION_APAGADA,
  rechazoPorUbicacion,
} from './ubicacion-obligatoria.js';

/**
 * Adam (28-10-2026): «fuerza a que se deba comenzar a tomar la ubicación… y si no la tienen prendida
 * les marque errores: enciende tu ubicación», con «un margen de error de 5–10 minutos por temas de
 * internet».
 */

const FOTO = 'data:image/jpeg;base64,AAAA';

function build() {
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
    attendanceRejection: { create: jest.fn().mockResolvedValue({ id: 1 }), findMany: jest.fn().mockResolvedValue([]) },
    user: { update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
    notification: { create: jest.fn().mockResolvedValue({}) },
    locationTracking: { create: jest.fn().mockResolvedValue({}), updateMany: jest.fn() },
  };
  const notifyAttendanceFlagged = jest.fn().mockResolvedValue(undefined);
  const service = new AttendanceService(
    prisma,
    { emit: jest.fn(), emitToCompany: jest.fn(), server: null } as any,
    { notifyAttendanceChange: jest.fn().mockResolvedValue(undefined), notifyAttendanceFlagged } as any,
  );
  return { service, prisma, notifyAttendanceFlagged };
}

describe('ubicación obligatoria para checar', () => {
  it('apagada o sin permiso se rechaza; sin señal, error o app vieja no', () => {
    expect(rechazoPorUbicacion({ coords: null, falla: 'UBICACION_APAGADA' })).toEqual({
      motivo: MOTIVO_RECHAZO.ubicacionApagada,
      mensaje: MENSAJE_UBICACION_APAGADA,
    });
    expect(rechazoPorUbicacion({ coords: null, falla: 'PERMISO_NEGADO' })).toEqual({
      motivo: MOTIVO_RECHAZO.sinPermisoUbicacion,
      mensaje: MENSAJE_SIN_PERMISO_UBICACION,
    });
    for (const falla of ['SIN_SENAL', 'NO_DISPONIBLE', 'ERROR', null, undefined]) {
      expect(rechazoPorUbicacion({ coords: null, falla })).toBeNull();
    }
  });

  it('con coordenadas o capturada sin conexión no se rechaza', () => {
    expect(rechazoPorUbicacion({ coords: { latitude: 19.07, longitude: -98.27 }, falla: 'UBICACION_APAGADA' })).toBeNull();
    expect(rechazoPorUbicacion({ coords: null, falla: 'UBICACION_APAGADA', offline: true })).toBeNull();
  });

  it('el texto no dispara la ayuda de «solo desde la app» que ya traen las apps', () => {
    expect(MENSAJE_UBICACION_APAGADA.toLowerCase()).not.toContain('app nexara');
    expect(MENSAJE_SIN_PERMISO_UBICACION.toLowerCase()).not.toContain('app nexara');
  });

  it('la checada no se guarda: 422 con el mensaje, queda el intento y no se despierta a los jefes', async () => {
    const { service, prisma, notifyAttendanceFlagged } = build();
    await expect(
      service.register({ type: 'entrada', photoBase64: FOTO, ubicacionFalla: 'UBICACION_APAGADA' } as any, 3, PETICION_APP, 7),
    ).rejects.toThrow(new UnprocessableEntityException(MENSAJE_UBICACION_APAGADA));
    expect(prisma.attendance.create).not.toHaveBeenCalled();
    expect(prisma.attendanceRejection.create.mock.calls[0][0].data).toMatchObject({
      userId: 3,
      type: 'entrada',
      motivo: 'UBICACION_APAGADA',
    });
    expect(notifyAttendanceFlagged).not.toHaveBeenCalled();
  });

  it('la salida también la pide', async () => {
    const { service } = build();
    await expect(
      service.register({ type: 'salida', photoBase64: FOTO, ubicacionFalla: 'PERMISO_NEGADO' } as any, 3, PETICION_APP, 7),
    ).rejects.toThrow(MENSAJE_SIN_PERMISO_UBICACION);
  });
});

describe('margen de 10 min en los tramos sin ubicación', () => {
  const tramo = (minutos: number, hasta: string | null = '2026-10-28T23:00:00.000Z') => ({
    estado: 'APAGADA' as const,
    desde: '2026-10-28T22:50:00.000Z',
    hasta,
    minutos,
  });

  it('«Ubicación apagada 0 min» y los de menos de 10 min no se marcan; desde 10, sí', () => {
    expect(tramosQueCuentan([tramo(0), tramo(2), tramo(9)])).toEqual([]);
    expect(tramosQueCuentan([tramo(10), tramo(45)]).map((t) => t.minutos)).toEqual([10, 45]);
  });

  it('uno abierto se marca hasta que pasa el margen', () => {
    expect(tramosQueCuentan([tramo(3, null)])).toEqual([]);
    expect(tramosQueCuentan([tramo(12, null)])).toHaveLength(1);
  });
});
