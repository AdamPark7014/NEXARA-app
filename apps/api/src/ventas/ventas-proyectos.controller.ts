import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { VentasService } from './ventas.service.js';
import { CreateSalesProjectDto } from './dto/create-sales-project.dto.js';
import { UpdateSalesProjectDto } from './dto/update-sales-project.dto.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { Response } from 'express';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';

const SALES_VIEW_ACCESS = [PERMISSIONS.SALES_VIEW, PERMISSIONS.PANEL_VENTAS];
const SALES_MANAGE_ACCESS = [PERMISSIONS.SALES_MANAGE, PERMISSIONS.PANEL_VENTAS];

@Controller('ventas/proyectos')
export class VentasProyectosController {
  constructor(private readonly ventasService: VentasService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async create(@Body() dto: CreateSalesProjectDto, @CurrentUser() user: any) {
    const created = await this.ventasService.createProject(dto, user);
    await this.ventasService.createAuditEvent({
      action: 'project.create',
      entityType: 'project',
      entityId: created.id,
      actorId: user?.id,
      metadata: { status: created.status },
    });
    return created;
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  findAll(@CurrentUser() user: any, @Query('ownerId') ownerId?: string, @Query() query?: PaginationQueryDto) {
    return this.ventasService.listProjects(user, ownerId ? Number(ownerId) : undefined, query);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSalesProjectDto, @CurrentUser() user: any) {
    const updated = await this.ventasService.updateProject(id, dto, user);
    await this.ventasService.createAuditEvent({
      action: 'project.update',
      entityType: 'project',
      entityId: updated.id,
      actorId: user?.id,
      metadata: { status: updated.status, margin: updated.margin },
    });
    return updated;
  }

  @Post(':id/close')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async closeProject(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    const order = await this.ventasService.closeProject(id, user);
    await this.ventasService.createAuditEvent({
      action: 'project.close',
      entityType: 'project',
      entityId: id,
      actorId: user?.id,
      metadata: { orderId: order?.orderId || null },
    });
    return order;
  }

  @Get(':id/orden')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  getOrder(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ventasService.getProjectOrder(id, user);
  }

  @Get(':id/viaticos')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  getProjectViaticos(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ventasService.getProjectViaticos(id, user);
  }

  @Post(':id/viaticos/assign')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  assignViaticosToProject(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { viaticIds: number[] },
    @CurrentUser() user: any,
  ) {
    return this.ventasService.assignViaticosToProject(id, body.viaticIds, user).then(async (result) => {
      await this.ventasService.createAuditEvent({
        action: 'project.viatic.assign',
        entityType: 'project',
        entityId: id,
        actorId: user?.id,
        metadata: { count: body.viaticIds?.length || 0 },
      });
      return result;
    });
  }

  @Post('viaticos/:id/unassign')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async unassignViaticFromProject(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    const result = await this.ventasService.unassignViaticFromProject(id, user);
    await this.ventasService.createAuditEvent({
      action: 'project.viatic.unassign',
      entityType: 'viatic',
      entityId: id,
      actorId: user?.id,
    });
    return result;
  }

  @Get(':id/expenses')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  getProjectExpensesSummary(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ventasService.getProjectExpensesSummary(id, user);
  }

  @Get(':id/costos')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  calculateProjectCosts(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ventasService.calculateProjectCosts(id, user);
  }

  @Patch(':id/costos')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  updateProjectCosts(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { costProducts?: number; costViaticos?: number; costOperativo?: number },
    @CurrentUser() user: any,
  ) {
    return this.ventasService.updateProjectCosts(id, body, user).then(async (updated) => {
      await this.ventasService.createAuditEvent({
        action: 'project.costs.update',
        entityType: 'project',
        entityId: id,
        actorId: user?.id,
        metadata: body,
      });
      return updated;
    });
  }

  @Get(':id/validar-presupuesto')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  validateProjectBudget(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ventasService.validateProjectBudget(id, user);
  }

  @Post(':id/sync-viaticos')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async syncViaticosToProject(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    const result = await this.ventasService.syncViaticosToProject(id, user);
    await this.ventasService.createAuditEvent({
      action: 'project.viatic.sync',
      entityType: 'project',
      entityId: id,
      actorId: user?.id,
    });
    return result;
  }
}


