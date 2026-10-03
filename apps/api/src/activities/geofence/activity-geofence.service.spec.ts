import { BadRequestException } from '@nestjs/common';
import { ActivityGeofenceService } from './activity-geofence.service';

const INICIO = { lat: 19.0414, lng: -98.2063 };
const LEJOS = { lat: 19.04725, lng: -98.2063 }; // ~650 m al norte
const CERCA = { lat: 19.0441, lng: -98.2063 }; // ~300 m
const A_150_M = { lat: 19.04275, lng: -98.2063 }; // con el radio de 100 m esto ya era «fuera»

function armar(actividad: { coreKind: string | null; ticketTypeCustom?: string | null } | null = { coreKind: 'servicio' }) {
  const alertas: any[] = [];
  const prisma: any = {
    activity: {
      findFirst: jest.fn().mockResolvedValue(actividad),
    },
    activityEvidence: {
      findFirst: jest.fn().mockResolvedValue({
        entryLatitude: INICIO.lat,
        entryLongitude: INICIO.lng,
        entryPhotoUploadedAt: new Date('2026-09-17T15:00:00Z'),
        exitPhotoUploadedAt: null,
        status: 'EVIDENCE_PHOTOS',
        companyId: 1,
      }),
      findMany: jest.fn().mockResolvedValue([
        { activityId: 7, entryLatitude: INICIO.lat, entryLongitude: INICIO.lng, companyId: 1 },
      ]),
    },
    activityGeofenceAlert: {
      findFirst: jest.fn(async ({ where }: any) =>
        alertas.filter((a) => a.activityId === where.activityId && a.userId === where.userId && a.returnedAt == null).at(-1) ?? null,
      ),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async ({ data }: any) => {
        const fila = { id: alertas.length + 1, returnedAt: null, ...data };
        alertas.push(fila);
        return fila;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const fila = alertas.find((a) => a.id === where.id);
        Object.assign(fila, data);
        return fila;
      }),
    },
    locationTracking: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const avisos = { notifyActivityOutOfZone: jest.fn(), notifyActivityOutOfZoneJustified: jest.fn() };
  const service = new ActivityGeofenceService(prisma, avisos as any);
  return { service, prisma, avisos, alertas };
}

describe('ActivityGeofenceService', () => {
  it('abre una sola alerta al salir de los 500 m, avisa una vez y la cierra al volver', async () => {
    const { service, avisos, alertas } = armar();

    await service.evaluarPunto({ userId: 3, latitude: LEJOS.lat, longitude: LEJOS.lng });
    await service.evaluarPunto({ userId: 3, latitude: LEJOS.lat + 0.001, longitude: LEJOS.lng });
    expect(alertas).toHaveLength(1);
    expect(alertas[0].radiusM).toBe(500);
    expect(avisos.notifyActivityOutOfZone).toHaveBeenCalledTimes(1);
    expect(alertas[0].maxDistanceM).toBeGreaterThan(alertas[0].distanceM);

    await service.evaluarPunto({ userId: 3, latitude: CERCA.lat, longitude: CERCA.lng });
    expect(alertas[0].returnedAt).toBeInstanceOf(Date);
  });

  it('dentro del radio no abre alertas (a 150 m y a 300 m sigue siendo el mismo sitio)', async () => {
    const { service, avisos, alertas } = armar();
    await service.evaluarPunto({ userId: 3, latitude: A_150_M.lat, longitude: A_150_M.lng });
    await service.evaluarPunto({ userId: 3, latitude: CERCA.lat, longitude: CERCA.lng });
    expect(alertas).toHaveLength(0);
    expect(avisos.notifyActivityOutOfZone).not.toHaveBeenCalled();
  });

  it('bloquea la foto de salida a más de 500 m del punto de inicio, no antes', async () => {
    const { service } = armar();
    await expect(service.validarSalida(7, 3, LEJOS.lat, LEJOS.lng)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.validarSalida(7, 3, LEJOS.lat, LEJOS.lng)).rejects.toThrow(/máximo es 500 m/);
    await expect(service.validarSalida(7, 3, A_150_M.lat, A_150_M.lng)).resolves.toBeUndefined();
    await expect(service.validarSalida(7, 3, CERCA.lat, CERCA.lng)).resolves.toBeUndefined();
  });

  it('sin punto de inicio (evidencia vieja sin GPS) no bloquea la salida', async () => {
    const { service, prisma } = armar();
    prisma.activityEvidence.findFirst.mockResolvedValue({ entryLatitude: null, entryLongitude: null });
    await expect(service.validarSalida(7, 3, LEJOS.lat, LEJOS.lng)).resolves.toBeUndefined();
  });

  it('la regla la decide el tipo de la actividad, no el área del responsable', async () => {
    const { service, prisma } = armar({ coreKind: 'proyecto' });
    await expect(service.exigeMismaUbicacion(7)).resolves.toBe(true);
    expect(prisma.activity.findFirst).toHaveBeenCalledWith({
      where: { id: 7 },
      select: { coreKind: true, ticketTypeCustom: true },
    });
  });

  it.each([
    ['servicio', null],
    ['proyecto', null],
    ['obra', null],
    ['tarea', 'Levantamiento'],
    ['tarea', 'Junta'],
    ['tarea', null],
  ])('%s (%s): la salida lejos del inicio se rechaza', async (coreKind, ticketTypeCustom) => {
    const { service } = armar({ coreKind, ticketTypeCustom });
    await expect(service.validarSalida(7, 3, LEJOS.lat, LEJOS.lng)).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['tarea', 'Recolección'],
    ['tarea', 'Entrega'],
    ['tarea', 'Compra de material'],
    ['comercial', 'COMERCIAL'],
    [null, null],
  ])('%s (%s): la salida se acepta lejos del inicio y ni se mide', async (coreKind, ticketTypeCustom) => {
    const { service, prisma } = armar({ coreKind, ticketTypeCustom });
    await expect(service.validarSalida(7, 3, LEJOS.lat, LEJOS.lng)).resolves.toBeUndefined();
    expect(prisma.activityEvidence.findFirst).not.toHaveBeenCalled();
  });

  it('sin actividad no exige coincidir la ubicación', async () => {
    const { service, prisma } = armar();
    prisma.activity.findFirst.mockResolvedValue(null);
    await expect(service.validarSalida(7, 3, LEJOS.lat, LEJOS.lng)).resolves.toBeUndefined();
  });

  it('el estado que leen web y apps trae la bandera por tipo y el radio de 500 m', async () => {
    const obra = armar({ coreKind: 'obra' });
    await expect(obra.service.estado(7, 3)).resolves.toMatchObject({ exigeMismaUbicacion: true, radioM: 500 });

    const comercial = armar({ coreKind: 'comercial', ticketTypeCustom: 'COMERCIAL' });
    await expect(comercial.service.estado(7, 3)).resolves.toMatchObject({ exigeMismaUbicacion: false, radioM: 500 });

    const recoleccion = armar({ coreKind: 'tarea', ticketTypeCustom: 'Recolección' });
    await expect(recoleccion.service.estado(7, 3)).resolves.toMatchObject({ exigeMismaUbicacion: false });
  });
});
