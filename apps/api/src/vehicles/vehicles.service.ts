import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
// Removed unused imports for missing DTOs

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

  async create(createVehicleDto: any) {
    const vehicleControl = await this.prisma['vehicleControl'].create({
      data: createVehicleDto,
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
      if (updateVehicleDto.estatusAprobacion === 'APPROVED' && updated.solicitanteId) {
        await this.notificationHierarchy.notifyVehicleApproved(
          updated.solicitanteId,
          id,
          updateVehicleDto.nombreVehiculo || 'Vehículo',
        );
      } else if (updateVehicleDto.estatusAprobacion === 'REJECTED' && updated.solicitanteId) {
        await this.notificationHierarchy.notifyVehicleRejected(
          updated.solicitanteId,
          id,
          updateVehicleDto.nombreVehiculo || 'Vehículo',
        );
      }
    }

    return updated;
  }

  remove(id: number) {
    return this.prisma['vehicleControl'].delete({ where: { id } });
  }
}
