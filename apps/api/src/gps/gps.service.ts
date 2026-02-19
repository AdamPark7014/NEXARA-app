import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CreateGpsDto } from './dto/create-gps.dto.js';

@Injectable()
export class GpsService {
  constructor(private readonly prisma: PrismaService) {}

  create(createGpsDto: CreateGpsDto) {
    if (createGpsDto.usuarioId === undefined) {
      throw new Error('usuarioId requerido');
    }
    const data: Prisma.LocationTrackingUncheckedCreateInput = {
      usuarioId: createGpsDto.usuarioId,
      latitud: createGpsDto.latitud,
      longitud: createGpsDto.longitud,
      velocidadKmh: createGpsDto.velocidadKmh ?? null,
      estaActivo: createGpsDto.estaActivo ?? true,
      ultimaActualizacion: createGpsDto.ultimaActualizacion,
      ...(createGpsDto.actividadId ? { actividadId: createGpsDto.actividadId } : {}),
    };
    return this.prisma['locationTracking'].create({ data });
  }

  async findMe(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { locationConsent: true },
    });
    const location = await this.prisma['locationTracking'].findFirst({
      where: { usuarioId: userId, estaActivo: true },
      orderBy: { ultimaActualizacion: 'desc' },
      include: {
        usuario: { include: { role: true, department: true } },
        actividad: true,
      },
    });
    return {
      consent: Boolean(user?.locationConsent),
      location,
    };
  }

  async updateConsent(userId: number, enabled: boolean) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { locationConsent: enabled },
      select: { locationConsent: true },
    });
    if (!enabled) {
      await this.prisma['locationTracking'].updateMany({
        where: { usuarioId: userId, estaActivo: true },
        data: { estaActivo: false, ultimaActualizacion: new Date() },
      });
    }
    return { consent: Boolean(user.locationConsent) };
  }

  private pickLatestByUser(locations: any[]) {
    const byUser = new Map<number, any>();
    for (const location of locations) {
      if (!byUser.has(location.usuarioId)) {
        byUser.set(location.usuarioId, location);
      }
    }
    return Array.from(byUser.values());
  }

  private hasPermission(user: { permissions?: string[]; isSuperAdmin?: boolean } | null | undefined, permission: string) {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    return Boolean(user.permissions?.includes(permission));
  }

  async findTeamLocations(requester: { id: number; departmentId?: number; permissions?: string[]; isSuperAdmin?: boolean }) {
    const canSeeAll = this.hasPermission(requester, PERMISSIONS.CONSOLE_ADMIN)
      || this.hasPermission(requester, PERMISSIONS.GPS_MANAGE);
    const userFilter: any = {
      locationConsent: true,
      role: { accesoGps: true },
    };

    if (!canSeeAll && requester.departmentId) {
      userFilter.departmentId = requester.departmentId;
    }

    const allowedUsers = await this.prisma.user.findMany({
      where: userFilter,
      select: { id: true },
    });

    if (!allowedUsers.length) return [];

    const locations = await this.prisma['locationTracking'].findMany({
      where: {
        usuarioId: { in: allowedUsers.map((user) => user.id) },
        estaActivo: true,
      },
      orderBy: { ultimaActualizacion: 'desc' },
      include: {
        usuario: { include: { role: true, department: true } },
        actividad: true,
      },
    });

    return this.pickLatestByUser(locations);
  }

  findOne(id: number) {
    return this.prisma['locationTracking'].findUnique({
      where: { id },
      include: { usuario: true, actividad: true },
    });
  }

  findOneWithUser(id: number) {
    return this.prisma['locationTracking'].findUnique({
      where: { id },
      include: {
        usuario: { include: { role: true, department: true } },
        actividad: true,
      },
    });
  }
}
