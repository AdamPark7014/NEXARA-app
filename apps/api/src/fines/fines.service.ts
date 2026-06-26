import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { PERMISSIONS } from '../common/permissions.js';

export interface CreateFineDto {
  usuarioId: number;
  tipo: 'actividad' | 'vehiculo' | 'asistencia' | 'herramienta';
  razon: string;
  descripcion?: string;
  monto: number;
  referenciaId?: number;
}

export interface UpdateFineDto {
  razon?: string;
  descripcion?: string;
  monto?: number;
  estatusPago?: string;
  notas?: string;
}

@Injectable()
export class FinesService {
  constructor(
    private prisma: PrismaService,
    private notificationHierarchy: NotificationHierarchyService,
  ) {}

  async create(data: CreateFineDto) {
    const fine = await this.prisma.fine.create({
      data: {
        usuarioId: data.usuarioId,
        tipo: data.tipo,
        razon: data.razon,
        descripcion: data.descripcion,
        monto: data.monto,
        referenciaId: data.referenciaId,
        estatusPago: 'Pendiente',
      },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
    });

    // Notify user about fine creation with type information
    await this.notificationHierarchy.notifyFineCreated(
      data.usuarioId,
      fine.id,
      data.razon,
      data.monto,
      data.tipo, // Pass the fine type to route to correct section
    );

    return fine;
  }

  async findAll(currentUser?: any, query?: PaginationQueryDto) {
    const include = {
      usuario: {
        select: {
          id: true,
          nombre: true,
          email: true,
          departmentId: true,
          role: {
            select: {
              id: true,
              nombre: true,
              accesoConsoleAdmin: true,
            },
          },
        },
      },
    };

    let where: any = undefined;

    if (currentUser?.isSuperAdmin) {
      where = undefined;
    } else if (
      currentUser?.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN) ||
      currentUser?.permissions?.includes(PERMISSIONS.ACTIVITIES_MANAGE)
    ) {
      // Legacy admin or v2 OPS manager: team scope within same department
      where = {
        usuario: {
          AND: [
            { departmentId: currentUser.departmentId },
            { role: { accesoConsoleAdmin: false } },
          ],
        },
      };
    } else {
      return [];
    }

    if (query?.limit) {
      const [data, total] = await Promise.all([
        this.prisma.fine.findMany({ where, include, orderBy: { fechaCreacion: 'desc' }, skip: query.skip, take: query.take }),
        this.prisma.fine.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }

    return this.prisma.fine.findMany({ where, include, orderBy: { fechaCreacion: 'desc' } });
  }

  async findByUser(usuarioId: number) {
    return this.prisma.fine.findMany({
      where: { usuarioId },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: {
        fechaCreacion: 'desc',
      },
    });
  }

  async findByType(tipo: string) {
    return this.prisma.fine.findMany({
      where: { tipo },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: {
        fechaCreacion: 'desc',
      },
    });
  }

  async findByUserAndType(usuarioId: number, tipo: string) {
    return this.prisma.fine.findMany({
      where: { usuarioId, tipo },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: {
        fechaCreacion: 'desc',
      },
    });
  }

  async update(id: number, data: UpdateFineDto) {
    return this.prisma.fine.update({
      where: { id },
      data,
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
    });
  }

  async delete(id: number) {
    return this.prisma.fine.delete({
      where: { id },
    });
  }

  async getTotalByUser(usuarioId: number, tipo?: string) {
    const fines = await this.prisma.fine.findMany({
      where: {
        usuarioId,
        ...(tipo && { tipo }),
      },
      select: {
        monto: true,
      },
    });
    return fines.reduce((sum, fine) => sum + Number(fine.monto), 0);
  }

  async getCountByUser(usuarioId: number, tipo?: string) {
    return this.prisma.fine.count({
      where: {
        usuarioId,
        ...(tipo && { tipo }),
      },
    });
  }
}
