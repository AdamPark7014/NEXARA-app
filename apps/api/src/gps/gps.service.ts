import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PERMISSIONS } from '../common/permissions.js';
import { companyWhere, requireCompanyId, resolveRequiredCompanyId } from '../common/tenant/tenant-scope.js';
import { CreateGpsDto } from './dto/create-gps.dto.js';

@Injectable()
export class GpsService {
  constructor(private readonly prisma: PrismaService) {}

  private getTodayDateOnly() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  async create(createGpsDto: CreateGpsDto, companyId?: number | null) {
    if (createGpsDto.usuarioId === undefined) {
      throw new Error('usuarioId requerido');
    }
    const resolvedCompanyId = await resolveRequiredCompanyId(this.prisma, companyId);
    const data: Prisma.LocationTrackingUncheckedCreateInput = {
      usuarioId: createGpsDto.usuarioId,
      latitud: createGpsDto.latitud,
      longitud: createGpsDto.longitud,
      velocidadKmh: createGpsDto.velocidadKmh ?? null,
      estaActivo: createGpsDto.estaActivo ?? true,
      ultimaActualizacion: createGpsDto.ultimaActualizacion,
      companyId: resolvedCompanyId,
      ...(createGpsDto.actividadId ? { actividadId: createGpsDto.actividadId } : {}),
    };
    return this.prisma['locationTracking'].create({ data });
  }

  async findMe(userId: number) {
    const today = this.getTodayDateOnly();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { locationConsent: true },
    });
    const openDay = await this.prisma.attendanceDay.findFirst({
      where: { userId, date: today, isOpen: true },
      select: { isOpen: true },
    });
    const effectiveConsent = Boolean(user?.locationConsent && openDay?.isOpen);

    const location = await this.prisma['locationTracking'].findFirst({
      where: { usuarioId: userId, estaActivo: true },
      orderBy: { ultimaActualizacion: 'desc' },
      include: {
        usuario: { include: { role: true, department: true } },
        actividad: true,
      },
    });
    return {
      consent: effectiveConsent,
      location: effectiveConsent ? location : null,
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

  private hasPermission(
    user: { permissions?: string[]; isSuperAdmin?: boolean } | null | undefined,
    permission: string,
  ) {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    return Boolean(user.permissions?.includes(permission));
  }

  async findTeamLocations(
    requester: {
      id: number;
      departmentId?: number;
      permissions?: string[];
      isSuperAdmin?: boolean;
    },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const today = this.getTodayDateOnly();
    const canSeeAll =
      this.hasPermission(requester, PERMISSIONS.CONSOLE_ADMIN) ||
      this.hasPermission(requester, PERMISSIONS.GPS_MANAGE);

    const userFilter: any = {
      locationConsent: true,
      attendanceDays: { some: { date: today, isOpen: true } },
      companyMemberships: { some: { companyId: tenantId } },
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
        usuarioId: { in: allowedUsers.map((u) => u.id) },
        estaActivo: true,
        ...companyWhere(tenantId),
      },
      orderBy: { ultimaActualizacion: 'desc' },
      include: {
        usuario: { include: { role: true, department: true } },
        actividad: true,
      },
    });

    return this.pickLatestByUser(locations);
  }

  /** All GPS points for userId on a given date (YYYY-MM-DD), ordered asc. Used for trajectory view. */
  async getMyTrajectory(userId: number, date?: string, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const { start, end } = this.parseDateRange(date);
    return this.prisma['locationTracking'].findMany({
      where: {
        usuarioId: userId,
        ultimaActualizacion: { gte: start, lte: end },
        ...companyWhere(tenantId),
      },
      orderBy: { ultimaActualizacion: 'asc' },
    });
  }

  async getTrajectoryForUser(
    requester: {
      id: number;
      departmentId?: number;
      permissions?: string[];
      isSuperAdmin?: boolean;
    },
    targetUserId: number,
    date?: string,
    companyId?: number | null,
  ) {
    const canManage =
      requester.isSuperAdmin ||
      requester.permissions?.includes(PERMISSIONS.GPS_MANAGE) ||
      requester.permissions?.includes(PERMISSIONS.ATTENDANCE_MANAGE) ||
      requester.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN);

    if (targetUserId !== requester.id && !canManage) {
      throw new ForbiddenException('No tienes permisos para ver el trayecto de otro usuario');
    }

    if (targetUserId !== requester.id) {
      const target = await this.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, departmentId: true, locationConsent: true },
      });
      if (!target) return [];
      if (
        !requester.isSuperAdmin &&
        !requester.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN) &&
        !requester.permissions?.includes(PERMISSIONS.GPS_MANAGE) &&
        requester.departmentId &&
        target.departmentId !== requester.departmentId
      ) {
        throw new ForbiddenException('No puedes ver usuarios de otro departamento');
      }
    }

    return this.getMyTrajectory(targetUserId, date, companyId);
  }

  private parseDateRange(date?: string) {
    let targetDate: Date;
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const parts = date.split('-').map(Number);
      targetDate = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    } else {
      targetDate = new Date();
    }
    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);
    return { start, end };
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
