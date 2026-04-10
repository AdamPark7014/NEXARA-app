import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ManufacturingService } from './manufacturing.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';

@Controller('manufacturing/production')
@UseGuards(RbacGuard)
export class ProductionController {
  constructor(private readonly svc: ManufacturingService) {}

  @Post()
  @RBAC({ permissions: [PERMISSIONS.PRODUCTION_MANAGE] })
  create(@Body() dto: any, @CurrentUser() user: any) {
    return this.svc.createProductionOrder(dto, user.id);
  }

  @Get()
  @RBAC({ permissions: [PERMISSIONS.MANUFACTURING_VIEW] })
  list(@Query('status') status?: string, @Query() query?: PaginationQueryDto) {
    return this.svc.listProductionOrders({ status }, query);
  }

  @Get('schedule')
  @RBAC({ permissions: [PERMISSIONS.MANUFACTURING_VIEW] })
  schedule(@Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.getProductionSchedule(from, to);
  }

  @Get('dashboard')
  @RBAC({ permissions: [PERMISSIONS.MANUFACTURING_VIEW] })
  dashboard() {
    return this.svc.getProductionDashboard();
  }

  @Get('work-center-utilization')
  @RBAC({ permissions: [PERMISSIONS.MANUFACTURING_VIEW] })
  utilization(@Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.getWorkCenterUtilization(from, to);
  }

  @Get(':id')
  @RBAC({ permissions: [PERMISSIONS.MANUFACTURING_VIEW] })
  get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getProductionOrder(id);
  }

  @Patch(':id/start')
  @RBAC({ permissions: [PERMISSIONS.PRODUCTION_MANAGE] })
  start(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.startProductionOrder(id, user.id);
  }

  @Patch(':id/complete')
  @RBAC({ permissions: [PERMISSIONS.PRODUCTION_MANAGE] })
  complete(@Param('id', ParseIntPipe) id: number, @Body('producedQty') producedQty: number, @CurrentUser() user: any) {
    return this.svc.completeProductionOrder(id, producedQty, user.id);
  }

  @Post(':id/logs')
  @RBAC({ permissions: [PERMISSIONS.PRODUCTION_MANAGE] })
  createLog(@Param('id', ParseIntPipe) orderId: number, @Body() dto: any, @CurrentUser() user: any) {
    return this.svc.createProductionLog({ ...dto, productionOrderId: orderId }, user.id);
  }

  @Get(':id/logs')
  @RBAC({ permissions: [PERMISSIONS.MANUFACTURING_VIEW] })
  listLogs(@Param('id', ParseIntPipe) orderId: number) {
    return this.svc.listProductionLogs(orderId);
  }
}
