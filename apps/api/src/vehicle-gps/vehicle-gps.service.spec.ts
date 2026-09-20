import { ForbiddenException } from '@nestjs/common';
import { VehicleGpsService, proveedorDesdeEntorno } from './vehicle-gps.service';
import { SimuladorGpsProvider } from './simulador.adapter';
import { HikvisionGpsProvider } from './hikvision.adapter';
import { PERMISSIONS } from '../common/permissions.js';
import type { ProveedorGps, PuntoGps } from './posiciones';

/**
 * El GPS de la flotilla es de Dirección General y de nadie más.
 *
 * Es la misma regla del GPS de jornada (`puedeVerGpsDireccion`): saber por
 * dónde anda una camioneta es saber por dónde anda la persona que la trae. Un
 * coordinador con `gps.manage` y `vehicles.review` no entra.
 */

const christian = { id: 1, email: 'gerencia@nexara.com.mx' };
const claudia = { id: 2, email: 'claudia.bernal@nexara.com.mx' };
const coordinador = {
  id: 3,
  email: 'coordinador@nexara.com.mx',
  isSuperAdmin: true,
  permissions: [PERMISSIONS.GPS_MANAGE, PERMISSIONS.GPS_VIEW, PERMISSIONS.VEHICLES_REVIEW, PERMISSIONS.CONSOLE_ADMIN],
};
const operaciones = { id: 4, email: 'operaciones@nexara.com.mx' };

function build(proveedor: ProveedorGps | null = new SimuladorGpsProvider()) {
  const prisma: any = {
    vehicleAsset: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ id: 1, nombre: 'Camioneta 1', placas: 'ABC-123' }),
    },
    vehiclePosition: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    vehicleControl: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { service: new VehicleGpsService(prisma as any, proveedor), prisma };
}

describe('quién ve el GPS de la flotilla', () => {
  it('Christian sí', async () => {
    const { service } = build();
    await expect(service.posiciones(christian, 7)).resolves.toMatchObject({ posiciones: [] });
  });

  it('Claudia, su cuenta de pruebas, también', async () => {
    const { service } = build();
    await expect(service.estado(claudia, 7)).resolves.toMatchObject({ proveedor: 'simulador' });
  });

  it('un coordinador con gps.manage, vehicles.review y console.admin, NO', async () => {
    const { service, prisma } = build();
    await expect(service.posiciones(coordinador, 7)).rejects.toThrow(ForbiddenException);
    expect(prisma.vehicleAsset.findMany).not.toHaveBeenCalled();
  });

  it('operaciones tampoco', async () => {
    const { service } = build();
    await expect(service.posiciones(operaciones, 7)).rejects.toThrow(ForbiddenException);
  });

  it('el recorrido de un día está igual de cerrado', async () => {
    const { service, prisma } = build();
    await expect(service.recorrido(coordinador, 1, '2026-09-19', 7)).rejects.toThrow(ForbiddenException);
    expect(prisma.vehiclePosition.findMany).not.toHaveBeenCalled();
  });

  it('y la sincronización, que es la que gasta cuota del proveedor', async () => {
    const { service } = build();
    await expect(service.sincronizar(coordinador, 7)).rejects.toThrow(ForbiddenException);
  });

  it('sin sesión, nada', async () => {
    const { service } = build();
    await expect(service.posiciones(null, 7)).rejects.toThrow(ForbiddenException);
    await expect(service.estado(undefined, 7)).rejects.toThrow(ForbiddenException);
  });
});

describe('ingesta de posiciones', () => {
  const porDispositivo = new Map([
    ['K70728087', { id: 11, companyId: 7 }],
    ['K70728088', { id: 12, companyId: 7 }],
  ]);

  function punto(dispositivoId: string, at: string): PuntoGps {
    return { dispositivoId, lat: 19.04, lng: -98.2, velocidadKmh: 40, rumbo: 90, at: new Date(at) };
  }

  it('guarda cada punto con su vehículo y su empresa', async () => {
    const { service, prisma } = build();
    prisma.vehiclePosition.createMany.mockResolvedValue({ count: 1 });

    await service.guardarPuntos([punto('K70728087', '2026-09-19T15:00:00.000Z')], porDispositivo);

    expect(prisma.vehiclePosition.createMany).toHaveBeenCalledWith({
      data: [
        {
          vehicleAssetId: 11,
          companyId: 7,
          lat: 19.04,
          lng: -98.2,
          velocidadKmh: 40,
          rumbo: 90,
          at: new Date('2026-09-19T15:00:00.000Z'),
        },
      ],
      skipDuplicates: true,
    });
  });

  it('un lote con el mismo punto repetido se colapsa antes de tocar la base', async () => {
    const { service, prisma } = build();
    prisma.vehiclePosition.createMany.mockResolvedValue({ count: 1 });

    const p = punto('K70728087', '2026-09-19T15:00:00.000Z');
    await service.guardarPuntos([p, { ...p }, { ...p }], porDispositivo);

    expect(prisma.vehiclePosition.createMany.mock.calls[0][0].data).toHaveLength(1);
  });

  it('reentregar el mismo lote no duplica: el índice único los descarta', async () => {
    const { service, prisma } = build();
    // Segunda pasada: la base ya los tenía, createMany reporta 0 insertados.
    prisma.vehiclePosition.createMany.mockResolvedValue({ count: 0 });

    const res = await service.guardarPuntos(
      [punto('K70728087', '2026-09-19T15:00:00.000Z'), punto('K70728088', '2026-09-19T15:00:00.000Z')],
      porDispositivo,
    );

    expect(res).toEqual({ guardados: 0, repetidos: 2 });
    expect(prisma.vehiclePosition.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it('dos vehículos distintos a la misma hora NO son un duplicado', async () => {
    const { service, prisma } = build();
    prisma.vehiclePosition.createMany.mockResolvedValue({ count: 2 });

    await service.guardarPuntos(
      [punto('K70728087', '2026-09-19T15:00:00.000Z'), punto('K70728088', '2026-09-19T15:00:00.000Z')],
      porDispositivo,
    );

    expect(prisma.vehiclePosition.createMany.mock.calls[0][0].data).toHaveLength(2);
  });

  it('un punto de un equipo que no es nuestro se ignora', async () => {
    const { service, prisma } = build();
    const res = await service.guardarPuntos([punto('EQUIPO-AJENO', '2026-09-19T15:00:00.000Z')], porDispositivo);
    expect(res).toEqual({ guardados: 0, repetidos: 0 });
    expect(prisma.vehiclePosition.createMany).not.toHaveBeenCalled();
  });

  it('si el proveedor se cae, la pantalla sigue viva con lo guardado', async () => {
    const roto: ProveedorGps = {
      nombre: 'hikvision',
      demo: false,
      configurado: true,
      puntosRecientes: jest.fn().mockRejectedValue(new Error('502 Bad Gateway')),
    };
    const { service, prisma } = build(roto);
    prisma.vehicleAsset.findMany.mockResolvedValue([
      { id: 11, companyId: 7, gpsDispositivoId: 'K70728087', nombre: 'C1', placas: null, gpsProveedor: 'hikvision' },
    ]);

    const res = await service.sincronizar(christian, 7);
    expect(res).toMatchObject({ proveedor: 'hikvision', guardados: 0, error: expect.any(String) });
  });
});

describe('elección del proveedor por entorno', () => {
  it('sin configurar nada, el simulador: el mapa se puede ver y se marca demo', () => {
    const p = proveedorDesdeEntorno({} as NodeJS.ProcessEnv);
    expect(p).toBeInstanceOf(SimuladorGpsProvider);
    expect(p?.demo).toBe(true);
  });

  it('«hikvision» arma el adaptador real, y sin credenciales queda sin configurar', () => {
    const p = proveedorDesdeEntorno({ VEHICLE_GPS_PROVEEDOR: 'hikvision' } as NodeJS.ProcessEnv);
    expect(p).toBeInstanceOf(HikvisionGpsProvider);
    expect(p?.demo).toBe(false);
    expect(p?.configurado).toBe(false);
  });

  it('con credenciales, configurado', () => {
    const p = proveedorDesdeEntorno({
      VEHICLE_GPS_PROVEEDOR: 'hikvision',
      VEHICLE_GPS_HIK_HOST: 'https://ius.hikcentralconnect.com',
      VEHICLE_GPS_HIK_APP_KEY: 'ak',
      VEHICLE_GPS_HIK_SECRET_KEY: 'sk',
    } as NodeJS.ProcessEnv);
    expect(p?.configurado).toBe(true);
  });

  it('«ninguno» apaga el rastreo del todo', () => {
    expect(proveedorDesdeEntorno({ VEHICLE_GPS_PROVEEDOR: 'ninguno' } as NodeJS.ProcessEnv)).toBeNull();
  });
});
