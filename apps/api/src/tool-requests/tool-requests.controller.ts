import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import {
  ToolRequestsService,
  CreateToolRequestDto,
  UpdateToolRequestDto,
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
  ReplaceInventoryItemDto,
  AssignKitItemDto,
  ReportKitEventDto,
  ResolveKitEventDto,
} from './tool-requests.service.js';

interface MulterFile {
  filename: string;
}

@Controller('tool-requests')
@UseGuards(RbacGuard)
export class ToolRequestsController {
  constructor(private readonly toolRequestsService: ToolRequestsService) {}

  // ===== INVENTARIO INTELIGENTE =====

  @Get('inventory/search')
  @RBAC({ anyPermissions: [PERMISSIONS.TOOLS_REQUEST, PERMISSIONS.TOOLS_MANAGE] })
  async searchInventory(@Query('q') q: string, @CurrentCompanyId() companyId: number | null) {
    return this.toolRequestsService.searchInventoryOptions(q || '', companyId);
  }

  @Get('inventory')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async getInventory(
    @Query('q') q?: string,
    @Query('includeRetired') includeRetired?: string,
    @CurrentCompanyId() companyId?: number | null,
  ) {
    return this.toolRequestsService.getInventory(q, includeRetired === 'true', companyId);
  }

  @Post('inventory')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'panoramicPhoto', maxCount: 1 },
      { name: 'serialPhoto', maxCount: 1 },
    ], { dest: 'uploads/tools' }),
  )
  async createInventoryItem(
    @CurrentUser() user: any,
    @Body() data: Partial<CreateInventoryItemDto>,
    @UploadedFiles() files?: { panoramicPhoto?: MulterFile[]; serialPhoto?: MulterFile[] },
    @CurrentCompanyId() companyId?: number | null,
  ) {
    const panoramicPhotoUrl = files?.panoramicPhoto?.[0]?.filename
      ? `/uploads/tools/${files.panoramicPhoto[0].filename}`
      : data.panoramicPhotoUrl;
    const serialPhotoUrl = files?.serialPhoto?.[0]?.filename
      ? `/uploads/tools/${files.serialPhoto[0].filename}`
      : data.serialPhotoUrl;

    if (!panoramicPhotoUrl || !serialPhotoUrl) {
      throw new ForbiddenException('Las fotos panorámica y de serie son obligatorias');
    }

    return this.toolRequestsService.createInventoryItem(
      {
        toolName: String(data.toolName || ''),
        model: String(data.model || ''),
        serialNumber: String(data.serialNumber || ''),
        panoramicPhotoUrl,
        serialPhotoUrl,
      },
      user.id,
      companyId,
    );
  }

  @Put('inventory/:id')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'panoramicPhoto', maxCount: 1 },
      { name: 'serialPhoto', maxCount: 1 },
    ], { dest: 'uploads/tools' }),
  )
  async updateInventoryItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() data: UpdateInventoryItemDto,
    @UploadedFiles() files?: { panoramicPhoto?: MulterFile[]; serialPhoto?: MulterFile[] },
    @CurrentCompanyId() companyId?: number | null,
  ) {
    const patch: UpdateInventoryItemDto = {
      ...data,
      panoramicPhotoUrl: files?.panoramicPhoto?.[0]?.filename
        ? `/uploads/tools/${files.panoramicPhoto[0].filename}`
        : data.panoramicPhotoUrl,
      serialPhotoUrl: files?.serialPhoto?.[0]?.filename
        ? `/uploads/tools/${files.serialPhoto[0].filename}`
        : data.serialPhotoUrl,
    };

    return this.toolRequestsService.updateInventoryItem(parseInt(id, 10), patch, user.id, companyId);
  }

  @Post('inventory/:id/replace')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'panoramicPhoto', maxCount: 1 },
      { name: 'serialPhoto', maxCount: 1 },
    ], { dest: 'uploads/tools' }),
  )
  async replaceInventoryItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() data: Partial<ReplaceInventoryItemDto>,
    @UploadedFiles() files?: { panoramicPhoto?: MulterFile[]; serialPhoto?: MulterFile[] },
    @CurrentCompanyId() companyId?: number | null,
  ) {
    const panoramicPhotoUrl = files?.panoramicPhoto?.[0]?.filename
      ? `/uploads/tools/${files.panoramicPhoto[0].filename}`
      : data.panoramicPhotoUrl;
    const serialPhotoUrl = files?.serialPhoto?.[0]?.filename
      ? `/uploads/tools/${files.serialPhoto[0].filename}`
      : data.serialPhotoUrl;

    if (!panoramicPhotoUrl || !serialPhotoUrl) {
      throw new ForbiddenException('Las fotos panorámica y de serie del reemplazo son obligatorias');
    }

    return this.toolRequestsService.replaceInventoryItem(
      parseInt(id, 10),
      {
        toolName: String(data.toolName || ''),
        model: String(data.model || ''),
        serialNumber: String(data.serialNumber || ''),
        panoramicPhotoUrl,
        serialPhotoUrl,
        retiredReason: data.retiredReason,
      },
      user.id,
      companyId,
    );
  }

  // ===== KIT / QUID =====

  @Get('kits/my')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_VIEW] })
  async getMyKit(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.toolRequestsService.getMyKit(user.id, companyId);
  }

  @Get('kits/users')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async getUsersKit(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('userId') userId?: string,
  ) {
    return this.toolRequestsService.getUsersKit(
      {
        id: user.id,
        isSuperAdmin: user.isSuperAdmin,
        permissions: user.permissions,
      },
      userId ? parseInt(userId, 10) : undefined,
      companyId,
    );
  }

  @Post('kits/assign')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async assignKitItem(
    @CurrentUser() user: any,
    @Body() data: AssignKitItemDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.toolRequestsService.assignKitItem(
      {
        ...data,
        dueReturnDate: data.dueReturnDate ? new Date(data.dueReturnDate) : undefined,
      },
      {
        id: user.id,
        isSuperAdmin: user.isSuperAdmin,
        permissions: user.permissions,
      },
      companyId,
    );
  }

  @Post('kits/:assignmentId/report')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_VIEW] })
  async reportKitEvent(
    @CurrentUser() user: any,
    @Param('assignmentId') assignmentId: string,
    @Body() data: ReportKitEventDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.toolRequestsService.reportKitEvent(
      parseInt(assignmentId, 10),
      data,
      {
        id: user.id,
        isSuperAdmin: user.isSuperAdmin,
        permissions: user.permissions,
      },
      companyId,
    );
  }

  @Post('kits/events/:eventId/resolve')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async resolveKitEvent(
    @CurrentUser() user: any,
    @Param('eventId') eventId: string,
    @Body() data: ResolveKitEventDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.toolRequestsService.resolveKitEvent(
      parseInt(eventId, 10),
      data,
      {
        id: user.id,
        isSuperAdmin: user.isSuperAdmin,
        permissions: user.permissions,
      },
      companyId,
    );
  }

  // Crear solicitud de herramienta
  @Post()
  @RBAC({ permissions: [PERMISSIONS.TOOLS_REQUEST] })
  async create(
    @CurrentUser() user: any,
    @Body() data: CreateToolRequestDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    // El usuario solo puede crear solicitudes para sí mismo
    if (data.usuarioId !== user.id) {
      throw new UnauthorizedException('No puedes crear solicitudes para otros usuarios');
    }
    return this.toolRequestsService.create(data, companyId);
  }

  // Obtener todas las solicitudes (admin/superadmin)
  @Get()
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async findAll(
    @CurrentUser() user: any,
    @Query() query: PaginationQueryDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.toolRequestsService.findAll(user, query, companyId);
  }

  // Obtener solicitudes del usuario actual
  @Get('my-requests')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_VIEW] })
  async getMyRequests(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.toolRequestsService.findByUser(user.id, companyId);
  }

  // Obtener solicitudes por usuario (admin)
  @Get('user/:id')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async findByUser(@Param('id') id: string, @CurrentCompanyId() companyId: number | null) {
    return this.toolRequestsService.findByUser(parseInt(id, 10), companyId);
  }

  // Obtener solicitudes por estado
  @Get('status/:status')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async findByStatus(@Param('status') status: string, @CurrentCompanyId() companyId: number | null) {
    return this.toolRequestsService.findByStatus(status as any, companyId);
  }

  // Obtener herramientas activas del usuario
  @Get('my-active')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_VIEW] })
  async getMyActive(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.toolRequestsService.findActiveByUser(user.id, companyId);
  }

  // Obtener estadísticas del usuario
  @Get('my-stats')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_VIEW] })
  async getMyStats(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.toolRequestsService.getStatsByUser(user.id, companyId);
  }

  // Obtener estadísticas por usuario (admin)
  @Get('stats/:id')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async getUserStats(@Param('id') id: string, @CurrentCompanyId() companyId: number | null) {
    return this.toolRequestsService.getStatsByUser(parseInt(id, 10), companyId);
  }

  // Obtener solicitud por ID
  @Get(':id')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_VIEW] })
  async findById(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const request = await this.toolRequestsService.findById(parseInt(id, 10), companyId);
    
    if (!request) {
      throw new ForbiddenException('Solicitud no encontrada');
    }
    
    // Usuario solo puede ver sus propias solicitudes, manager puede ver todas
    const isAdmin = user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN) || user.permissions?.includes(PERMISSIONS.TOOLS_MANAGE);
    if (!isAdmin && request.usuarioId !== user.id) {
      throw new UnauthorizedException('No tienes permiso para ver esta solicitud');
    }
    
    return request;
  }

  // Actualizar solicitud
  @Put(':id')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async update(
    @Param('id') id: string,
    @Body() data: UpdateToolRequestDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.toolRequestsService.update(parseInt(id, 10), data, companyId);
  }

  // Aprobar solicitud
  @Post(':id/approve')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async approve(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.toolRequestsService.approve(parseInt(id, 10), user.id, companyId);
  }

  // Entregar herramienta
  @Post(':id/deliver')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async deliver(@Param('id') id: string, @CurrentCompanyId() companyId: number | null) {
    return this.toolRequestsService.deliver(parseInt(id, 10), companyId);
  }

  // Devolver herramienta
  @Post(':id/return')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async return(
    @Param('id') id: string,
    @Body() data: { damageDescription?: string; damagePhotoUrl?: string },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.toolRequestsService.return(
      parseInt(id, 10),
      data.damageDescription,
      data.damagePhotoUrl,
      companyId,
    );
  }

  // Rechazar solicitud
  @Post(':id/reject')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async reject(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() data: { adminNotes: string },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.toolRequestsService.reject(parseInt(id, 10), user.id, data.adminNotes, companyId);
  }

  // Eliminar solicitud
  @Delete(':id')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async delete(@Param('id') id: string, @CurrentCompanyId() companyId: number | null) {
    return this.toolRequestsService.delete(parseInt(id, 10), companyId);
  }

  // ===== RENOVACIONES =====

  // Solicitar renovación de herramienta
  @Post(':id/renewal-request')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_VIEW] })
  async requestRenewal(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() data: { newReturnDate: Date; renewalReason?: string },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.toolRequestsService.requestRenewal(
      {
        toolRequestId: parseInt(id, 10),
        newReturnDate: new Date(data.newReturnDate),
        renewalReason: data.renewalReason,
      },
      user.id,
      companyId,
    );
  }

  // Obtener renovaciones pendientes (admin)
  @Get('renewals/pending')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async getPendingRenewals(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.toolRequestsService.findRenewals(undefined, 'PENDING', {
      id: user.id,
      isSuperAdmin: user.isSuperAdmin,
      permissions: user.permissions,
      departmentId: user.departmentId,
    }, companyId);
  }

  // Obtener renovaciones de una herramienta
  @Get('renewals/by-tool/:toolId')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async getRenewalsByTool(
    @CurrentUser() user: any,
    @Param('toolId') toolId: string,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.toolRequestsService.findRenewals(parseInt(toolId, 10), undefined, {
      id: user.id,
      isSuperAdmin: user.isSuperAdmin,
      permissions: user.permissions,
      departmentId: user.departmentId,
    }, companyId);
  }

  // Aprobar renovación
  @Post('renewals/:renewalId/approve')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async approveRenewal(
    @CurrentUser() user: any,
    @Param('renewalId') renewalId: string,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.toolRequestsService.approveRenewal(
      parseInt(renewalId, 10),
      {
        id: user.id,
        isSuperAdmin: user.isSuperAdmin,
        permissions: user.permissions,
        departmentId: user.departmentId,
      },
      companyId,
    );
  }

  // Rechazar renovación
  @Post('renewals/:renewalId/reject')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async rejectRenewal(
    @CurrentUser() user: any,
    @Param('renewalId') renewalId: string,
    @Body() data: { reason: string },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.toolRequestsService.rejectRenewal(
      parseInt(renewalId, 10),
      {
        id: user.id,
        isSuperAdmin: user.isSuperAdmin,
        permissions: user.permissions,
        departmentId: user.departmentId,
      },
      data.reason,
      companyId,
    );
  }

  // ===== NOTIFICACIONES =====

  // Obtener notificaciones del usuario
  @Get('notifications/my')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_VIEW] })
  async getMyNotifications(@CurrentUser() user: any) {
    return this.toolRequestsService.getUserNotifications(user.id);
  }

  // Marcar notificación como leída
  @Put('notifications/:notificationId/read')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_VIEW] })
  async markNotificationAsRead(@Param('notificationId') notificationId: string) {
    return this.toolRequestsService.markNotificationAsRead(parseInt(notificationId, 10));
  }

  // Verificar herramientas próximas a vencer (cron job endpoint)
  @Post('check-expiring')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async checkExpiringTools() {
    const count = await this.toolRequestsService.checkExpiringTools();
    return {
      message: `Se verificaron herramientas próximas a vencer`,
      notificationsCreated: count,
    };
  }}