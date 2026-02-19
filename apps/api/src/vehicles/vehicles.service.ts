import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
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

  constructor(private readonly prisma: PrismaService) {}

  create(createVehicleDto: any) {
    return this.prisma['vehicleControl'].create({ data: createVehicleDto });
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

  listAssets() {
    return this.prisma['vehicleAsset'].findMany({ orderBy: { createdAt: 'desc' } });
  }

  findAll() {
    return this.prisma['vehicleControl'].findMany({
      include: { actividad: true, solicitante: true, vehiculo: true, entregaRevisadoPor: true },
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

  findOne(id: number) {
    return this.prisma['vehicleControl'].findUnique({
      where: { id },
      include: { actividad: true, solicitante: true, vehiculo: true, entregaRevisadoPor: true },
    });
  }

  update(id: number, updateVehicleDto: any) {
    return this.prisma['vehicleControl'].update({
      where: { id },
      data: updateVehicleDto,
    });
  }

  remove(id: number) {
    return this.prisma['vehicleControl'].delete({ where: { id } });
  }
}
