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
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';
import {
  ToolRequestsService,
  CreateToolRequestDto,
  UpdateToolRequestDto,
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
  ReplaceInventoryItemDto,
  AssignKitItemDto,
  ReportKitEventDto,
} from './tool-requests.service.js';

@Controller('tool-requests')
@UseGuards(RbacGuard)
export class ToolRequestsController {
  constructor(private readonly toolRequestsService: ToolRequestsService) {}

  // ===== INVENTARIO INTELIGENTE =====

  @Get('inventory/search')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_REQUEST] })
  async searchInventory(@Query('q') q: string) {
    return this.toolRequestsService.searchInventoryOptions(q || '');
  }

  @Get('inventory')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async getInventory(
    @Query('q') q?: string,
    @Query('includeRetired') includeRetired?: string,
  ) {
    return this.toolRequestsService.getInventory(q, includeRetired === 'true');
  }

  @Post('inventory')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async createInventoryItem(@CurrentUser() user: any, @Body() data: CreateInventoryItemDto) {
    return this.toolRequestsService.createInventoryItem(data, user.id);
  }

  @Put('inventory/:id')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async updateInventoryItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() data: UpdateInventoryItemDto,
  ) {
    return this.toolRequestsService.updateInventoryItem(parseInt(id, 10), data, user.id);
  }

  @Post('inventory/:id/replace')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async replaceInventoryItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() data: ReplaceInventoryItemDto,
  ) {
    return this.toolRequestsService.replaceInventoryItem(parseInt(id, 10), data, user.id);
  }

  // ===== KIT / QUID =====

  @Get('kits/my')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_VIEW] })
  async getMyKit(@CurrentUser() user: any) {
    return this.toolRequestsService.getMyKit(user.id);
  }

  @Get('kits/users')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async getUsersKit(@CurrentUser() user: any, @Query('userId') userId?: string) {
    return this.toolRequestsService.getUsersKit(
      {
        id: user.id,
        isSuperAdmin: user.isSuperAdmin,
        permissions: user.permissions,
      },
      userId ? parseInt(userId, 10) : undefined,
    );
  }

  @Post('kits/assign')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async assignKitItem(@CurrentUser() user: any, @Body() data: AssignKitItemDto) {
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
    );
  }

  @Post('kits/:assignmentId/report')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_VIEW] })
  async reportKitEvent(
    @CurrentUser() user: any,
    @Param('assignmentId') assignmentId: string,
    @Body() data: ReportKitEventDto,
  ) {
    return this.toolRequestsService.reportKitEvent(
      parseInt(assignmentId, 10),
      data,
      {
        id: user.id,
        isSuperAdmin: user.isSuperAdmin,
        permissions: user.permissions,
      },
    );
  }

  // Crear solicitud de herramienta
  @Post()
  @RBAC({ permissions: [PERMISSIONS.TOOLS_REQUEST] })
  async create(@CurrentUser() user: any, @Body() data: CreateToolRequestDto) {
    // El usuario solo puede crear solicitudes para sí mismo
    if (data.usuarioId !== user.id) {
      throw new UnauthorizedException('No puedes crear solicitudes para otros usuarios');
    }
    return this.toolRequestsService.create(data);
  }

  // Obtener todas las solicitudes (admin/superadmin)
  @Get()
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async findAll(@CurrentUser() user: any) {
    return this.toolRequestsService.findAll(user);
  }

  // Obtener solicitudes del usuario actual
  @Get('my-requests')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_VIEW] })
  async getMyRequests(@CurrentUser() user: any) {
    return this.toolRequestsService.findByUser(user.id);
  }

  // Obtener solicitudes por usuario (admin)
  @Get('user/:id')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async findByUser(@Param('id') id: string) {
    return this.toolRequestsService.findByUser(parseInt(id, 10));
  }

  // Obtener solicitudes por estado
  @Get('status/:status')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async findByStatus(@Param('status') status: string) {
    return this.toolRequestsService.findByStatus(status as any);
  }

  // Obtener herramientas activas del usuario
  @Get('my-active')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_VIEW] })
  async getMyActive(@CurrentUser() user: any) {
    return this.toolRequestsService.findActiveByUser(user.id);
  }

  // Obtener estadísticas del usuario
  @Get('my-stats')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_VIEW] })
  async getMyStats(@CurrentUser() user: any) {
    return this.toolRequestsService.getStatsByUser(user.id);
  }

  // Obtener estadísticas por usuario (admin)
  @Get('stats/:id')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async getUserStats(@Param('id') id: string) {
    return this.toolRequestsService.getStatsByUser(parseInt(id, 10));
  }

  // Obtener solicitud por ID
  @Get(':id')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_VIEW] })
  async findById(@CurrentUser() user: any, @Param('id') id: string) {
    const request = await this.toolRequestsService.findById(parseInt(id, 10));
    
    if (!request) {
      throw new ForbiddenException('Solicitud no encontrada');
    }
    
    // Usuario solo puede ver sus propias solicitudes, admin puede ver todas
    const isAdmin = user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN);
    if (!isAdmin && request.usuarioId !== user.id) {
      throw new UnauthorizedException('No tienes permiso para ver esta solicitud');
    }
    
    return request;
  }

  // Actualizar solicitud
  @Put(':id')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async update(@Param('id') id: string, @Body() data: UpdateToolRequestDto) {
    return this.toolRequestsService.update(parseInt(id, 10), data);
  }

  // Aprobar solicitud
  @Post(':id/approve')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async approve(@CurrentUser() user: any, @Param('id') id: string) {
    return this.toolRequestsService.approve(parseInt(id, 10), user.id);
  }

  // Entregar herramienta
  @Post(':id/deliver')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async deliver(@Param('id') id: string) {
    return this.toolRequestsService.deliver(parseInt(id, 10));
  }

  // Devolver herramienta
  @Post(':id/return')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async return(
    @Param('id') id: string,
    @Body() data: { damageDescription?: string; damagePhotoUrl?: string }
  ) {
    return this.toolRequestsService.return(
      parseInt(id, 10),
      data.damageDescription,
      data.damagePhotoUrl
    );
  }

  // Rechazar solicitud
  @Post(':id/reject')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async reject(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() data: { adminNotes: string }
  ) {
    return this.toolRequestsService.reject(parseInt(id, 10), user.id, data.adminNotes);
  }

  // Eliminar solicitud
  @Delete(':id')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async delete(@Param('id') id: string) {
    return this.toolRequestsService.delete(parseInt(id, 10));
  }

  // ===== RENOVACIONES =====

  // Solicitar renovación de herramienta
  @Post(':id/renewal-request')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_VIEW] })
  async requestRenewal(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() data: { newReturnDate: Date; renewalReason?: string }
  ) {
    return this.toolRequestsService.requestRenewal(
      {
        toolRequestId: parseInt(id, 10),
        newReturnDate: new Date(data.newReturnDate),
        renewalReason: data.renewalReason,
      },
      user.id
    );
  }

  // Obtener renovaciones pendientes (admin)
  @Get('renewals/pending')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async getPendingRenewals(@CurrentUser() user: any) {
    return this.toolRequestsService.findRenewals(undefined, 'PENDING', {
      id: user.id,
      isSuperAdmin: user.isSuperAdmin,
      permissions: user.permissions,
      departmentId: user.departmentId,
    });
  }

  // Obtener renovaciones de una herramienta
  @Get('renewals/by-tool/:toolId')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async getRenewalsByTool(@CurrentUser() user: any, @Param('toolId') toolId: string) {
    return this.toolRequestsService.findRenewals(parseInt(toolId, 10), undefined, {
      id: user.id,
      isSuperAdmin: user.isSuperAdmin,
      permissions: user.permissions,
      departmentId: user.departmentId,
    });
  }

  // Aprobar renovación
  // Aprobar renovación
  @Post('renewals/:renewalId/approve')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async approveRenewal(
    @CurrentUser() user: any,
    @Param('renewalId') renewalId: string
  ) {
    return this.toolRequestsService.approveRenewal(parseInt(renewalId, 10), {
      id: user.id,
      isSuperAdmin: user.isSuperAdmin,
      permissions: user.permissions,
      departmentId: user.departmentId,
    });
  }

  // Rechazar renovación
  @Post('renewals/:renewalId/reject')
  @RBAC({ permissions: [PERMISSIONS.TOOLS_MANAGE] })
  async rejectRenewal(
    @CurrentUser() user: any,
    @Param('renewalId') renewalId: string,
    @Body() data: { reason: string }
  ) {
    return this.toolRequestsService.rejectRenewal(
      parseInt(renewalId, 10),
      {
        id: user.id,
        isSuperAdmin: user.isSuperAdmin,
        permissions: user.permissions,
        departmentId: user.departmentId,
      },
      data.reason
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