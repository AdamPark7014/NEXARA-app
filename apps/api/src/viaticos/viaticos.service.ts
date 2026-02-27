import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';

@Injectable()
export class ViaticosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationHierarchy: NotificationHierarchyService,
  ) {}

  // Exportar a CSV
  toCSV(viatics: any[]): string {
    if (!viatics.length) return '';
    const fields = Object.keys(viatics[0]);
    const csvRows = [fields.join(',')];
    for (const row of viatics) {
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

  // Importar muchos viáticos desde JSON
  importMany(_json: any[]): never {
    throw new Error('Modelo viatico no existe en Prisma.');
  }

  async create(dto: any) {
    const viatico = await this.prisma['viatico'].create({
      data: dto,
      include: { User: { select: { nombre: true, id: true } }, Activity: { select: { anNumber: true, id: true } } },
    });

    // Notify supervisors about viatico request
    if (viatico.usuarioId && viatico.User) {
      await this.notificationHierarchy.notifyViaticRequested(
        viatico.usuarioId,
        viatico.id,
        viatico.User.nombre || 'Usuario',
        typeof viatico.montoSolicitado === 'object' && 'toNumber' in viatico.montoSolicitado
          ? viatico.montoSolicitado.toNumber()
          : Number(viatico.montoSolicitado) || 0,
      );
    }

    return viatico;
  }

  async findAll() {
    const data = await this.prisma['viatico'].findMany({
      include: { Activity: true, User: true },
    });
    return data.map((row: any) => ({
      ...row,
      actividad: row.Activity,
      usuario: row.User,
    }));
  }

  async findByDepartment(departmentId: number) {
    const data = await this.prisma['viatico'].findMany({
      where: { User: { departmentId } },
      include: { Activity: true, User: true },
    });
    return data.map((row: any) => ({
      ...row,
      actividad: row.Activity,
      usuario: row.User,
    }));
  }

  async findByUser(userId: number) {
    const data = await this.prisma['viatico'].findMany({
      where: { usuarioId: userId },
      include: { Activity: true, User: true },
    });
    return data.map((row: any) => ({
      ...row,
      actividad: row.Activity,
      usuario: row.User,
    }));
  }

  async findByAllowedUsers(userIds: number[]) {
    if (!userIds || userIds.length === 0) return [];
    const data = await this.prisma['viatico'].findMany({
      where: { usuarioId: { in: userIds } },
      include: { Activity: true, User: true },
    });
    return data.map((row: any) => ({
      ...row,
      actividad: row.Activity,
      usuario: row.User,
    }));
  }

  findOne(id: number) {
    return this.prisma['viatico'].findUnique({
      where: { id },
      include: { Activity: true, User: true },
    });
  }

  async update(id: number, dto: any) {
    // Get current viatico to check for status changes
    const currentViatico = await this.findOne(id);

    const updatedViatico = await this.prisma['viatico'].update({
      where: { id },
      data: dto,
      include: { User: { select: { nombre: true, id: true } }, Activity: { select: { anNumber: true } } },
    });

    // Notify about viatico review status changes
    if (currentViatico && dto.estatus && currentViatico.estatus !== dto.estatus) {
      if (dto.estatus === 'APPROVED' && updatedViatico.usuarioId) {
        await this.notificationHierarchy.notifyViaticReview(
          updatedViatico.usuarioId,
          id,
          'approved',
          typeof updatedViatico.montoSolicitado === 'object' && 'toNumber' in updatedViatico.montoSolicitado
            ? updatedViatico.montoSolicitado.toNumber()
            : Number(updatedViatico.montoSolicitado) || 0,
        );
      } else if (dto.estatus === 'REJECTED' && updatedViatico.usuarioId) {
        await this.notificationHierarchy.notifyViaticReview(
          updatedViatico.usuarioId,
          id,
          'rejected',
          0,
        );
      }
    }

    return updatedViatico;
  }

  remove(id: number) {
    return this.prisma['viatico'].delete({
      where: { id },
    });
  }
}
