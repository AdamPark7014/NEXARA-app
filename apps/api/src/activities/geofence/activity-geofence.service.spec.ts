import { BadRequestException } from '@nestjs/common';
import { ActivityGeofenceService } from './activity-geofence.service';

const INICIO = { lat: 19.0414, lng: -98.2063 };
const LEJOS = { lat: 19.04275, lng: -98.2063 }; // ~150 m al norte
const CERCA = { lat: 19.0419, lng: -98.2063 }; // ~55 m

function armar() {
  const alertas: any[] = [];
  const prisma: any = {
    activityEvidence: {
      findUnique: jest.fn().mockResolvedValue({
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
  };
  const avisos = { notifyActivityOutOfZone: jest.fn(), notifyActivityOutOfZoneJustified: jest.fn() };
  const service = new ActivityGeofenceService(prisma, avisos as any);
  return { service, prisma, avisos, alertas };
}

describe('ActivityGeofenceService', () => {
  it('abre una sola alerta al salir de los 100 m, avisa una vez y la cierra al volver', async () => {
    const { service, avisos, alertas } = armar();

    await service.evaluarPunto({ userId: 3, latitude: LEJOS.lat, longitude: LEJOS.lng });
    await service.evaluarPunto({ userId: 3, latitude: LEJOS.lat + 0.001, longitude: LEJOS.lng });
    expect(alertas).toHaveLength(1);
    expect(avisos.notifyActivityOutOfZone).toHaveBeenCalledTimes(1);
    expect(alertas[0].maxDistanceM).toBeGreaterThan(alertas[0].distanceM);

    await service.evaluarPunto({ userId: 3, latitude: CERCA.lat, longitude: CERCA.lng });
    expect(alertas[0].returnedAt).toBeInstanceOf(Date);
  });

  it('dentro del radio no abre alertas', async () => {
    const { service, avisos, alertas } = armar();
    await service.evaluarPunto({ userId: 3, latitude: CERCA.lat, longitude: CERCA.lng });
    expect(alertas).toHaveLength(0);
    expect(avisos.notifyActivityOutOfZone).not.toHaveBeenCalled();
  });

  it('bloquea la foto de salida a más de 100 m del punto de inicio', async () => {
    const { service } = armar();
    await expect(service.validarSalida(7, 3, LEJOS.lat, LEJOS.lng)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.validarSalida(7, 3, CERCA.lat, CERCA.lng)).resolves.toBeUndefined();
  });

  it('sin punto de inicio (evidencia vieja sin GPS) no bloquea la salida', async () => {
    const { service, prisma } = armar();
    prisma.activityEvidence.findUnique.mockResolvedValue({ entryLatitude: null, entryLongitude: null });
    await expect(service.validarSalida(7, 3, LEJOS.lat, LEJOS.lng)).resolves.toBeUndefined();
  });
});
