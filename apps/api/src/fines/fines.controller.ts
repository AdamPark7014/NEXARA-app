import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { FinesService, CreateFineDto, UpdateFineDto } from './fines.service';
import { PERMISSIONS } from '../common/permissions.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';

@Controller('fines')
@UseGuards(RbacGuard)
export class FinesController {
  constructor(private readonly finesService: FinesService) {}

  /** v2 OPS managers have ACTIVITIES_MANAGE; legacy admins have CONSOLE_ADMIN. */
  private isOpsManager(user: any): boolean {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    return (
      Boolean(user.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN)) ||
      Boolean(user.permissions?.includes(PERMISSIONS.ACTIVITIES_MANAGE))
    );
  }

  @Post()
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.ACTIVITIES_MANAGE] })
  async create(@Body() data: CreateFineDto, @CurrentUser() user: any) {
    if (!this.isOpsManager(user)) {
      throw new ForbiddenException('No autorizado para crear multas');
    }
    return this.finesService.create(data);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  async findAll(@CurrentUser() user: any, @Query() query: PaginationQueryDto) {
    if (!this.isOpsManager(user)) {
      return this.finesService.findByUser(user?.id || 0);
    }
    return this.finesService.findAll(user, query);
  }

  @Get('user/:usuarioId')
  @UseGuards(AuthGuard('jwt'))
  async findByUser(
    @Param('usuarioId') usuarioId: string,
    @CurrentUser() user: any,
  ) {
    const id = parseInt(usuarioId, 10);
    if (id !== user?.id && !this.isOpsManager(user)) {
      throw new ForbiddenException('No autorizado');
    }
    return this.finesService.findByUser(id);
  }

  @Get('user/:usuarioId/type/:tipo')
  @UseGuards(AuthGuard('jwt'))
  async findByUserAndType(
    @Param('usuarioId') usuarioId: string,
    @Param('tipo') tipo: string,
    @CurrentUser() user: any,
  ) {
    const id = parseInt(usuarioId, 10);
    if (id !== user?.id && !this.isOpsManager(user)) {
      throw new ForbiddenException('No autorizado');
    }
    return this.finesService.findByUserAndType(id, tipo);
  }

  @Get('type/:tipo')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.ACTIVITIES_MANAGE] })
  async findByType(
    @Param('tipo') tipo: string,
    @CurrentUser() user: any,
  ) {
    if (!this.isOpsManager(user)) {
      throw new ForbiddenException('No autorizado');
    }
    return this.finesService.findByType(tipo);
  }

  @Get('stats/user/:usuarioId')
  @UseGuards(AuthGuard('jwt'))
  async getStats(
    @Param('usuarioId') usuarioId: string,
    @CurrentUser() user: any,
  ) {
    const id = parseInt(usuarioId, 10);
    if (id !== user?.id && !this.isOpsManager(user)) {
      throw new ForbiddenException('No autorizado');
    }

    const types = ['actividad', 'vehiculo', 'asistencia', 'herramienta'];
    const stats: Record<string, { count: number; total: number }> = {};
    for (const type of types) {
      const count = await this.finesService.getCountByUser(id, type);
      const total = await this.finesService.getTotalByUser(id, type);
      stats[type] = { count, total };
    }
    return stats;
  }

  @Patch(':id')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.ACTIVITIES_MANAGE] })
  async update(
    @Param('id') id: string,
    @Body() data: UpdateFineDto,
    @CurrentUser() user: any,
  ) {
    if (!this.isOpsManager(user)) {
      throw new ForbiddenException('No autorizado');
    }
    return this.finesService.update(parseInt(id, 10), data);
  }

  @Delete(':id')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.ACTIVITIES_MANAGE] })
  async delete(@Param('id') id: string, @CurrentUser() user: any) {
    if (!this.isOpsManager(user)) {
      throw new ForbiddenException('No autorizado');
    }
    return this.finesService.delete(parseInt(id, 10));
  }
}
