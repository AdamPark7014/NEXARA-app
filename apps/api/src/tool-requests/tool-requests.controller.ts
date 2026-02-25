import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';
import { ToolRequestsService, CreateToolRequestDto, UpdateToolRequestDto } from './tool-requests.service.js';

@Controller('tool-requests')
@UseGuards(RbacGuard)
export class ToolRequestsController {
  constructor(private readonly toolRequestsService: ToolRequestsService) {}

  // Crear solicitud de herramienta
  @Post()
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  async create(@CurrentUser() user: any, @Body() data: CreateToolRequestDto) {
    // El usuario solo puede crear solicitudes para sí mismo
    if (data.usuarioId !== user.id) {
      throw new UnauthorizedException('No puedes crear solicitudes para otros usuarios');
    }
    return this.toolRequestsService.create(data);
  }

  // Obtener todas las solicitudes (admin/superadmin)
  @Get()
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  async findAll() {
    return this.toolRequestsService.findAll();
  }

  // Obtener solicitudes del usuario actual
  @Get('my-requests')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  async getMyRequests(@CurrentUser() user: any) {
    return this.toolRequestsService.findByUser(user.id);
  }

  // Obtener solicitudes por usuario (admin)
  @Get('user/:id')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  async findByUser(@Param('id') id: string) {
    return this.toolRequestsService.findByUser(parseInt(id, 10));
  }

  // Obtener solicitudes por estado
  @Get('status/:status')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  async findByStatus(@Param('status') status: string) {
    return this.toolRequestsService.findByStatus(status as any);
  }

  // Obtener herramientas activas del usuario
  @Get('my-active')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  async getMyActive(@CurrentUser() user: any) {
    return this.toolRequestsService.findActiveByUser(user.id);
  }

  // Obtener estadísticas del usuario
  @Get('my-stats')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
  async getMyStats(@CurrentUser() user: any) {
    return this.toolRequestsService.getStatsByUser(user.id);
  }

  // Obtener estadísticas por usuario (admin)
  @Get('stats/:id')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  async getUserStats(@Param('id') id: string) {
    return this.toolRequestsService.getStatsByUser(parseInt(id, 10));
  }

  // Obtener solicitud por ID
  @Get(':id')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ACCESS] })
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
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  async update(@Param('id') id: string, @Body() data: UpdateToolRequestDto) {
    return this.toolRequestsService.update(parseInt(id, 10), data);
  }

  // Aprobar solicitud
  @Post(':id/approve')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  async approve(@CurrentUser() user: any, @Param('id') id: string) {
    return this.toolRequestsService.approve(parseInt(id, 10), user.id);
  }

  // Entregar herramienta
  @Post(':id/deliver')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  async deliver(@Param('id') id: string) {
    return this.toolRequestsService.deliver(parseInt(id, 10));
  }

  // Devolver herramienta
  @Post(':id/return')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
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
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  async reject(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() data: { adminNotes: string }
  ) {
    return this.toolRequestsService.reject(parseInt(id, 10), user.id, data.adminNotes);
  }

  // Eliminar solicitud
  @Delete(':id')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  async delete(@Param('id') id: string) {
    return this.toolRequestsService.delete(parseInt(id, 10));
  }
}
