import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import {
  appendTrail,
  buildApprovalChain,
  canActOnStep,
  isTerminalApproved,
  stepRoleAt,
  type TrailEntry,
} from '../common/rbac/hierarchical-approval.js';
import { ROLES, type RoleKey } from '../common/rbac/roles.v2.js';
import { assertCompanyAccess, companyWhere, resolveRequiredCompanyId } from '../common/tenant/tenant-scope.js';

@Injectable()
export class VehiclesService {
  // Exportar a CSV
  toCSV(vehicles: any[]): string {
    if (!vehicles.length) return '';
    const fields = Object.keys(vehicles[0]);
    const csvRows = [fields.join(',')];
    for (const row of vehicles) {
      csvRows.push(
        fields
          .map((f) => {
            let val = row[f];
            if (typeof val === 'object' && val !== null) {
              val = JSON.stringify(val);
            }
            if (typeof val === 'string' && val.includes(',')) {
              val = '"' + val.replace(/"/g, '""') + '"';
            }
            return val ?? '';
          })
          .join(','),
      );
    }
    return csvRows.join('\n');
  }

  // Importar muchos vehículos desde JSON
  importMany(_json: any[]): never {
    throw new Error('Modelo vehiculo no existe en Prisma.');
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationHierarchy: NotificationHierarchyService,
  ) {}

  private resolveActorRole(actor: any): RoleKey | null {
    if (actor?.isSuperAdmin) return ROLES.SUPER_ADMIN;
    return actor?.roleKey ?? actor?.role?.orgRoleKey ?? null;
  }

  private controlInclude() {
    return { actividad: true, solicitante: true, vehiculo: true, entregaRevisadoPor: true };
  }

  async create(createVehicleDto: any, companyId?: number | null) {
    const cid = await resolveRequiredCompanyId(this.prisma, companyId);
    const { companyId: _ignored, ...rest } = createVehicleDto ?? {};

    const activity = await this.prisma.activity.findFirst({
      where: { id: rest.actividadId, ...companyWhere(cid) },
      select: { id: true },
    });
    if (!activity) throw new BadRequestException('Actividad no encontrada');

    if (rest.vehicleId != null) {
      const asset = await this.prisma['vehicleAsset'].findFirst({
        where: { id: Number(rest.vehicleId), ...companyWhere(cid) },
        select: { id: true, companyId: true },
      });
      assertCompanyAccess(asset, cid, 'Vehículo');
    }

    const vehicleControl = await this.prisma['vehicleControl'].create({
      data: {
        ...rest,
        companyId: cid,
        approvalStep: 0,
        approvalTrail: [],
        estatusAprobacion: rest.estatusAprobacion ?? 'Pendiente',
      },
      include: { solicitante: { select: { id: true, nombre: true } } },
    });

    // Notify supervisors about vehicle request
    if (vehicleControl.solicitanteId && vehicleControl.solicitante) {
      await this.notificationHierarchy.notifyVehicleRequested(
        vehicleControl.solicitanteId,
        vehicleControl.id,
        vehicleControl.solicitante.nombre || 'Usuario',
        createVehicleDto.nombreVehiculo || 'Vehículo',
      );
    }

    return vehicleControl;
  }

  async getAsset(id: number, companyId?: number | null) {
    const asset = await this.prisma['vehicleAsset'].findFirst({
      where: { id, ...companyWhere(companyId ?? null) },
    });
    assertCompanyAccess(asset, companyId, 'Vehículo');
    return asset;
  }

  async createAsset(data: any, companyId?: number | null) {
    const cid = await resolveRequiredCompanyId(this.prisma, companyId);
    const { companyId: _ignored, ...rest } = data ?? {};
    return this.prisma['vehicleAsset'].create({
      data: { ...rest, companyId: cid },
    });
  }

  async updateAsset(id: number, data: any, companyId?: number | null) {
    await this.getAsset(id, companyId);
    const { companyId: _ignored, ...rest } = data ?? {};
    return this.prisma['vehicleAsset'].update({ where: { id }, data: rest });
  }

  async removeAsset(id: number, companyId?: number | null) {
    await this.getAsset(id, companyId);
    return this.prisma['vehicleAsset'].delete({ where: { id } });
  }

  async listAssets(query?: PaginationQueryDto, companyId?: number | null) {
    const where = companyWhere(companyId ?? null);
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma['vehicleAsset'].findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: query.skip,
          take: query.take,
        }),
        this.prisma['vehicleAsset'].count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma['vehicleAsset'].findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async findAll(query?: PaginationQueryDto, companyId?: number | null) {
    const include = this.controlInclude();
    const where = companyWhere(companyId ?? null);
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma['vehicleControl'].findMany({
          where,
          include,
          orderBy: { fechaSolicitud: 'desc' },
          skip: query.skip,
          take: query.take,
        }),
        this.prisma['vehicleControl'].count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma['vehicleControl'].findMany({
      where,
      include,
      orderBy: { fechaSolicitud: 'desc' },
    });
  }

  findByDepartment(departmentId: number, companyId?: number | null) {
    return this.prisma['vehicleControl'].findMany({
      where: { solicitante: { departmentId }, ...companyWhere(companyId ?? null) },
      include: this.controlInclude(),
      orderBy: { fechaSolicitud: 'desc' },
    });
  }

  findByResponsible(userId: number, companyId?: number | null) {
    return this.prisma['vehicleControl'].findMany({
      where: { solicitanteId: userId, ...companyWhere(companyId ?? null) },
      include: this.controlInclude(),
      orderBy: { fechaSolicitud: 'desc' },
    });
  }

  findByAllowedUsers(userIds: number[], companyId?: number | null) {
    if (!userIds || userIds.length === 0) return [];
    return this.prisma['vehicleControl'].findMany({
      where: { solicitanteId: { in: userIds }, ...companyWhere(companyId ?? null) },
      include: this.controlInclude(),
      orderBy: { fechaSolicitud: 'desc' },
    });
  }

  async findOne(id: number, companyId?: number | null) {
    const record = await this.prisma['vehicleControl'].findFirst({
      where: { id, ...companyWhere(companyId ?? null) },
      include: this.controlInclude(),
    });
    assertCompanyAccess(record, companyId, 'Solicitud de vehículo');
    return record!;
  }

  async update(id: number, updateVehicleDto: any, companyId?: number | null) {
    const currentVehicle = await this.findOne(id, companyId);
    const { companyId: _ignored, ...rest } = updateVehicleDto ?? {};

    const updated = await this.prisma['vehicleControl'].update({
      where: { id },
      data: rest,
      include: { solicitante: { select: { id: true, nombre: true } } },
    });

    // Notify about vehicle approval/rejection
    if (rest.estatusAprobacion && currentVehicle.estatusAprobacion !== rest.estatusAprobacion) {
      if (rest.estatusAprobacion === 'Aprobado' && updated.solicitanteId) {
        await this.notificationHierarchy.notifyVehicleApproved(
          updated.solicitanteId,
          id,
          rest.nombreVehiculo || currentVehicle.nombreVehiculo || 'Vehículo',
        );
      } else if (rest.estatusAprobacion === 'Rechazado' && updated.solicitanteId) {
        await this.notificationHierarchy.notifyVehicleRejected(
          updated.solicitanteId,
          id,
          rest.nombreVehiculo || currentVehicle.nombreVehiculo || 'Vehículo',
        );
      }
    }

    return updated;
  }

  async approveOrReject(
    id: number,
    actor: any,
    action: 'approve' | 'reject',
    body?: { note?: string; fechaInicioAprobada?: string; fechaFinAprobada?: string },
    companyId?: number | null,
  ) {
    const record = await this.findOne(id, companyId);
    if (['Rechazado', 'Aprobado'].includes(record.estatusAprobacion)) {
      throw new BadRequestException('Esta solicitud ya fue cerrada');
    }

    const chain = buildApprovalChain('vehicles', 0);
    const step = record.approvalStep ?? 0;
    const actorRole = this.resolveActorRole(actor);
    if (!actor?.isSuperAdmin && !canActOnStep(actorRole, step, chain)) {
      throw new ForbiddenException('No tienes permisos para autorizar en este paso del flujo');
    }

    const trailEntry: TrailEntry = {
      role: stepRoleAt(chain, step) ?? actorRole ?? 'unknown',
      userId: actor.id,
      userName: actor.nombre,
      action,
      at: new Date().toISOString(),
      note: body?.note?.trim() || undefined,
    };
    const trail = appendTrail(record.approvalTrail as TrailEntry[] | null, trailEntry);

    if (action === 'reject') {
      const updated = await this.prisma['vehicleControl'].update({
        where: { id },
        data: { estatusAprobacion: 'Rechazado', approvalTrail: trail },
        include: { solicitante: { select: { id: true, nombre: true } } },
      });
      if (updated.solicitanteId) {
        await this.notificationHierarchy.notifyVehicleRejected(updated.solicitanteId, id, record.nombreVehiculo || 'Vehículo');
      }
      return updated;
    }

    const nextStep = step + 1;
    if (isTerminalApproved(nextStep, chain)) {
      const fechaInicioAprobada = body?.fechaInicioAprobada ? new Date(body.fechaInicioAprobada) : record.fechaInicioSolicitada;
      const fechaFinAprobada = body?.fechaFinAprobada ? new Date(body.fechaFinAprobada) : record.fechaFinSolicitada;
      const updated = await this.prisma['vehicleControl'].update({
        where: { id },
        data: {
          approvalStep: nextStep,
          approvalTrail: trail,
          estatusAprobacion: 'Aprobado',
          fechaInicioAprobada,
          fechaFinAprobada,
          fechaInicio: fechaInicioAprobada,
          fechaFin: fechaFinAprobada,
        },
        include: { solicitante: { select: { id: true, nombre: true } } },
      });
      if (updated.solicitanteId) {
        await this.notificationHierarchy.notifyVehicleApproved(updated.solicitanteId, id, record.nombreVehiculo || 'Vehículo');
      }
      return updated;
    }

    return this.prisma['vehicleControl'].update({
      where: { id },
      data: { approvalStep: nextStep, approvalTrail: trail, estatusAprobacion: 'Pendiente' },
      include: { solicitante: { select: { id: true, nombre: true } } },
    });
  }

  private buildPhotoPayload(files: Record<string, string>, odometroKm: number, combustiblePct: number) {
    return {
      internas: ['interna-0', 'interna-1', 'interna-2', 'interna-3'].map((k) => files[k]).filter(Boolean),
      externas: ['externa-0', 'externa-1', 'externa-2', 'externa-3'].map((k) => files[k]).filter(Boolean),
      odometroFoto: files['odometro'] ?? null,
      odometroKm,
      combustiblePct,
      capturedAt: new Date().toISOString(),
    };
  }

  async startUse(
    id: number,
    userId: number,
    files: Record<string, string>,
    odometroKm: number,
    combustiblePct: number,
    companyId?: number | null,
  ) {
    const record = await this.findOne(id, companyId);
    if (record.estatusAprobacion !== 'Aprobado') throw new BadRequestException('La solicitud debe estar aprobada');
    if (record.solicitanteId !== userId) throw new ForbiddenException('Solo el solicitante puede registrar la salida');
    if (record.fotosSalida) throw new BadRequestException('Ya registraste la salida del vehículo');

    const fotosSalida = this.buildPhotoPayload(files, odometroKm, combustiblePct);
    if (fotosSalida.internas.length < 4 || fotosSalida.externas.length < 4 || !fotosSalida.odometroFoto) {
      throw new BadRequestException('Debes subir 4 fotos internas, 4 externas y foto del odómetro');
    }

    return this.prisma['vehicleControl'].update({
      where: { id },
      data: {
        fotosSalida,
        odometroInicio: odometroKm,
        combustibleInicioPct: combustiblePct,
        entregaEstatus: 'En uso',
        fechaInicio: record.fechaInicioAprobada ?? new Date(),
      },
    });
  }

  async endUse(
    id: number,
    userId: number,
    files: Record<string, string>,
    odometroKm: number,
    combustiblePct: number,
    companyId?: number | null,
  ) {
    const record = await this.findOne(id, companyId);
    if (record.solicitanteId !== userId) throw new ForbiddenException('Solo el solicitante puede registrar la devolución');
    if (!record.fotosSalida) throw new BadRequestException('Primero registra la salida del vehículo');

    const fotosDevolucion = this.buildPhotoPayload(files, odometroKm, combustiblePct);
    if (fotosDevolucion.internas.length < 4 || fotosDevolucion.externas.length < 4 || !fotosDevolucion.odometroFoto) {
      throw new BadRequestException('Debes subir 4 fotos internas, 4 externas y foto del odómetro');
    }
    if (record.odometroInicio != null && odometroKm < record.odometroInicio) {
      throw new BadRequestException('El kilometraje final no puede ser menor al inicial');
    }

    return this.prisma['vehicleControl'].update({
      where: { id },
      data: {
        fotosDevolucion,
        odometroFin: odometroKm,
        combustibleFinPct: combustiblePct,
        entregaEstatus: 'Devuelto',
        fechaFin: new Date(),
      },
    });
  }

  async getUsageAnalytics() {
    const rows = await this.prisma['vehicleControl'].findMany({
      where: {
        estatusAprobacion: 'Aprobado',
        odometroInicio: { not: null },
        odometroFin: { not: null },
      },
      include: {
        solicitante: { select: { id: true, nombre: true } },
        actividad: { select: { id: true, anNumber: true } },
      },
    });

    const byUser = new Map<number, {
      userId: number;
      nombre: string;
      kmTotal: number;
      fuelDeltaTotal: number;
      trips: number;
      kmPerLiterSamples: number[];
    }>();

    for (const row of rows) {
      const km = (row.odometroFin ?? 0) - (row.odometroInicio ?? 0);
      const fuelStart = row.combustibleInicioPct ?? 0;
      const fuelEnd = row.combustibleFinPct ?? 0;
      const fuelUsedPct = Math.max(0, fuelStart - fuelEnd);
      const kmPerLiter = fuelUsedPct > 0 ? km / (fuelUsedPct / 100) : null;

      const uid = row.solicitanteId;
      const cur = byUser.get(uid) ?? {
        userId: uid,
        nombre: row.solicitante?.nombre ?? '—',
        kmTotal: 0,
        fuelDeltaTotal: 0,
        trips: 0,
        kmPerLiterSamples: [],
      };
      cur.kmTotal += km;
      cur.fuelDeltaTotal += fuelUsedPct;
      cur.trips += 1;
      if (kmPerLiter != null && Number.isFinite(kmPerLiter)) cur.kmPerLiterSamples.push(kmPerLiter);
      byUser.set(uid, cur);
    }

    return {
      users: [...byUser.values()].map((u) => ({
        ...u,
        kmPromedioPorViaje: u.trips ? Math.round(u.kmTotal / u.trips) : 0,
        kmPorLitroPromedio: u.kmPerLiterSamples.length
          ? Math.round(u.kmPerLiterSamples.reduce((a, b) => a + b, 0) / u.kmPerLiterSamples.length)
          : null,
      })),
      records: rows.map((r) => ({
        id: r.id,
        solicitante: r.solicitante?.nombre,
        actividad: r.actividad?.anNumber,
        kmRecorridos: (r.odometroFin ?? 0) - (r.odometroInicio ?? 0),
        combustibleInicioPct: r.combustibleInicioPct,
        combustibleFinPct: r.combustibleFinPct,
        fotosSalida: r.fotosSalida,
        fotosDevolucion: r.fotosDevolucion,
      })),
    };
  }

  async notifyExpiringAssignments(withinHours = 24) {
    const deadline = new Date(Date.now() + withinHours * 3600_000);
    const expiring = await this.prisma['vehicleControl'].findMany({
      where: {
        estatusAprobacion: 'Aprobado',
        entregaEstatus: 'En uso',
        fechaFinAprobada: { lte: deadline, gte: new Date() },
      },
      include: { solicitante: { select: { id: true, nombre: true } } },
    });

    for (const row of expiring) {
      if (row.solicitanteId) {
        await this.notificationHierarchy.notifyVehicleExpiring(
          row.solicitanteId,
          row.id,
          row.solicitante?.nombre ?? 'Usuario',
          row.nombreVehiculo ?? 'Vehículo',
          row.fechaFinAprobada,
        );
      }
    }
    return { notified: expiring.length };
  }

  async remove(id: number, companyId?: number | null) {
    await this.findOne(id, companyId);
    return this.prisma['vehicleControl'].delete({ where: { id } });
  }
}
