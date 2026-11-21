import { AvisosRetrasoService } from './avisos-retraso.service';
import { reiniciarCacheInterruptor } from './interruptor-vehiculos';

// 21-11-2026 18:00 UTC = 12:00 en México.
const MEDIODIA = new Date('2026-11-21T18:00:00.000Z');

function build(usos: any[], over: { interruptor?: boolean; apartado?: number } = {}) {
  const prisma: any = {
    systemSetting: { findFirst: jest.fn().mockResolvedValue(over.interruptor === false ? null : { id: 1 }) },
    vehicleControl: {
      findMany: jest.fn().mockResolvedValue(usos),
      updateMany: jest.fn().mockResolvedValue({ count: over.apartado ?? 1 }),
    },
  };
  const notifications = { createNotification: jest.fn().mockResolvedValue({}) };
  const danos = { gestoras: jest.fn().mockResolvedValue([{ id: 8 }]) };
  const service = new AvisosRetrasoService(prisma, notifications as any, danos as any);
  return { service, prisma, notifications, danos };
}

function uso(extra: Record<string, unknown> = {}) {
  return {
    id: 1,
    companyId: 7,
    vehicleId: 3,
    solicitanteId: 5,
    encargadoId: 6,
    fechaFinAprobada: new Date('2026-11-21T16:30:00.000Z'),
    fechaFinSolicitada: null,
    avisosRetraso: 0,
    ultimoAvisoRetrasoEn: null,
    nombreVehiculo: 'Hilux 2',
    vehiculo: { nombre: 'Hilux 2' },
    actividad: { estatus: 'En proceso' },
    solicitante: { id: 5, nombre: 'Oscar', managerId: 30 },
    encargado: { id: 6, nombre: 'David', managerId: 31 },
    ...extra,
  };
}

beforeEach(() => reiniciarCacheInterruptor());

describe('avisos de unidad sin devolver', () => {
  it('primer aviso: solo al encargado, y se anota el número', async () => {
    const { service, prisma, notifications } = build([uso()]);
    expect(await service.avisar(MEDIODIA)).toEqual({ revisados: 1, avisos: 1 });
    expect(prisma.vehicleControl.updateMany).toHaveBeenCalledWith({
      where: { id: 1, avisosRetraso: 0 },
      data: { avisosRetraso: 1, ultimoAvisoRetrasoEn: MEDIODIA },
    });
    expect(notifications.createNotification).toHaveBeenCalledTimes(1);
    expect(notifications.createNotification.mock.calls[0][0]).toMatchObject({
      userId: 6,
      type: 'VEHICLE_USAGE_OVERDUE',
      title: 'Unidad sin devolver',
      priority: 'high',
      companyId: 7,
    });
  });

  it('segundo aviso: también Liz', async () => {
    const { service, notifications } = build([uso({ avisosRetraso: 1, ultimoAvisoRetrasoEn: new Date(MEDIODIA.getTime() - 60 * 60_000) })]);
    await service.avisar(MEDIODIA);
    expect(notifications.createNotification.mock.calls.map((c: any[]) => c[0].userId)).toEqual([6, 8]);
    expect(notifications.createNotification.mock.calls[1][0].message).toMatch(/^David no ha devuelto Hilux 2/);
    expect(notifications.createNotification.mock.calls[1][0].relatedUrl).toBe('/erp/vehiculos/3');
  });

  it('cuarto aviso: también el jefe del encargado', async () => {
    const { service, notifications } = build([uso({ avisosRetraso: 3, ultimoAvisoRetrasoEn: new Date(MEDIODIA.getTime() - 60 * 60_000) })]);
    await service.avisar(MEDIODIA);
    expect(notifications.createNotification.mock.calls.map((c: any[]) => c[0].userId)).toEqual([6, 31]);
  });

  it('con la actividad cerrada avisa aunque no haya vencido', async () => {
    const { service, notifications } = build([uso({ fechaFinAprobada: new Date('2026-11-22T02:00:00Z'), actividad: { estatus: 'Finalizada' } })]);
    await service.avisar(MEDIODIA);
    expect(notifications.createNotification.mock.calls[0][0].title).toBe('Devuelve la unidad');
  });

  it('no repite antes de 55 minutos, ni avisa de noche, ni si otro proceso ya lo apartó', async () => {
    const reciente = build([uso({ avisosRetraso: 1, ultimoAvisoRetrasoEn: new Date(MEDIODIA.getTime() - 20 * 60_000) })]);
    expect((await reciente.service.avisar(MEDIODIA)).avisos).toBe(0);

    const noche = build([uso()]);
    expect(await noche.service.avisar(new Date('2026-11-22T05:00:00.000Z'))).toEqual({ revisados: 0, avisos: 0 });

    const apartado = build([uso()], { apartado: 0 });
    expect((await apartado.service.avisar(MEDIODIA)).avisos).toBe(0);
    expect(apartado.notifications.createNotification).not.toHaveBeenCalled();
  });

  it('a tiempo, nada', async () => {
    const { service, notifications } = build([uso({ fechaFinAprobada: new Date('2026-11-22T02:00:00Z') })]);
    expect((await service.avisar(MEDIODIA)).avisos).toBe(0);
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  it('el cron no corre con el interruptor apagado', async () => {
    const { service, prisma } = build([uso()], { interruptor: false });
    await service.correr();
    expect(prisma.vehicleControl.findMany).not.toHaveBeenCalled();
  });
});
