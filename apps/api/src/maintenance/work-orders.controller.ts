import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('maintenance/work-orders')
@UseGuards(RbacGuard)
export class WorkOrdersController {
  constructor(private readonly svc: MaintenanceService) {}

  @Post()
  @RBAC({ permissions: [PERMISSIONS.MAINTENANCE_MANAGE] })
  create(@Body() dto: any, @CurrentUser() user: any) {
    return this.svc.createWorkOrder(dto, user.id);
  }

  @Get()
  @RBAC({ permissions: [PERMISSIONS.MAINTENANCE_VIEW] })
  list(@Query('status') status?: string, @Query('assetId') assetId?: string, @Query('assignedToId') assignedToId?: string) {
    return this.svc.listWorkOrders({ status, assetId: assetId ? +assetId : undefined, assignedToId: assignedToId ? +assignedToId : undefined });
  }

  @Get(':id')
  @RBAC({ permissions: [PERMISSIONS.MAINTENANCE_VIEW] })
  get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getWorkOrder(id);
  }

  @Patch(':id/start')
  @RBAC({ permissions: [PERMISSIONS.MAINTENANCE_MANAGE] })
  start(@Param('id', ParseIntPipe) id: number) {
    return this.svc.startWorkOrder(id);
  }

  @Patch(':id/complete')
  @RBAC({ permissions: [PERMISSIONS.MAINTENANCE_MANAGE] })
  complete(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.completeWorkOrder(id, dto);
  }

  @Post(':id/parts')
  @RBAC({ permissions: [PERMISSIONS.MAINTENANCE_MANAGE] })
  addPart(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.addPartToWorkOrder(id, dto);
  }
}
