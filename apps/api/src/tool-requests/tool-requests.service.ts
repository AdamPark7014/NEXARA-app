import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { PERMISSIONS } from '../common/permissions.js';

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

export interface CreateInventoryItemDto {
  toolName: string;
  model: string;
  serialNumber: string;
  panoramicPhotoUrl: string;
  serialPhotoUrl: string;
}

export interface UpdateInventoryItemDto {
  toolName?: string;
  model?: string;
  serialNumber?: string;
  panoramicPhotoUrl?: string;
  serialPhotoUrl?: string;
  status?: 'AVAILABLE' | 'ASSIGNED' | 'IN_REPAIR' | 'RETIRED';
  retiredReason?: string;
}

export interface ReplaceInventoryItemDto {
  toolName: string;
  model: string;
  serialNumber: string;
  panoramicPhotoUrl: string;
  serialPhotoUrl: string;
  retiredReason?: string;
}

export interface AssignKitItemDto {
  inventoryItemId: number;
  userId: number;
  assignmentType: 'KIT' | 'LOAN';
  dueReturnDate?: Date;
  notes?: string;
}

export interface ReportKitEventDto {
  description: string;
}

export interface ResolveKitEventDto {
  resolution: 'USER_MISUSE' | 'EQUIPMENT_FAILURE';
  notes?: string;
  fineAmount?: number;
  fineReason?: string;
  replacementItemId?: number;
}

@Injectable()
export class ToolRequestsService {
  private readonly superAdminEmails = ['gerencia@nexara.com.mx', 'developer@nexara.com.mx'];

  constructor(
    private prisma: PrismaService,
    private notificationHierarchy: NotificationHierarchyService,
  ) {}

  async create(data: CreateToolRequestDto) {
    if ((data as any).inventoryItemId) {
      const inventoryItem = await (this.prisma as any).toolInventoryItem.findUnique({
        where: { id: Number((data as any).inventoryItemId) },
      });

      if (!inventoryItem) {
        throw new Error('La herramienta seleccionada no existe en inventario');
      }

      if (inventoryItem.status !== 'AVAILABLE') {
        throw new Error('La herramienta seleccionada no está disponible en inventario');
      }

      data.toolName = inventoryItem.toolName;
      data.model = inventoryItem.model;
      data.serialNumber = inventoryItem.serialNumber;
      data.generalPhotoUrl = data.generalPhotoUrl || inventoryItem.panoramicPhotoUrl;
      data.specificationsPhotoUrl = data.specificationsPhotoUrl || inventoryItem.serialPhotoUrl;
    }

    const toolRequest = await this.prisma.toolRequest.create({
      data: {
        usuarioId: data.usuarioId,
        inventoryItemId: (data as any).inventoryItemId ? Number((data as any).inventoryItemId) : undefined,
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
              departmentId: true,
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

    // Admin solo ve solicitudes de usuarios regulares de su departamento
    if (currentUser?.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN)) {
      return this.prisma.toolRequest.findMany({
        where: {
          usuario: {
            AND: [
              { departmentId: currentUser.departmentId },
              { role: { accesoConsoleAdmin: false } },
            ],
          },
        },
        include: {
          usuario: {
            select: {
              id: true,
              nombre: true,
              email: true,
              departmentId: true,
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

    // Fallback: devolver vacío
    return [];
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
    const request = await this.prisma.toolRequest.findUnique({
      where: { id },
      select: { id: true, inventoryItemId: true },
    });

    if (!request) {
      throw new Error('Solicitud no encontrada');
    }

    return (this.prisma as any).$transaction(async (tx: any) => {
      const updatedRequest = await tx.toolRequest.update({
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

      if (request.inventoryItemId) {
        await tx.toolInventoryItem.update({
          where: { id: request.inventoryItemId },
          data: { status: 'ASSIGNED' },
        });
      }

      return updatedRequest;
    });
  }

  async return(id: number, damageDescription?: string, damagePhotoUrl?: string) {
    const status = damageDescription ? 'DAMAGED' : 'RETURNED';
    const request = await this.prisma.toolRequest.findUnique({
      where: { id },
      select: { id: true, inventoryItemId: true },
    });

    if (!request) {
      throw new Error('Solicitud no encontrada');
    }

    return (this.prisma as any).$transaction(async (tx: any) => {
      const updatedRequest = await tx.toolRequest.update({
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

      if (request.inventoryItemId) {
        await tx.toolInventoryItem.update({
          where: { id: request.inventoryItemId },
          data: {
            status: damageDescription ? 'IN_REPAIR' : 'AVAILABLE',
          },
        });
      }

      return updatedRequest;
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

  async getInventory(search?: string, includeRetired = false) {
    const where: any = {};

    if (!includeRetired) {
      where.status = { not: 'RETIRED' };
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { toolName: { contains: q, mode: 'insensitive' } },
        { model: { contains: q, mode: 'insensitive' } },
        { serialNumber: { contains: q, mode: 'insensitive' } },
      ];
    }

    return (this.prisma as any).toolInventoryItem.findMany({
      where,
      include: {
        replacementOf: {
          select: {
            id: true,
            serialNumber: true,
          },
        },
        replacements: {
          select: {
            id: true,
            serialNumber: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ toolName: 'asc' }, { model: 'asc' }, { serialNumber: 'asc' }],
    });
  }

  async searchInventoryOptions(search: string) {
    const q = (search || '').trim();
    if (!q) return [];

    return (this.prisma as any).toolInventoryItem.findMany({
      where: {
        status: 'AVAILABLE',
        OR: [
          { toolName: { contains: q, mode: 'insensitive' } },
          { model: { contains: q, mode: 'insensitive' } },
          { serialNumber: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        toolName: true,
        model: true,
        serialNumber: true,
        status: true,
      },
      take: 15,
      orderBy: [{ toolName: 'asc' }, { model: 'asc' }],
    });
  }

  async createInventoryItem(data: CreateInventoryItemDto, currentUserId: number) {
    return (this.prisma as any).toolInventoryItem.create({
      data: {
        toolName: data.toolName,
        model: data.model,
        serialNumber: data.serialNumber,
        panoramicPhotoUrl: data.panoramicPhotoUrl,
        serialPhotoUrl: data.serialPhotoUrl,
        createdById: currentUserId,
        updatedById: currentUserId,
      },
    });
  }

  async updateInventoryItem(id: number, data: UpdateInventoryItemDto, currentUserId: number) {
    return (this.prisma as any).toolInventoryItem.update({
      where: { id },
      data: {
        ...data,
        updatedById: currentUserId,
      },
    });
  }

  async replaceInventoryItem(id: number, data: ReplaceInventoryItemDto, currentUserId: number) {
    const current = await (this.prisma as any).toolInventoryItem.findUnique({ where: { id } });
    if (!current) throw new Error('Herramienta no encontrada');

    return (this.prisma as any).$transaction(async (tx: any) => {
      const replacement = await tx.toolInventoryItem.create({
        data: {
          toolName: data.toolName,
          model: data.model,
          serialNumber: data.serialNumber,
          panoramicPhotoUrl: data.panoramicPhotoUrl,
          serialPhotoUrl: data.serialPhotoUrl,
          replacementOfId: id,
          createdById: currentUserId,
          updatedById: currentUserId,
          status: 'AVAILABLE',
        },
      });

      await tx.toolInventoryItem.update({
        where: { id },
        data: {
          status: 'RETIRED',
          retiredReason: data.retiredReason || 'Reemplazada por nuevo equipo',
          updatedById: currentUserId,
        },
      });

      await tx.toolKitAssignment.updateMany({
        where: { inventoryItemId: id, isActive: true },
        data: {
          isActive: false,
          returnedAt: new Date(),
        },
      });

      return replacement;
    });
  }

  private async isSuperAdminByEmail(userId: number, currentUser?: { isSuperAdmin?: boolean }) {
    if (currentUser?.isSuperAdmin) return true;

    const dbUser = await (this.prisma as any).user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    return Boolean(dbUser?.email && this.superAdminEmails.includes(String(dbUser.email).toLowerCase()));
  }

  async getMyKit(userId: number) {
    return (this.prisma as any).toolKitAssignment.findMany({
      where: { userId, isActive: true },
      include: {
        inventoryItem: true,
        events: {
          orderBy: { reportedAt: 'desc' },
          take: 20,
        },
      },
      orderBy: { assignedAt: 'desc' },
    });
  }

  async getUsersKit(
    currentUser: { id: number; isSuperAdmin?: boolean; permissions?: string[] },
    userId?: number,
  ) {
    const isSuperAdmin = await this.isSuperAdminByEmail(currentUser.id, currentUser);
    const isAdmin = Boolean(currentUser.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN));

    if (!isSuperAdmin && !isAdmin) {
      return [];
    }

    const whereUser: any = {};
    if (userId) {
      whereUser.id = userId;
    }

    if (!isSuperAdmin) {
      whereUser.role = { accesoConsoleAdmin: false };
      whereUser.email = { notIn: this.superAdminEmails };
    }

    const assignments = await (this.prisma as any).toolKitAssignment.findMany({
      where: {
        ...(userId ? { userId } : {}),
        user: whereUser,
      },
      include: {
        user: {
          select: {
            id: true,
            nombre: true,
            email: true,
            role: {
              select: {
                nombre: true,
                accesoConsoleAdmin: true,
              },
            },
          },
        },
        inventoryItem: true,
        events: {
          orderBy: { reportedAt: 'desc' },
        },
      },
      orderBy: [{ userId: 'asc' }, { assignedAt: 'desc' }],
    });

    return assignments;
  }

  async assignKitItem(
    data: AssignKitItemDto,
    currentUser: { id: number; isSuperAdmin?: boolean; permissions?: string[] },
  ) {
    const inventoryItem = await (this.prisma as any).toolInventoryItem.findUnique({
      where: { id: data.inventoryItemId },
    });
    if (!inventoryItem) throw new Error('Herramienta de inventario no encontrada');

    const isSuperAdmin = await this.isSuperAdminByEmail(currentUser.id, currentUser);
    const isAdmin = Boolean(currentUser.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN));

    if (!isSuperAdmin && !isAdmin) {
      throw new Error('No tienes permisos para asignar herramientas');
    }

    if (!isSuperAdmin) {
      const target = await (this.prisma as any).user.findUnique({
        where: { id: data.userId },
        select: {
          email: true,
          role: { select: { accesoConsoleAdmin: true } },
        },
      });

      if (!target || target.role?.accesoConsoleAdmin || this.superAdminEmails.includes(String(target.email).toLowerCase())) {
        throw new Error('Como admin solo puedes asignar a usuarios normales');
      }
    }

    return (this.prisma as any).$transaction(async (tx: any) => {
      const assignment = await tx.toolKitAssignment.create({
        data: {
          inventoryItemId: data.inventoryItemId,
          userId: data.userId,
          assignmentType: data.assignmentType,
          dueReturnDate: data.dueReturnDate,
          notes: data.notes,
          assignedById: currentUser.id,
          isActive: true,
        },
        include: {
          user: { select: { id: true, nombre: true, email: true } },
          inventoryItem: true,
        },
      });

      await tx.toolInventoryItem.update({
        where: { id: data.inventoryItemId },
        data: {
          status: 'ASSIGNED',
          updatedById: currentUser.id,
        },
      });

      return assignment;
    });
  }

  async reportKitEvent(
    assignmentId: number,
    data: ReportKitEventDto,
    currentUser: { id: number; isSuperAdmin?: boolean; permissions?: string[] },
  ) {
    const assignment = await (this.prisma as any).toolKitAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: { select: { accesoConsoleAdmin: true } },
          },
        },
      },
    });

    if (!assignment) throw new Error('Asignación no encontrada');

    const isSuperAdmin = await this.isSuperAdminByEmail(currentUser.id, currentUser);
    const isAdmin = Boolean(currentUser.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN));
    const isOwner = assignment.userId === currentUser.id;

    if (!isOwner && !isAdmin && !isSuperAdmin) {
      throw new Error('No tienes permisos para reportar este evento');
    }

    if (isAdmin && !isSuperAdmin) {
      const targetEmail = String(assignment.user?.email || '').toLowerCase();
      if (assignment.user?.role?.accesoConsoleAdmin || this.superAdminEmails.includes(targetEmail)) {
        throw new Error('Como admin solo puedes gestionar herramientas de usuarios normales');
      }
    }

    return (this.prisma as any).toolKitEvent.create({
      data: {
        assignmentId,
        reportedById: currentUser.id,
        description: data.description,
        resolution: 'PENDING',
      },
    });
  }

  async resolveKitEvent(
    eventId: number,
    data: ResolveKitEventDto,
    currentUser: { id: number; isSuperAdmin?: boolean; permissions?: string[] },
  ) {
    const isSuperAdmin = await this.isSuperAdminByEmail(currentUser.id, currentUser);
    const isAdmin = Boolean(currentUser.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN));

    if (!isSuperAdmin && !isAdmin) {
      throw new Error('No tienes permisos para resolver incidentes de kit');
    }

    const event = await (this.prisma as any).toolKitEvent.findUnique({
      where: { id: eventId },
      include: {
        assignment: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                role: { select: { accesoConsoleAdmin: true } },
              },
            },
            inventoryItem: {
              select: {
                id: true,
                toolName: true,
                model: true,
              },
            },
          },
        },
      },
    });

    if (!event) {
      throw new Error('Incidente no encontrado');
    }

    if (event.resolution !== 'PENDING') {
      throw new Error('Este incidente ya fue resuelto');
    }

    if (!isSuperAdmin) {
      const targetEmail = String(event.assignment.user?.email || '').toLowerCase();
      if (
        event.assignment.user?.role?.accesoConsoleAdmin ||
        this.superAdminEmails.includes(targetEmail)
      ) {
        throw new Error('Como admin solo puedes gestionar kits de usuarios normales');
      }
    }

    return (this.prisma as any).$transaction(async (tx: any) => {
      let replacementItemId = data.replacementItemId;

      if (!replacementItemId && data.resolution === 'EQUIPMENT_FAILURE') {
        const autoReplacement = await tx.toolInventoryItem.findFirst({
          where: {
            status: 'AVAILABLE',
            toolName: event.assignment.inventoryItem.toolName,
            model: event.assignment.inventoryItem.model,
            id: { not: event.assignment.inventoryItem.id },
          },
          orderBy: { createdAt: 'asc' },
        });
        replacementItemId = autoReplacement?.id;
      }

      let fineId: number | null = null;
      if (data.resolution === 'USER_MISUSE') {
        const fineAmount = Number(data.fineAmount || 0);
        if (fineAmount <= 0) {
          throw new Error('Debes indicar un monto válido para multa por mal uso');
        }

        const fine = await tx.fine.create({
          data: {
            usuarioId: event.assignment.userId,
            tipo: 'herramienta',
            razon: data.fineReason || 'Mal uso de herramienta de kit',
            descripcion: data.notes || event.description,
            monto: fineAmount,
            referenciaId: event.assignmentId,
            estatusPago: 'Pendiente',
          },
        });
        fineId = fine.id;
      }

      if (replacementItemId) {
        const replacement = await tx.toolInventoryItem.findUnique({
          where: { id: replacementItemId },
        });
        if (!replacement || replacement.status !== 'AVAILABLE') {
          throw new Error('La herramienta de reemplazo no está disponible');
        }

        await tx.toolKitAssignment.update({
          where: { id: event.assignmentId },
          data: {
            isActive: false,
            returnedAt: new Date(),
            replacementCount: {
              increment: 1,
            },
          },
        });

        await tx.toolKitAssignment.create({
          data: {
            inventoryItemId: replacementItemId,
            userId: event.assignment.userId,
            assignmentType: event.assignment.assignmentType,
            assignedById: currentUser.id,
            isActive: true,
            notes: data.notes || `Reemplazo por incidente #${event.id}`,
          },
        });

        await tx.toolInventoryItem.update({
          where: { id: replacementItemId },
          data: { status: 'ASSIGNED', updatedById: currentUser.id },
        });

        await tx.toolInventoryItem.update({
          where: { id: event.assignment.inventoryItemId },
          data: { status: 'IN_REPAIR', updatedById: currentUser.id },
        });
      } else {
        await tx.toolInventoryItem.update({
          where: { id: event.assignment.inventoryItemId },
          data: { status: 'IN_REPAIR', updatedById: currentUser.id },
        });
      }

      return tx.toolKitEvent.update({
        where: { id: eventId },
        data: {
          resolution: data.resolution,
          resolvedById: currentUser.id,
          resolvedAt: new Date(),
          fineId,
          replacementItemId: replacementItemId || null,
          description: data.notes ? `${event.description}\n\nResolución: ${data.notes}` : event.description,
        },
      });
    });
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

  async findRenewals(
    toolRequestId?: number,
    status?: RenewalStatus,
    currentUser?: { id: number; isSuperAdmin?: boolean; permissions?: string[]; departmentId?: number }
  ) {
    const where: any = {};
    if (toolRequestId) where.toolRequestId = toolRequestId;
    if (status) where.status = status;

    // Si se proporciona usuario, filtrar por jerarquía
    if (currentUser) {
      const isSuperAdmin = currentUser.isSuperAdmin === true;
      const isConsoleAdmin = currentUser.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN);

      if (!isSuperAdmin && isConsoleAdmin) {
        // Admin console: solo ve renovaciones de usuarios en su departamento
        where.toolRequest = {
          usuario: {
            departmentId: currentUser.departmentId,
          },
        };
      } else if (!isSuperAdmin && !isConsoleAdmin) {
        // Usuario normal: no debería ver esta lista
        return [];
      }
      // SuperAdmin: ve todas (sin filtro adicional)
    }

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
                department: {
                  select: {
                    id: true,
                    nombre: true,
                  },
                },
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

  async approveRenewal(
    renewalId: number,
    approver: { id: number; isSuperAdmin?: boolean; permissions?: string[]; departmentId?: number }
  ) {
    const renewal = await this.prisma.toolRenewal.findUnique({
      where: { id: renewalId },
      include: {
        toolRequest: {
          include: {
            usuario: {
              select: {
                id: true,
                department: { select: { id: true } },
              },
            },
          },
        },
      },
    });

    if (!renewal) throw new Error('Renovación no encontrada');

    // Validar permisos
    const isSuperAdmin = approver.isSuperAdmin === true;
    const isConsoleAdmin = approver.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN);

    if (!isSuperAdmin && !isConsoleAdmin) {
      throw new Error('No tienes permisos para aprobar renovaciones');
    }

    // Si es admin (no superadmin), validar que el usuario esté en su departamento
    if (!isSuperAdmin && isConsoleAdmin) {
      const requesterDeptId = renewal.toolRequest.usuario.department?.id;
      if (requesterDeptId !== approver.departmentId) {
        throw new Error('Solo puedes aprobar renovaciones de usuarios en tu departamento');
      }
    }

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
        approvedBy: approver.id,
      },
    });

    // Crear notificación
    const toolRequest = renewal.toolRequest;
    await this.createNotification(
      renewal.toolRequestId,
      toolRequest.usuarioId,
      'TOOL_RENEWAL_APPROVED',
      `Tu solicitud de renovación para "${toolRequest.toolName}" ha sido aprobada`
    );

    return updated;
  }

  async rejectRenewal(
    renewalId: number,
    approver: { id: number; isSuperAdmin?: boolean; permissions?: string[]; departmentId?: number },
    reason: string
  ) {
    const renewal = await this.prisma.toolRenewal.findUnique({
      where: { id: renewalId },
      include: {
        toolRequest: {
          include: {
            usuario: {
              select: {
                id: true,
                department: { select: { id: true } },
              },
            },
          },
        },
      },
    });

    if (!renewal) throw new Error('Renovación no encontrada');

    // Validar permisos
    const isSuperAdmin = approver.isSuperAdmin === true;
    const isConsoleAdmin = approver.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN);

    if (!isSuperAdmin && !isConsoleAdmin) {
      throw new Error('No tienes permisos para rechazar renovaciones');
    }

    // Si es admin (no superadmin), validar que el usuario esté en su departamento
    if (!isSuperAdmin && isConsoleAdmin) {
      const requesterDeptId = renewal.toolRequest.usuario.department?.id;
      if (requesterDeptId !== approver.departmentId) {
        throw new Error('Solo puedes rechazar renovaciones de usuarios en tu departamento');
      }
    }

    // Actualizar la renovación
    const updated = await this.prisma.toolRenewal.update({
      where: { id: renewalId },
      data: {
        status: 'REJECTED',
        approvedBy: approver.id,
      },
    });

    // Crear notificación de rechazo
    const toolRequest = renewal.toolRequest;
    await this.createNotification(
      renewal.toolRequestId,
      toolRequest.usuarioId,
      'TOOL_RENEWAL_REJECTED',
      `Tu solicitud de renovación para "${toolRequest.toolName}" ha sido rechazada. Motivo: ${reason}`
    );

    return updated;
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
