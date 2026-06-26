import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { AutoApprovalService } from '../workflow/auto-approval.service.js';

@Injectable()
export class ViaticosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationHierarchy: NotificationHierarchyService,
    private readonly autoApproval: AutoApprovalService,
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

    const amount =
      typeof viatico.montoSolicitado === 'object' && 'toNumber' in viatico.montoSolicitado
        ? viatico.montoSolicitado.toNumber()
        : Number(viatico.montoSolicitado) || 0;

    // Notify supervisors about viatico request
    if (viatico.usuarioId && viatico.User) {
      await this.notificationHierarchy.notifyViaticRequested(
        viatico.usuarioId,
        viatico.id,
        viatico.User.nombre || 'Usuario',
        amount,
      );

      this.autoApproval
        .evaluate({
          entityType: 'VIATIC',
          entityId: viatico.id,
          userId: viatico.usuarioId,
          payload: { amount, outOfPolicy: Boolean(dto?.outOfPolicy) },
        })
        .catch(() => undefined);
    }

    return viatico;
  }

  async findAll(currentUser?: any, query?: PaginationQueryDto) {
    const include = { Activity: true, User: true };
    let where: any = undefined;

    if (currentUser?.isSuperAdmin) {
      where = undefined;
    } else if (
      currentUser?.permissions?.includes('CONSOLE_ADMIN') ||
      currentUser?.permissions?.includes('viaticos.manage')
    ) {
      // Legacy admin or v2 OPS manager: team scope within same department
      where = {
        User: {
          AND: [
            { departmentId: currentUser.departmentId },
            { role: { accesoConsoleAdmin: false } },
          ],
        },
      };
    } else {
      where = { usuarioId: currentUser?.id };
    }

    const mapRow = (row: any) => ({ ...row, actividad: row.Activity, usuario: row.User });

    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma['viatico'].findMany({ where, include, orderBy: { fechaSolicitud: 'desc' }, skip: query.skip, take: query.take }),
        this.prisma['viatico'].count({ where }),
      ]);
      return buildPaginatedResponse(data.map(mapRow), total, query);
    }

    const data = await this.prisma['viatico'].findMany({ where, include });
    return data.map(mapRow);
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

