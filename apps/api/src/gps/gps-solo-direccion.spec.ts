import { ForbiddenException } from '@nestjs/common';
import { GpsService } from './gps.service.js';
import { PERMISSIONS } from '../common/permissions.js';

/**
 * El GPS en vivo es de dirección, no de los encargados.
 *
 * Antes, cualquiera con `gps.manage` veía el mapa del equipo, y con
 * `attendance.manage` el recorrido completo de sus subordinados. Eso es seguir
 * a alguien por la ciudad; para comprobar que llegó están su checada, el punto
 * desde el que fichó y su distancia al sitio (contrato del viernes 18-09, A).
 */

function build() {
  const prisma: any = {
    user: { findMany: jest.fn().mockResolvedValue([{ id: 9 }]) },
    locationTracking: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    attendanceDay: { findFirst: jest.fn().mockResolvedValue({ isOpen: true }) },
  };
  return { service: new GpsService(prisma as any), prisma };
}

const christian = {
  id: 1,
  email: 'gerencia@nexara.com.mx',
  permissions: [PERMISSIONS.GPS_MANAGE],
};
const claudia = { id: 2, email: 'claudia.bernal@nexara.com.mx', permissions: [] as string[] };
const coordinador = {
  id: 3,
  email: 'coordinador@nexara.com.mx',
  permissions: [PERMISSIONS.GPS_MANAGE, PERMISSIONS.ATTENDANCE_MANAGE, PERMISSIONS.CONSOLE_ADMIN],
  isSuperAdmin: true,
};

describe('mapa del equipo', () => {
  it('Christian lo ve', async () => {
    const { service } = build();
    await expect(service.findTeamLocations(christian as any, 7)).resolves.toEqual([]);
  });

  it('Claudia, su cuenta de pruebas, también', async () => {
    const { service } = build();
    await expect(service.findTeamLocations(claudia as any, 7)).resolves.toEqual([]);
  });

  it('un coordinador con gps.manage y console.admin, no', async () => {
    const { service, prisma } = build();
    await expect(service.findTeamLocations(coordinador as any, 7)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.locationTracking.findMany).not.toHaveBeenCalled();
  });
});

describe('trayectoria del día', () => {
  it('la de un subordinado ya no es asunto de su encargado', async () => {
    const { service } = build();
    await expect(
      service.getTrajectoryForUser(coordinador as any, 9, '2026-09-17', 7),
    ).rejects.toThrow(/solo para dirección/);
  });

  it('ni la suya propia: el recorrido es telemetría, no asistencia', async () => {
    const { service } = build();
    await expect(
      service.getTrajectoryForUser(coordinador as any, coordinador.id, '2026-09-17', 7),
    ).rejects.toThrow(ForbiddenException);
  });

  it('dirección sí, la de quien sea', async () => {
    const { service } = build();
    await expect(
      service.getTrajectoryForUser(christian as any, 9, '2026-09-17', 7),
    ).resolves.toEqual([]);
  });
});

describe('un punto suelto por id', () => {
  it('no sale de la empresa de quien pregunta', async () => {
    const { service, prisma } = build();
    await service.findOneWithUser(55, 7);
    expect(prisma.locationTracking.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 55, companyId: 7 }) }),
    );
  });
});
