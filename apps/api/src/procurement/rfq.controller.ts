import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ProcurementService } from './procurement.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('procurement/rfq')
@UseGuards(RbacGuard)
export class RfqController {
  constructor(private readonly svc: ProcurementService) {}

  @Post()
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_MANAGE] })
  create(@Body() dto: any, @CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.svc.createRfq(dto, user.id, companyId);
  }

  @Get()
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_VIEW] })
  list(
    @Query('requisitionId') requisitionId: string | undefined,
    @Query('status') status: string | undefined,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.listRfqs({ requisitionId: requisitionId ? +requisitionId : undefined, status, companyId });
  }

  @Get(':id')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_VIEW] })
  get(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.svc.getRfq(id, companyId);
  }

  @Get(':id/compare')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_VIEW] })
  compare(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.svc.compareRfq(id, companyId);
  }

  @Post(':id/lines/:lineId/quote')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_MANAGE] })
  submitQuote(
    @Param('id', ParseIntPipe) id: number,
    @Param('lineId', ParseIntPipe) lineId: number,
    @Body() dto: { unitPrice: number; leadTimeDays?: number; notes?: string },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.submitRfqQuote(id, lineId, dto, companyId);
  }

  @Post(':id/award')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_APPROVE] })
  award(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { supplierId: number },
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.awardRfq(id, dto.supplierId, user.id, companyId);
  }

  @Patch(':id/cancel')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_MANAGE] })
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.svc.cancelRfq(id, companyId);
  }
}
