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
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

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
  async create(
    @Body() data: CreateFineDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (!this.isOpsManager(user)) {
      throw new ForbiddenException('No autorizado para crear multas');
    }
    return this.finesService.create(data, companyId);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  async findAll(
    @CurrentUser() user: any,
    @Query() query: PaginationQueryDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (!this.isOpsManager(user)) {
      return this.finesService.findByUser(user?.id || 0, companyId);
    }
    return this.finesService.findAll(user, query, companyId);
  }

  @Get('user/:usuarioId')
  @UseGuards(AuthGuard('jwt'))
  async findByUser(
    @Param('usuarioId') usuarioId: string,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const id = parseInt(usuarioId, 10);
    if (id !== user?.id && !this.isOpsManager(user)) {
      throw new ForbiddenException('No autorizado');
    }
    return this.finesService.findByUser(id, companyId);
  }

  @Get('user/:usuarioId/type/:tipo')
  @UseGuards(AuthGuard('jwt'))
  async findByUserAndType(
    @Param('usuarioId') usuarioId: string,
    @Param('tipo') tipo: string,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const id = parseInt(usuarioId, 10);
    if (id !== user?.id && !this.isOpsManager(user)) {
      throw new ForbiddenException('No autorizado');
    }
    return this.finesService.findByUserAndType(id, tipo, companyId);
  }

  @Get('type/:tipo')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.ACTIVITIES_MANAGE] })
  async findByType(
    @Param('tipo') tipo: string,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (!this.isOpsManager(user)) {
      throw new ForbiddenException('No autorizado');
    }
    return this.finesService.findByType(tipo, companyId);
  }

  @Get('stats/user/:usuarioId')
  @UseGuards(AuthGuard('jwt'))
  async getStats(
    @Param('usuarioId') usuarioId: string,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const id = parseInt(usuarioId, 10);
    if (id !== user?.id && !this.isOpsManager(user)) {
      throw new ForbiddenException('No autorizado');
    }

    const types = ['actividad', 'vehiculo', 'asistencia', 'herramienta'];
    const stats: Record<string, { count: number; total: number }> = {};
    for (const type of types) {
      const count = await this.finesService.getCountByUser(id, type, companyId);
      const total = await this.finesService.getTotalByUser(id, type, companyId);
      stats[type] = { count, total };
    }
    return stats;
  }

  @Patch(':id/approve')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.ACTIVITIES_MANAGE] })
  async approve(
    @Param('id') id: string,
    @Body() body: { action?: 'approve' | 'reject'; note?: string },
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (!this.isOpsManager(user)) {
      throw new ForbiddenException('No autorizado');
    }
    const action = body.action === 'reject' ? 'reject' : 'approve';
    return this.finesService.approveOrReject(parseInt(id, 10), user, action, body.note, companyId);
  }

  @Patch(':id')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.ACTIVITIES_MANAGE] })
  async update(
    @Param('id') id: string,
    @Body() data: UpdateFineDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (!this.isOpsManager(user)) {
      throw new ForbiddenException('No autorizado');
    }
    return this.finesService.update(parseInt(id, 10), data, companyId);
  }

  @Delete(':id')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.ACTIVITIES_MANAGE] })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (!this.isOpsManager(user)) {
      throw new ForbiddenException('No autorizado');
    }
    return this.finesService.delete(parseInt(id, 10), companyId);
  }
}
