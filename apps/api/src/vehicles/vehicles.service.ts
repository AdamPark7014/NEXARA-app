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

  async create(createVehicleDto: any) {
    const vehicleControl = await this.prisma['vehicleControl'].create({
      data: {
        ...createVehicleDto,
        approvalStep: 0,
        approvalTrail: [],
        estatusAprobacion: createVehicleDto.estatusAprobacion ?? 'Pendiente',
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

  getAsset(id: number) {
    return this.prisma['vehicleAsset'].findUnique({ where: { id } });
  }

  createAsset(data: any) {
    return this.prisma['vehicleAsset'].create({ data });
  }

  updateAsset(id: number, data: any) {
    return this.prisma['vehicleAsset'].update({ where: { id }, data });
  }

  removeAsset(id: number) {
    return this.prisma['vehicleAsset'].delete({ where: { id } });
  }

  async listAssets(query?: PaginationQueryDto) {
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma['vehicleAsset'].findMany({ orderBy: { createdAt: 'desc' }, skip: query.skip, take: query.take }),
        this.prisma['vehicleAsset'].count(),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma['vehicleAsset'].findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findAll(query?: PaginationQueryDto) {
    const include = { actividad: true, solicitante: true, vehiculo: true, entregaRevisadoPor: true };
    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma['vehicleControl'].findMany({ include, orderBy: { fechaSolicitud: 'desc' }, skip: query.skip, take: query.take }),
        this.prisma['vehicleControl'].count(),
      ]);
      return buildPaginatedResponse(data, total, query);
    }
    return this.prisma['vehicleControl'].findMany({
      include,
      orderBy: { fechaSolicitud: 'desc' },
    });
  }

  findByDepartment(departmentId: number) {
    return this.prisma['vehicleControl'].findMany({
      where: { solicitante: { departmentId } },
      include: { actividad: true, solicitante: true, vehiculo: true, entregaRevisadoPor: true },
      orderBy: { fechaSolicitud: 'desc' },
    });
  }

  findByResponsible(userId: number) {
    return this.prisma['vehicleControl'].findMany({
      where: { solicitanteId: userId },
      include: { actividad: true, solicitante: true, vehiculo: true, entregaRevisadoPor: true },
      orderBy: { fechaSolicitud: 'desc' },
    });
  }

  findByAllowedUsers(userIds: number[]) {
    if (!userIds || userIds.length === 0) return [];
    return this.prisma['vehicleControl'].findMany({
      where: { solicitanteId: { in: userIds } },
      include: { actividad: true, solicitante: true, vehiculo: true, entregaRevisadoPor: true },
      orderBy: { fechaSolicitud: 'desc' },
    });
  }

  findOne(id: number) {
    return this.prisma['vehicleControl'].findUnique({
      where: { id },
      include: { actividad: true, solicitante: true, vehiculo: true, entregaRevisadoPor: true },
    });
  }

  async update(id: number, updateVehicleDto: any) {
    // Get current vehicle to check for status changes
    const currentVehicle = await this.findOne(id);

    const updated = await this.prisma['vehicleControl'].update({
      where: { id },
      data: updateVehicleDto,
      include: { solicitante: { select: { id: true, nombre: true } } },
    });

    // Notify about vehicle approval/rejection
    if (currentVehicle && updateVehicleDto.estatusAprobacion && currentVehicle.estatusAprobacion !== updateVehicleDto.estatusAprobacion) {
      if (updateVehicleDto.estatusAprobacion === 'Aprobado' && updated.solicitanteId) {
        await this.notificationHierarchy.notifyVehicleApproved(
          updated.solicitanteId,
          id,
          updateVehicleDto.nombreVehiculo || currentVehicle.nombreVehiculo || 'Vehículo',
        );
      } else if (updateVehicleDto.estatusAprobacion === 'Rechazado' && updated.solicitanteId) {
        await this.notificationHierarchy.notifyVehicleRejected(
          updated.solicitanteId,
          id,
          updateVehicleDto.nombreVehiculo || currentVehicle.nombreVehiculo || 'Vehículo',
        );
      }
    }

    return updated;
  }

  async approveOrReject(id: number, actor: any, action: 'approve' | 'reject', body?: { note?: string; fechaInicioAprobada?: string; fechaFinAprobada?: string }) {
    const record = await this.findOne(id);
    if (!record) throw new BadRequestException('Solicitud no encontrada');
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

  async startUse(id: number, userId: number, files: Record<string, string>, odometroKm: number, combustiblePct: number) {
    const record = await this.findOne(id);
    if (!record) throw new BadRequestException('Solicitud no encontrada');
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

  async endUse(id: number, userId: number, files: Record<string, string>, odometroKm: number, combustiblePct: number) {
    const record = await this.findOne(id);
    if (!record) throw new BadRequestException('Solicitud no encontrada');
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

  remove(id: number) {
    return this.prisma['vehicleControl'].delete({ where: { id } });
  }
}
