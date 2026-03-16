import { Controller, Get, Post, Query, Body, UseGuards } from '@nestjs/common';
import { ProcurementService } from './procurement.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('procurement/supplier-evaluations')
@UseGuards(RbacGuard)
export class SupplierEvaluationsController {
  constructor(private readonly svc: ProcurementService) {}

  @Post()
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_MANAGE] })
  create(@Body() dto: any, @CurrentUser() user: any) {
    return this.svc.createSupplierEvaluation(dto, user.id);
  }

  @Get()
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_VIEW] })
  list(@Query('supplierId') supplierId?: string) {
    return this.svc.listSupplierEvaluations(supplierId ? +supplierId : undefined);
  }
}
