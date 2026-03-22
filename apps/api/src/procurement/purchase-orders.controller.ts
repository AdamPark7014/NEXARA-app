import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ProcurementService } from './procurement.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';

@Controller('procurement/purchase-orders')
@UseGuards(RbacGuard)
export class PurchaseOrdersController {
  constructor(private readonly svc: ProcurementService) {}

  @Get('suppliers')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_VIEW] })
  listSuppliers() {
    return this.svc.listSuppliers();
  }

  @Post()
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_MANAGE] })
  create(@Body() dto: any, @CurrentUser() user: any) {
    return this.svc.createPurchaseOrder(dto, user.id);
  }

  @Get()
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_VIEW] })
  list(@Query('status') status?: string, @Query('supplierId') supplierId?: string, @Query() query?: PaginationQueryDto) {
    return this.svc.listPurchaseOrders({ status, supplierId: supplierId ? +supplierId : undefined }, query);
  }

  @Get('dashboard')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_VIEW] })
  dashboard() {
    return this.svc.getProcurementDashboard();
  }

  @Get(':id')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_VIEW] })
  get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getPurchaseOrder(id);
  }

  @Patch(':id/approve')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_APPROVE] })
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.approvePurchaseOrder(id, user.id);
  }
}
