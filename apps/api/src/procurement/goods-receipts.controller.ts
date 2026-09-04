import { Controller, Get, Post, Query, Body, Param, ParseIntPipe, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ProcurementService } from './procurement.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

@Controller('procurement/goods-receipts')
@UseGuards(RbacGuard)
export class GoodsReceiptsController {
  constructor(private readonly svc: ProcurementService) {}

  @Post()
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_MANAGE] })
  create(
    @Body() dto: any,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.createGoodsReceipt(dto, user.id, companyId);
  }

  @Get()
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_VIEW] })
  list(
    @CurrentCompanyId() companyId: number | null,
    @Query('purchaseOrderId') poId?: string,
  ) {
    return this.svc.listGoodsReceipts(poId ? +poId : undefined, companyId);
  }

  @Get(':id/pdf')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_VIEW] })
  async downloadPdf(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
  ) {
    try {
      const { pdf, receiptNumber } = await this.svc.getGoodsReceiptPdfBuffer(id, companyId);
      const safeName = String(receiptNumber || id).replace(/[^\w.-]+/g, '_');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=GR-${safeName}.pdf`);
      res.send(pdf);
    } catch (error) {
      const status = (error as { status?: number })?.status ?? 500;
      res.status(status).json({
        error: error instanceof Error ? error.message : 'Error al generar PDF de recepción',
      });
    }
  }

  @Get(':id')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_VIEW] })
  get(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.svc.getGoodsReceipt(id, companyId);
  }
}
