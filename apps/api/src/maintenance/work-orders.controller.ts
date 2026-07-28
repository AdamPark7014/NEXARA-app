import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

@Controller('maintenance/work-orders')
@UseGuards(RbacGuard)
export class WorkOrdersController {
  constructor(private readonly svc: MaintenanceService) {}

  @Post()
  @RBAC({ permissions: [PERMISSIONS.MAINTENANCE_MANAGE] })
  create(
    @Body() dto: any,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.createWorkOrder(dto, user.id, companyId);
  }

  @Get()
  @RBAC({ permissions: [PERMISSIONS.MAINTENANCE_VIEW] })
  list(
    @CurrentCompanyId() companyId: number | null,
    @Query('status') status?: string,
    @Query('assetId') assetId?: string,
    @Query('assignedToId') assignedToId?: string,
  ) {
    return this.svc.listWorkOrders(companyId, {
      status,
      assetId: assetId ? +assetId : undefined,
      assignedToId: assignedToId ? +assignedToId : undefined,
    });
  }

  @Get(':id')
  @RBAC({ permissions: [PERMISSIONS.MAINTENANCE_VIEW] })
  get(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.svc.getWorkOrder(id, companyId);
  }

  @Patch(':id/start')
  @RBAC({ permissions: [PERMISSIONS.MAINTENANCE_MANAGE] })
  start(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.svc.startWorkOrder(id, companyId);
  }

  @Patch(':id/complete')
  @RBAC({ permissions: [PERMISSIONS.MAINTENANCE_MANAGE] })
  complete(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.completeWorkOrder(id, dto, companyId);
  }

  @Post(':id/parts')
  @RBAC({ permissions: [PERMISSIONS.MAINTENANCE_MANAGE] })
  addPart(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.addPartToWorkOrder(id, dto, companyId);
  }
}
