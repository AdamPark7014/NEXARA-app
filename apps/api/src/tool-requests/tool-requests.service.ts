import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto, buildPaginatedResponse } from '../common/dto/pagination.dto.js';
import { NotificationHierarchyService } from '../notifications/notification-hierarchy.service.js';
import { PERMISSIONS } from '../common/permissions.js';
import { assertCompanyAccess, companyWhere, mergeCompanyWhere, requireCompanyId } from '../common/tenant/tenant-scope.js';

const FIELD_KIT_ROLE_KEYS = ['ing_campo', 'ing_soporte'] as const;
const BROAD_KIT_ASSIGN_SCOPE = new Set(['ceo', 'dir_operaciones', 'arquitecto', 'super_admin']);

// Definir el tipo localmente
type ToolRequestStatus = 'PENDING' | 'APPROVED' | 'IN_USE' | 'RETURNED' | 'DAMAGED' | 'REJECTED';
type RenewalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface CreateToolRequestDto {
  usuarioId: number;
  inventoryItemId: number;
  toolName?: string;
  model?: string;
  serialNumber?: string;
  reason: string;
  startDate: Date;
  expectedReturnDate: Date;
  generalPhotoUrl?: string;
  specificationsPhotoUrl?: string;
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

  async create(data: CreateToolRequestDto, companyId?: number | null) {
    const inventoryItemId = Number(data.inventoryItemId);
    if (!Number.isFinite(inventoryItemId) || inventoryItemId <= 0) {
      throw new BadRequestException('Debes seleccionar una herramienta del inventario');
    }

    const inventoryScope =
      companyId != null && Number(companyId) > 0
        ? { id: inventoryItemId, ...companyWhere(companyId) }
        : { id: inventoryItemId };

    const inventoryItem = await (this.prisma as any).toolInventoryItem.findFirst({
      where: inventoryScope,
    });

    if (!inventoryItem) {
      throw new BadRequestException('La herramienta seleccionada no existe en inventario');
    }

    const tenantId =
      inventoryItem.companyId != null && Number(inventoryItem.companyId) > 0
        ? Number(inventoryItem.companyId)
        : requireCompanyId(companyId);

    if (inventoryItem.status !== 'AVAILABLE') {
      throw new BadRequestException('La herramienta seleccionada no está disponible en inventario');
    }

    const activeRequest = await this.prisma.toolRequest.findFirst({
      where: {
        inventoryItemId,
        status: { in: ['PENDING', 'APPROVED', 'IN_USE'] },
        ...companyWhere(tenantId),
      },
      select: { id: true },
    });

    if (activeRequest) {
      throw new BadRequestException('La herramienta ya tiene una solicitud activa y no puede duplicarse');
    }

    const toolName = inventoryItem.toolName as string;
    const model = inventoryItem.model as string;
    const serialNumber = inventoryItem.serialNumber as string;
    const generalPhotoUrl = (data.generalPhotoUrl || inventoryItem.panoramicPhotoUrl) as string;
    const specificationsPhotoUrl = (data.specificationsPhotoUrl || inventoryItem.serialPhotoUrl) as string;

    if (!generalPhotoUrl?.trim() || !specificationsPhotoUrl?.trim()) {
      throw new BadRequestException(
        'La herramienta no tiene fotos registradas en inventario. Solicita a operaciones que las cargue antes de continuar.',
      );
    }

    const toolRequest = await this.prisma.toolRequest.create({
      data: {
        companyId: tenantId,
        usuarioId: data.usuarioId,
        inventoryItemId,
        toolName,
        model,
        serialNumber,
        reason: data.reason,
        startDate: data.startDate,
        expectedReturnDate: data.expectedReturnDate,
        generalPhotoUrl,
        specificationsPhotoUrl,
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
      toolName,
    );

    return toolRequest;
  }

  async findAll(currentUser?: any, query?: PaginationQueryDto, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const include = {
      usuario: {
        select: { id: true, nombre: true, email: true, departmentId: true, department: { select: { id: true, nombre: true } }, role: { select: { id: true, nombre: true, accesoConsoleAdmin: true } } },
      },
      approver: { select: { id: true, nombre: true, email: true } },
    };

    let where: any = { ...companyWhere(tenantId) };

    if (currentUser?.isSuperAdmin) {
      // tenant scope only
    } else if (currentUser?.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN) || currentUser?.permissions?.includes(PERMISSIONS.TOOLS_MANAGE)) {
      // Admin consola o manager v2 (coord_operaciones, etc.): ve solicitudes de su departamento
      where = {
        ...companyWhere(tenantId),
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
        this.prisma.toolRequest.findMany({ where, include, orderBy: { requestDate: 'desc' }, skip: query.skip, take: query.take }),
        this.prisma.toolRequest.count({ where }),
      ]);
      return buildPaginatedResponse(data, total, query);
    }

    return this.prisma.toolRequest.findMany({ where, include, orderBy: { requestDate: 'desc' } });
  }

  async findByUser(usuarioId: number, companyId?: number | null) {
    const where: any = { usuarioId };
    if (companyId != null && Number(companyId) > 0) {
      Object.assign(where, companyWhere(companyId));
    }
    return this.prisma.toolRequest.findMany({
      where,
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

  async findByStatus(status: ToolRequestStatus, companyId?: number | null) {
    const where: any = { status };
    if (companyId != null && Number(companyId) > 0) {
      Object.assign(where, companyWhere(companyId));
    }
    return this.prisma.toolRequest.findMany({
      where,
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

  async findActiveByUser(usuarioId: number, companyId?: number | null) {
    const where: any = {
      usuarioId,
      status: {
        in: ['APPROVED', 'IN_USE'],
      },
    };
    if (companyId != null && Number(companyId) > 0) {
      Object.assign(where, companyWhere(companyId));
    }
    return this.prisma.toolRequest.findMany({
      where,
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

  async findById(id: number, companyId?: number | null) {
    const where =
      companyId != null && Number(companyId) > 0
        ? { id, ...companyWhere(companyId) }
        : { id };
    const row = await this.prisma.toolRequest.findFirst({
      where,
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
    if (companyId != null && Number(companyId) > 0) {
      assertCompanyAccess(row, companyId, 'Solicitud de herramienta');
    }
    return row;
  }

  async update(id: number, data: UpdateToolRequestDto, companyId?: number | null) {
    // Get current tool request to check for status changes
    const where =
      companyId != null && Number(companyId) > 0
        ? { id, ...companyWhere(companyId) }
        : { id };
    const currentToolRequest = await this.prisma.toolRequest.findFirst({
      where,
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
    });
    if (companyId != null && Number(companyId) > 0) {
      assertCompanyAccess(currentToolRequest, companyId, 'Solicitud de herramienta');
    }

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

  async approve(id: number, approvedBy: number, companyId?: number | null) {
    const toolRequest = await this.findById(id, companyId);
    if (!toolRequest) throw new Error('Solicitud no encontrada');

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

  async deliver(id: number, companyId?: number | null) {
    const request = await this.findById(id, companyId);
    if (!request) {
      throw new Error('Solicitud no encontrada');
    }

    return (this.prisma as any).$transaction(async (tx: any) => {
      if (request.inventoryItemId) {
        const inventoryItem = await tx.toolInventoryItem.findFirst({
          where: {
            id: request.inventoryItemId,
            ...(companyId != null && Number(companyId) > 0 ? companyWhere(companyId) : {}),
          },
          select: { status: true },
        });

        if (!inventoryItem || inventoryItem.status !== 'AVAILABLE') {
          throw new Error('La herramienta ya no está disponible para entrega');
        }
      }

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

  async return(
    id: number,
    damageDescription?: string,
    damagePhotoUrl?: string,
    companyId?: number | null,
  ) {
    const status = damageDescription ? 'DAMAGED' : 'RETURNED';
    const request = await this.findById(id, companyId);
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

  async reject(id: number, approvedBy: number, adminNotes: string, companyId?: number | null) {
    await this.findById(id, companyId);
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

  async delete(id: number, companyId?: number | null) {
    await this.findById(id, companyId);
    return this.prisma.toolRequest.delete({
      where: { id },
    });
  }

  async getStatsByUser(usuarioId: number, companyId?: number | null) {
    const scope =
      companyId != null && Number(companyId) > 0 ? companyWhere(companyId) : {};
    const [inUse, pending, returned, damaged] = await Promise.all([
      this.prisma.toolRequest.count({
        where: { usuarioId, status: 'IN_USE', ...scope },
      }),
      this.prisma.toolRequest.count({
        where: { usuarioId, status: 'PENDING', ...scope },
      }),
      this.prisma.toolRequest.count({
        where: { usuarioId, status: 'RETURNED', ...scope },
      }),
      this.prisma.toolRequest.count({
        where: { usuarioId, status: 'DAMAGED', ...scope },
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

  async getInventory(search?: string, includeRetired = false, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const where: any = { ...companyWhere(tenantId) };

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

  async searchInventoryOptions(search: string, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const q = (search || '').trim();
    if (!q) return [];

    return (this.prisma as any).toolInventoryItem.findMany({
      where: mergeCompanyWhere(
        {
          status: 'AVAILABLE',
          OR: [
            { toolName: { contains: q, mode: 'insensitive' } },
            { model: { contains: q, mode: 'insensitive' } },
            { serialNumber: { contains: q, mode: 'insensitive' } },
          ],
        },
        tenantId,
      ),
      select: {
        id: true,
        toolName: true,
        model: true,
        serialNumber: true,
        status: true,
        panoramicPhotoUrl: true,
        serialPhotoUrl: true,
      },
      take: 15,
      orderBy: [{ toolName: 'asc' }, { model: 'asc' }],
    });
  }

  async createInventoryItem(data: CreateInventoryItemDto, currentUserId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    return (this.prisma as any).toolInventoryItem.create({
      data: {
        companyId: tenantId,
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

  async updateInventoryItem(
    id: number,
    data: UpdateInventoryItemDto,
    currentUserId: number,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const existing = await (this.prisma as any).toolInventoryItem.findFirst({
      where: { id, ...companyWhere(tenantId) },
      select: { id: true, companyId: true },
    });
    assertCompanyAccess(existing, tenantId, 'Herramienta de inventario');
    return (this.prisma as any).toolInventoryItem.update({
      where: { id },
      data: {
        ...data,
        updatedById: currentUserId,
      },
    });
  }

  async replaceInventoryItem(
    id: number,
    data: ReplaceInventoryItemDto,
    currentUserId: number,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const current = await (this.prisma as any).toolInventoryItem.findFirst({
      where: { id, ...companyWhere(tenantId) },
    });
    assertCompanyAccess(current, tenantId, 'Herramienta de inventario');

    return (this.prisma as any).$transaction(async (tx: any) => {
      const replacement = await tx.toolInventoryItem.create({
        data: {
          companyId: tenantId,
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

  async getMyKit(userId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    return (this.prisma as any).toolKitAssignment.findMany({
      where: { userId, isActive: true, ...companyWhere(tenantId) },
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

  private async kitVisibilityUserFilter(
    currentUser: { id: number; isSuperAdmin?: boolean; permissions?: string[] },
  ) {
    const isSuperAdmin = await this.isSuperAdminByEmail(currentUser.id, currentUser);
    if (isSuperAdmin) return {};

    const canManage = Boolean(
      currentUser.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN) ||
      currentUser.permissions?.includes(PERMISSIONS.TOOLS_MANAGE),
    );
    if (!canManage) return null;

    const dbUser = await (this.prisma as any).user.findUnique({
      where: { id: currentUser.id },
      select: { roleKey: true },
    });
    const roleKey = String(dbUser?.roleKey || '').toLowerCase();

    if (BROAD_KIT_ASSIGN_SCOPE.has(roleKey)) {
      return {
        roleKey: { in: [...FIELD_KIT_ROLE_KEYS] },
        email: { notIn: this.superAdminEmails },
      };
    }

    return {
      managerId: currentUser.id,
      roleKey: { in: [...FIELD_KIT_ROLE_KEYS] },
      email: { notIn: this.superAdminEmails },
    };
  }

  async getUsersKit(
    currentUser: { id: number; isSuperAdmin?: boolean; permissions?: string[] },
    userId?: number,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const userFilter = await this.kitVisibilityUserFilter(currentUser);
    if (userFilter === null) return [];

    const whereUser: any = { ...userFilter };
    if (userId) {
      whereUser.id = userId;
    }

    const assignments = await (this.prisma as any).toolKitAssignment.findMany({
      where: {
        ...companyWhere(tenantId),
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
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const inventoryItem = await (this.prisma as any).toolInventoryItem.findFirst({
      where: { id: data.inventoryItemId, ...companyWhere(tenantId) },
    });
    assertCompanyAccess(inventoryItem, tenantId, 'Herramienta de inventario');
    if (inventoryItem.status !== 'AVAILABLE') {
      throw new Error('La herramienta seleccionada no está disponible para asignación');
    }

    const activeAssignment = await (this.prisma as any).toolKitAssignment.findFirst({
      where: {
        inventoryItemId: data.inventoryItemId,
        isActive: true,
        ...companyWhere(tenantId),
      },
      select: { id: true },
    });

    if (activeAssignment) {
      throw new Error('La herramienta ya está asignada a otro usuario');
    }

    const isSuperAdmin = await this.isSuperAdminByEmail(currentUser.id, currentUser);
    const canAssign = Boolean(
      isSuperAdmin ||
      currentUser.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN) ||
      currentUser.permissions?.includes(PERMISSIONS.TOOLS_MANAGE),
    );

    if (!canAssign) {
      throw new Error('No tienes permisos para asignar herramientas');
    }

    if (!isSuperAdmin) {
      const target = await (this.prisma as any).user.findUnique({
        where: { id: data.userId },
        select: {
          id: true,
          email: true,
          roleKey: true,
          managerId: true,
        },
      });

      const assigner = await (this.prisma as any).user.findUnique({
        where: { id: currentUser.id },
        select: { roleKey: true },
      });
      const assignerRoleKey = String(assigner?.roleKey || '').toLowerCase();
      const targetRoleKey = String(target?.roleKey || '').toLowerCase();

      const isFieldEngineer = FIELD_KIT_ROLE_KEYS.includes(targetRoleKey as typeof FIELD_KIT_ROLE_KEYS[number]);
      const hasBroadScope = BROAD_KIT_ASSIGN_SCOPE.has(assignerRoleKey);
      const isDirectReport = target?.managerId === currentUser.id;

      if (
        !target ||
        this.superAdminEmails.includes(String(target.email).toLowerCase()) ||
        !isFieldEngineer ||
        (!hasBroadScope && !isDirectReport)
      ) {
        throw new Error('Solo puedes asignar kits a ingenieros de campo bajo tu coordinación');
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
          companyId: tenantId,
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
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const assignment = await (this.prisma as any).toolKitAssignment.findFirst({
      where: { id: assignmentId, ...companyWhere(tenantId) },
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
    assertCompanyAccess(assignment, tenantId, 'Asignación de kit');

    const isSuperAdmin = await this.isSuperAdminByEmail(currentUser.id, currentUser);
    const isAdmin = Boolean(currentUser.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN));
    const isOwner = assignment.userId === currentUser.id;

    if (!isOwner && !isAdmin && !isSuperAdmin) {
      throw new Error('No tienes permisos para reportar este evento');
    }

    if (isAdmin && !isSuperAdmin) {
      const targetEmail = String(assignment.user?.email || '').toLowerCase();
      const isSelfTarget = assignment.userId === currentUser.id;
      if (!isSelfTarget && (assignment.user?.role?.accesoConsoleAdmin || this.superAdminEmails.includes(targetEmail))) {
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
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const isSuperAdmin = await this.isSuperAdminByEmail(currentUser.id, currentUser);
    const isAdmin = Boolean(
      currentUser.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN) ||
      currentUser.permissions?.includes(PERMISSIONS.TOOLS_MANAGE),
    );

    if (!isSuperAdmin && !isAdmin) {
      throw new Error('No tienes permisos para resolver incidentes de kit');
    }

    const event = await (this.prisma as any).toolKitEvent.findFirst({
      where: {
        id: eventId,
        assignment: companyWhere(tenantId),
      },
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
                companyId: true,
              },
            },
          },
        },
      },
    });
    assertCompanyAccess(event?.assignment, tenantId, 'Incidente de kit');

    if (event.resolution !== 'PENDING') {
      throw new Error('Este incidente ya fue resuelto');
    }

    if (!isSuperAdmin) {
      const targetEmail = String(event.assignment.user?.email || '').toLowerCase();
      const isSelfTarget = event.assignment.user?.id === currentUser.id;
      if (
        !isSelfTarget &&
        (event.assignment.user?.role?.accesoConsoleAdmin || this.superAdminEmails.includes(targetEmail))
      ) {
        throw new Error('Como admin solo puedes gestionar kits de usuarios normales');
      }
    }

    return (this.prisma as any).$transaction(async (tx: any) => {
      let replacementItemId = data.replacementItemId;

      if (!replacementItemId && data.resolution === 'EQUIPMENT_FAILURE') {
        const autoReplacement = await tx.toolInventoryItem.findFirst({
          where: {
            ...companyWhere(tenantId),
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
            companyId: tenantId,
          },
        });
        fineId = fine.id;
      }

      if (replacementItemId) {
        const replacement = await tx.toolInventoryItem.findFirst({
          where: { id: replacementItemId, ...companyWhere(tenantId) },
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
            companyId: tenantId,
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
  async requestRenewal(data: CreateRenewalDto, usuarioId: number, companyId?: number | null) {
    // Verificar que la herramienta pertenece al usuario
    const toolRequest = await this.findById(data.toolRequestId, companyId);

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
        companyId: requireCompanyId(companyId ?? toolRequest.companyId),
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
    currentUser?: { id: number; isSuperAdmin?: boolean; permissions?: string[]; departmentId?: number },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const where: any = { ...companyWhere(tenantId) };
    if (toolRequestId) where.toolRequestId = toolRequestId;
    if (status) where.status = status;

    // Si se proporciona usuario, filtrar por jerarquía
    if (currentUser) {
      const isSuperAdmin = currentUser.isSuperAdmin === true;
      const isConsoleAdmin = currentUser.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN);

      if (!isSuperAdmin && isConsoleAdmin) {
        where.toolRequest = {
          usuario: {
            departmentId: currentUser.departmentId,
          },
        };
      } else if (!isSuperAdmin && !isConsoleAdmin) {
        return [];
      }
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
    approver: { id: number; isSuperAdmin?: boolean; permissions?: string[]; departmentId?: number },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const renewal = await this.prisma.toolRenewal.findFirst({
      where: { id: renewalId, ...companyWhere(tenantId) },
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
    assertCompanyAccess(renewal, tenantId, 'Renovación');

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
    reason: string,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const renewal = await this.prisma.toolRenewal.findFirst({
      where: { id: renewalId, ...companyWhere(tenantId) },
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
    assertCompanyAccess(renewal, tenantId, 'Renovación');

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
