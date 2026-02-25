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
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermissions } from '../auth/permissions.decorator.js';
import { ToolRequestsService, CreateToolRequestDto, UpdateToolRequestDto } from './tool-requests.service.js';

@Controller('tool-requests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ToolRequestsController {
  constructor(private readonly toolRequestsService: ToolRequestsService) {}

  // Crear solicitud de herramienta
  @Post()
  @RequirePermissions('console.access')
  async create(@Request() req, @Body() data: CreateToolRequestDto) {
    // El usuario solo puede crear solicitudes para sí mismo
    if (data.usuarioId !== req.user.id) {
      throw new UnauthorizedException('No puedes crear solicitudes para otros usuarios');
    }
    return this.toolRequestsService.create(data);
  }

  // Obtener todas las solicitudes (admin/superadmin)
  @Get()
  @RequirePermissions('console.admin')
  async findAll() {
    return this.toolRequestsService.findAll();
  }

  // Obtener solicitudes del usuario actual
  @Get('my-requests')
  @RequirePermissions('console.access')
  async getMyRequests(@Request() req) {
    return this.toolRequestsService.findByUser(req.user.id);
  }

  // Obtener solicitudes por usuario (admin)
  @Get('user/:id')
  @RequirePermissions('console.admin')
  async findByUser(@Param('id') id: string) {
    return this.toolRequestsService.findByUser(parseInt(id, 10));
  }

  // Obtener solicitudes por estado
  @Get('status/:status')
  @RequirePermissions('console.admin')
  async findByStatus(@Param('status') status: string) {
    return this.toolRequestsService.findByStatus(status as any);
  }

  // Obtener herramientas activas del usuario
  @Get('my-active')
  @RequirePermissions('console.access')
  async getMyActive(@Request() req) {
    return this.toolRequestsService.findActiveByUser(req.user.id);
  }

  // Obtener estadísticas del usuario
  @Get('my-stats')
  @RequirePermissions('console.access')
  async getMyStats(@Request() req) {
    return this.toolRequestsService.getStatsByUser(req.user.id);
  }

  // Obtener estadísticas por usuario (admin)
  @Get('stats/:id')
  @RequirePermissions('console.admin')
  async getUserStats(@Param('id') id: string) {
    return this.toolRequestsService.getStatsByUser(parseInt(id, 10));
  }

  // Obtener solicitud por ID
  @Get(':id')
  @RequirePermissions('console.access')
  async findById(@Request() req, @Param('id') id: string) {
    const request = await this.toolRequestsService.findById(parseInt(id, 10));
    
    // Usuario solo puede ver sus propias solicitudes, admin puede ver todas
    const isAdmin = req.user.permissions?.includes('console.admin');
    if (!isAdmin && request.usuarioId !== req.user.id) {
      throw new UnauthorizedException('No tienes permiso para ver esta solicitud');
    }
    
    return request;
  }

  // Actualizar solicitud
  @Put(':id')
  @RequirePermissions('console.admin')
  async update(@Param('id') id: string, @Body() data: UpdateToolRequestDto) {
    return this.toolRequestsService.update(parseInt(id, 10), data);
  }

  // Aprobar solicitud
  @Post(':id/approve')
  @RequirePermissions('console.admin')
  async approve(@Request() req, @Param('id') id: string) {
    return this.toolRequestsService.approve(parseInt(id, 10), req.user.id);
  }

  // Entregar herramienta
  @Post(':id/deliver')
  @RequirePermissions('console.admin')
  async deliver(@Param('id') id: string) {
    return this.toolRequestsService.deliver(parseInt(id, 10));
  }

  // Devolver herramienta
  @Post(':id/return')
  @RequirePermissions('console.admin')
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
  @RequirePermissions('console.admin')
  async reject(
    @Request() req,
    @Param('id') id: string,
    @Body() data: { adminNotes: string }
  ) {
    return this.toolRequestsService.reject(parseInt(id, 10), req.user.id, data.adminNotes);
  }

  // Eliminar solicitud
  @Delete(':id')
  @RequirePermissions('console.admin')
  async delete(@Param('id') id: string) {
    return this.toolRequestsService.delete(parseInt(id, 10));
  }
}
