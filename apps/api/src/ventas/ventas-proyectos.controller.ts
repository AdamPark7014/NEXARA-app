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
import { SalesPaginationQueryDto } from './dto/sales-pagination-query.dto.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

const SALES_VIEW_ACCESS = [PERMISSIONS.SALES_VIEW, PERMISSIONS.PANEL_VENTAS];
const SALES_MANAGE_ACCESS = [PERMISSIONS.SALES_MANAGE, PERMISSIONS.PANEL_VENTAS];

@Controller('ventas/proyectos')
export class VentasProyectosController {
  constructor(private readonly ventasService: VentasService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async create(
    @Body() dto: CreateSalesProjectDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const created = await this.ventasService.createProject(dto, user, companyId);
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
  findAll(
    @CurrentUser() user: any,
    @Query() query: SalesPaginationQueryDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.ventasService.listProjects(user, query.ownerId, query, companyId);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalesProjectDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const updated = await this.ventasService.updateProject(id, dto, user, companyId);
    await this.ventasService.createAuditEvent({
      action: 'project.update',
      entityType: 'project',
      entityId: updated.id,
      actorId: user?.id,
      metadata: { status: updated.status, margin: updated.margin },
    });
    return updated;
  }

  @Post(':id/provision-operacion')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async provisionOperational(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const result = await this.ventasService.provisionOperationalProject(id, user, companyId);
    await this.ventasService.createAuditEvent({
      action: 'project.provision_operacion',
      entityType: 'project',
      entityId: id,
      actorId: user?.id,
      metadata: {
        operationalProjectId: result.operationalProject.id,
        created: result.created,
      },
    });
    return result;
  }

  @Post(':id/close')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async closeProject(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const order = await this.ventasService.closeProject(id, user, companyId);
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
  getOrder(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.ventasService.getProjectOrder(id, user, companyId);
  }

  @Get(':id/resumen')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  getSummary(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.ventasService.getProjectSummary(id, user, companyId);
  }

  @Get(':id/viaticos')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  getProjectViaticos(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.ventasService.getProjectViaticos(id, user, companyId);
  }

  @Post(':id/viaticos/assign')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  assignViaticosToProject(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { viaticIds: number[] },
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.ventasService.assignViaticosToProject(id, body.viaticIds, user, companyId).then(async (result) => {
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
  async unassignViaticFromProject(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const result = await this.ventasService.unassignViaticFromProject(id, {
      ...user,
      companyId: companyId ?? user?.companyId,
    });
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
  getProjectExpensesSummary(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.ventasService.getProjectExpensesSummary(id, user, companyId);
  }

  @Get(':id/costos')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  calculateProjectCosts(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.ventasService.calculateProjectCosts(id, user, companyId);
  }

  @Patch(':id/costos')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  updateProjectCosts(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { costProducts?: number; costViaticos?: number; costOperativo?: number },
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.ventasService.updateProjectCosts(id, body, user, companyId).then(async () => {
      await this.ventasService.createAuditEvent({
        action: 'project.costs.update',
        entityType: 'project',
        entityId: id,
        actorId: user?.id,
        metadata: body,
      });
      return this.ventasService.calculateProjectCosts(id, user, companyId);
    });
  }

  @Get(':id/validar-presupuesto')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_VIEW_ACCESS })
  validateProjectBudget(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.ventasService.validateProjectBudget(id, user, companyId);
  }

  @Post(':id/sync-viaticos')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async syncViaticosToProject(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const result = await this.ventasService.syncViaticosToProject(id, user, companyId);
    await this.ventasService.createAuditEvent({
      action: 'project.viatic.sync',
      entityType: 'project',
      entityId: id,
      actorId: user?.id,
    });
    return result;
  }

  @Post(':id/sync-actual-costs')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_MANAGE_ACCESS })
  async syncActualCosts(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const result = await this.ventasService.syncActualCostsFromField(id, user, companyId);
    await this.ventasService.createAuditEvent({
      action: 'project.costs.sync_actual',
      entityType: 'project',
      entityId: id,
      actorId: user?.id,
    });
    return result;
  }
}
