import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { FinesService, CreateFineDto, UpdateFineDto } from './fines.service';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('fines')
@UseGuards(RbacGuard)
export class FinesController {
  constructor(private readonly finesService: FinesService) {}

  @Post()
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  async create(@Body() data: CreateFineDto, @CurrentUser() user: any) {
    if (!user?.isSuperAdmin && !user?.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN)) {
      throw new ForbiddenException('No autorizado para crear multas');
    }
    return this.finesService.create(data);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  async findAll(@CurrentUser() user: any) {
    // Solo admins ven todas las multas
    if (
      !user?.isSuperAdmin &&
      !user?.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN)
    ) {
      return this.finesService.findByUser(user?.id || 0);
    }
    return this.finesService.findAll();
  }

  @Get('user/:usuarioId')
  @UseGuards(AuthGuard('jwt'))
  async findByUser(
    @Param('usuarioId') usuarioId: string,
    @CurrentUser() user: any,
  ) {
    const id = parseInt(usuarioId, 10);
    // Solo pueden ver sus propias multas o admins pueden ver las de otros
    if (
      id !== user?.id &&
      !user?.isSuperAdmin &&
      !user?.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN)
    ) {
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
    if (
      id !== user?.id &&
      !user?.isSuperAdmin &&
      !user?.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN)
    ) {
      throw new ForbiddenException('No autorizado');
    }
    return this.finesService.findByUserAndType(id, tipo);
  }

  @Get('type/:tipo')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  async findByType(
    @Param('tipo') tipo: string,
    @CurrentUser() user: any,
  ) {
    if (
      !user?.isSuperAdmin &&
      !user?.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN)
    ) {
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
    if (
      id !== user?.id &&
      !user?.isSuperAdmin &&
      !user?.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN)
    ) {
      throw new ForbiddenException('No autorizado');
    }

    const types = ['actividad', 'vehiculo', 'asistencia', 'herramienta'];
    const stats: Record<
      string,
      {
        count: number;
        total: number;
      }
    > = {};

    for (const type of types) {
      const count = await this.finesService.getCountByUser(id, type);
      const total = await this.finesService.getTotalByUser(id, type);
      stats[type] = { count, total };
    }

    return stats;
  }

  @Patch(':id')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  async update(
    @Param('id') id: string,
    @Body() data: UpdateFineDto,
    @CurrentUser() user: any,
  ) {
    if (
      !user?.isSuperAdmin &&
      !user?.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN)
    ) {
      throw new ForbiddenException('No autorizado');
    }
    return this.finesService.update(parseInt(id, 10), data);
  }

  @Delete(':id')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  async delete(@Param('id') id: string, @CurrentUser() user: any) {
    if (
      !user?.isSuperAdmin &&
      !user?.permissions?.includes(PERMISSIONS.CONSOLE_ADMIN)
    ) {
      throw new ForbiddenException('No autorizado');
    }
    return this.finesService.delete(parseInt(id, 10));
  }
}
