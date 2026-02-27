import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';

// Definir el tipo localmente
type ToolRequestStatus = 'PENDING' | 'APPROVED' | 'IN_USE' | 'RETURNED' | 'DAMAGED' | 'REJECTED';
type RenewalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface CreateToolRequestDto {
  usuarioId: number;
  toolName: string;
  model: string;
  serialNumber: string;
  reason: string;
  startDate: Date;
  expectedReturnDate: Date;
  generalPhotoUrl: string;
  specificationsPhotoUrl: string;
}

export interface UpdateToolRequestDto {
  status?: ToolRequestStatus;
  approvalDate?: Date;
  deliveryDate?: Date;
  returnDate?: Date;
  expectedReturnDate?: Date;
  damageDescription?: string;
  damagePhotoUrl?: string;
  adminNotes?: string;
  approvedBy?: number;
}

export interface CreateRenewalDto {
  toolRequestId: number;
  newReturnDate: Date;
  renewalReason?: string;
}

@Injectable()
export class ToolRequestsService {
  constructor(
    private prisma: PrismaService,
    private notificationHierarchy: NotificationHierarchyService,
  ) {}

  async create(data: CreateToolRequestDto) {
    const toolRequest = await this.prisma.toolRequest.create({
      data: {
        usuarioId: data.usuarioId,
        toolName: data.toolName,
        model: data.model,
        serialNumber: data.serialNumber,
        reason: data.reason,
        startDate: data.startDate,
        expectedReturnDate: data.expectedReturnDate,
        generalPhotoUrl: data.generalPhotoUrl,
        specificationsPhotoUrl: data.specificationsPhotoUrl,
        status: 'PENDING',
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

    // Notify supervisors about tool request
    await this.notificationHierarchy.notifyToolRequested(
      data.usuarioId,
      toolRequest.id,
      toolRequest.usuario?.nombre || 'Usuario',
      data.toolName,
    );

    return toolRequest;
  }

  async findAll(currentUser?: any) {
    // SuperAdmin ve todas las solicitudes
    if (currentUser?.isSuperAdmin) {
      return this.prisma.toolRequest.findMany({
        include: {
          usuario: {
            select: {
              id: true,
              nombre: true,
              email: true,
              department: {
                select: {
                  id: true,
                  nombre: true,
                },
              },
              role: {
                select: {
                  id: true,
                  nombre: true,
                  accesoConsoleAdmin: true,
                },
              },
            },
          },
          approver: {
            select: {
              id: true,
              nombre: true,
              email: true,
            },
          },
        },
        orderBy: {
          requestDate: 'desc',
        },
      });
    }

    // Admin solo ve solicitudes de usuarios regulares (no otros admins/superadmins)
    if (currentUser?.permissions?.includes('CONSOLE_ADMIN')) {
      return this.prisma.toolRequest.findMany({
        where: {
          usuario: {
            role: {
              accesoConsoleAdmin: false,
            },
          },
        },
        include: {
          usuario: {
            select: {
              id: true,
              nombre: true,
              email: true,
              department: {
                select: {
                  id: true,
                  nombre: true,
                },
              },
              role: {
                select: {
                  id: true,
                  nombre: true,
                  accesoConsoleAdmin: true,
                },
              },
            },
          },
          approver: {
            select: {
              id: true,
              nombre: true,
              email: true,
            },
          },
        },
        orderBy: {
          requestDate: 'desc',
        },
      });
    }

    // Fallback: devolver todas (no debería llegar aquí)
    return this.prisma.toolRequest.findMany({
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
            department: {
              select: {
                id: true,
                nombre: true,
              },
            },
          },
        },
        approver: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: {
        requestDate: 'desc',
      },
    });
  }

  async findByUser(usuarioId: number) {
    return this.prisma.toolRequest.findMany({
      where: { usuarioId },
      include: {
        approver: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: {
        requestDate: 'desc',
      },
    });
  }

  async findByStatus(status: ToolRequestStatus) {
    return this.prisma.toolRequest.findMany({
      where: { status },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
        approver: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: {
        requestDate: 'desc',
      },
    });
  }

  async findActiveByUser(usuarioId: number) {
    return this.prisma.toolRequest.findMany({
      where: {
        usuarioId,
        status: {
          in: ['APPROVED', 'IN_USE'],
        },
      },
      include: {
        approver: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: {
        requestDate: 'desc',
      },
    });
  }

  async findById(id: number) {
    return this.prisma.toolRequest.findUnique({
      where: { id },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            email: true,
            department: {
              select: {
                id: true,
                nombre: true,
              },
            },
          },
        },
        approver: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
    });
  }

  async update(id: number, data: UpdateToolRequestDto) {
    // Get current tool request to check for status changes
    const currentToolRequest = await this.prisma.toolRequest.findUnique({
      where: { id },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
    });

    const updated = await this.prisma.toolRequest.update({
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
        approver: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
    });

    // Notify user about rejection
    if (currentToolRequest && data.status && currentToolRequest.status !== data.status) {
      if (data.status === 'REJECTED' && currentToolRequest.usuarioId) {
        await this.notificationHierarchy.notifyToolReview(
          currentToolRequest.usuarioId,
          id,
          'rejected',
          currentToolRequest.toolName || 'Herramienta',
        );
      }
    }

    return updated;
  }

  async approve(id: number, approvedBy: number) {
    const toolRequest = await this.prisma.toolRequest.findUnique({
      where: { id },
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

    const approved = await this.prisma.toolRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvalDate: new Date(),
        approvedBy,
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

    // Notify user about approval
    if (toolRequest?.usuarioId) {
      await this.notificationHierarchy.notifyToolReview(
        toolRequest.usuarioId,
        id,
        'approved',
        toolRequest.toolName,
      );
    }

    return approved;
  }

  async deliver(id: number) {
    return this.prisma.toolRequest.update({
      where: { id },
      data: {
        status: 'IN_USE',
        deliveryDate: new Date(),
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
  }

  async return(id: number, damageDescription?: string, damagePhotoUrl?: string) {
    const status = damageDescription ? 'DAMAGED' : 'RETURNED';
    return this.prisma.toolRequest.update({
      where: { id },
      data: {
        status,
        returnDate: new Date(),
        damageDescription,
        damagePhotoUrl,
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
  }

  async reject(id: number, approvedBy: number, adminNotes: string) {
    return this.prisma.toolRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approvedBy,
        adminNotes,
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
  }

  async delete(id: number) {
    return this.prisma.toolRequest.delete({
      where: { id },
    });
  }

  async getStatsByUser(usuarioId: number) {
    const [inUse, pending, returned, damaged] = await Promise.all([
      this.prisma.toolRequest.count({
        where: { usuarioId, status: 'IN_USE' },
      }),
      this.prisma.toolRequest.count({
        where: { usuarioId, status: 'PENDING' },
      }),
      this.prisma.toolRequest.count({
        where: { usuarioId, status: 'RETURNED' },
      }),
      this.prisma.toolRequest.count({
        where: { usuarioId, status: 'DAMAGED' },
      }),
    ]);

    return {
      inUse,
      pending,
      returned,
      damaged,
      total: inUse + pending + returned + damaged,
    };
  }

  // Renovaciones (Extensions)
  async requestRenewal(data: CreateRenewalDto, usuarioId: number) {
    // Verificar que la herramienta pertenece al usuario
    const toolRequest = await this.prisma.toolRequest.findUnique({
      where: { id: data.toolRequestId },
      include: {
        usuario: {
          select: {
            nombre: true,
            id: true,
          },
        },
      },
    });

    if (!toolRequest || toolRequest.usuarioId !== usuarioId) {
      throw new Error('No tienes permiso para renovar esta solicitud');
    }

    const renewal = await this.prisma.toolRenewal.create({
      data: {
        toolRequestId: data.toolRequestId,
        previousReturnDate: toolRequest.expectedReturnDate,
        newReturnDate: data.newReturnDate,
        renewalReason: data.renewalReason,
        status: 'PENDING',
      },
      include: {
        toolRequest: {
          select: {
            toolName: true,
            usuario: {
              select: {
                nombre: true,
                email: true,
              },
            },
          },
        },
      },
    });

    // Notify supervisors about renewal request
    await this.notificationHierarchy.notifyToolRenewalRequested(
      usuarioId,
      renewal.id,
      toolRequest.usuario?.nombre || 'Usuario',
      toolRequest.toolName,
    );

    return renewal;
  }

  async findRenewals(toolRequestId?: number, status?: RenewalStatus) {
    const where: any = {};
    if (toolRequestId) where.toolRequestId = toolRequestId;
    if (status) where.status = status;

    return this.prisma.toolRenewal.findMany({
      where,
      include: {
        toolRequest: {
          include: {
            usuario: {
              select: {
                id: true,
                nombre: true,
                email: true,
              },
            },
          },
        },
        approver: {
          select: {
            id: true,
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: {
        requestDate: 'desc',
      },
    });
  }

  async approveRenewal(renewalId: number, approvedBy: number) {
    const renewal = await this.prisma.toolRenewal.findUnique({
      where: { id: renewalId },
    });

    if (!renewal) throw new Error('Renovación no encontrada');

    // Actualizar la solicitud de herramienta con la nueva fecha de devolución
    await this.prisma.toolRequest.update({
      where: { id: renewal.toolRequestId },
      data: {
        expectedReturnDate: renewal.newReturnDate,
        renewalCount: {
          increment: 1,
        },
      },
    });

    // Actualizar la renovación
    const updated = await this.prisma.toolRenewal.update({
      where: { id: renewalId },
      data: {
        status: 'APPROVED',
        approvalDate: new Date(),
        approvedBy,
      },
    });

    // Crear notificación
    await this.createNotification(
      renewal.toolRequestId,
      (await this.prisma.toolRequest.findUnique({ where: { id: renewal.toolRequestId } }))!.usuarioId,
      'TOOL_RENEWAL_APPROVED',
      `Tu solicitud de renovación para ${(await this.prisma.toolRequest.findUnique({ where: { id: renewal.toolRequestId }, select: { toolName: true } }))!.toolName} ha sido aprobada`
    );

    return updated;
  }

  async rejectRenewal(renewalId: number, approvedBy: number, reason: string) {
    return this.prisma.toolRenewal.update({
      where: { id: renewalId },
      data: {
        status: 'REJECTED',
        approvedBy,
      },
    });
  }

  // Notificaciones
  async createNotification(toolRequestId: number, usuarioId: number, type: string, message: string) {
    return this.prisma.toolRequestNotification.create({
      data: {
        toolRequestId,
        usuarioId,
        type: type as any,
        message,
      },
    });
  }

  async getUserNotifications(usuarioId: number) {
    return this.prisma.toolRequestNotification.findMany({
      where: { usuarioId },
      include: {
        toolRequest: {
          select: {
            id: true,
            toolName: true,
            status: true,
          },
        },
      },
      orderBy: {
        sentAt: 'desc',
      },
    });
  }

  async markNotificationAsRead(notificationId: number) {
    return this.prisma.toolRequestNotification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  // Verificar y enviar alertas de vencimiento próximo (debe ejecutarse via cron)
  async checkExpiringTools() {
    const now = new Date();
    // Alertar herramientas que vencen en 2 días
    const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

    const expiringTools = await this.prisma.toolRequest.findMany({
      where: {
        status: 'IN_USE',
        expectedReturnDate: {
          lte: twoDaysFromNow,
          gt: now,
        },
        notificationSent: false,
      },
    });

    for (const tool of expiringTools) {
      await this.createNotification(
        tool.id,
        tool.usuarioId,
        'TOOL_EXPIRATION_WARNING',
        `La herramienta "${tool.toolName}" vence el ${tool.expectedReturnDate.toLocaleDateString()}. Por favor, devuélvela o solicita una renovación.`
      );

      // Marcar como notificado
      await this.prisma.toolRequest.update({
        where: { id: tool.id },
        data: {
          notificationSent: true,
          notificationSentAt: new Date(),
        },
      });
    }

    return expiringTools.length;
  }
}
