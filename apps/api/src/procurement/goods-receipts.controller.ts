import { Controller, Get, Post, Query, Body, UseGuards } from '@nestjs/common';
import { ProcurementService } from './procurement.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('procurement/goods-receipts')
@UseGuards(RbacGuard)
export class GoodsReceiptsController {
  constructor(private readonly svc: ProcurementService) {}

  @Post()
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_MANAGE] })
  create(@Body() dto: any, @CurrentUser() user: any) {
    return this.svc.createGoodsReceipt(dto, user.id);
  }

  @Get()
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_VIEW] })
  list(@Query('purchaseOrderId') poId?: string) {
    return this.svc.listGoodsReceipts(poId ? +poId : undefined);
  }
}
