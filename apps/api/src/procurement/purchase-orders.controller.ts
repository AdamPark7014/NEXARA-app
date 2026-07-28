import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, ParseIntPipe, Res } from '@nestjs/common';
import { Response } from 'express';
import { ProcurementService } from './procurement.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { generateProcurementDashboardPdf } from './procurement-dashboard-pdf.js';

@Controller('procurement/purchase-orders')
@UseGuards(RbacGuard)
export class PurchaseOrdersController {
  constructor(private readonly svc: ProcurementService) {}

  @Get('suppliers')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_VIEW] })
  listSuppliers(@CurrentCompanyId() companyId: number | null) {
    return this.svc.listSuppliers(companyId);
  }

  @Post('suppliers')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_MANAGE] })
  createSupplier(@Body() dto: any, @CurrentCompanyId() companyId: number | null) {
    return this.svc.createSupplier(dto, companyId);
  }

  @Post()
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_MANAGE] })
  create(@Body() dto: any, @CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.svc.createPurchaseOrder({ ...dto, companyId }, user.id);
  }

  @Get()
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_VIEW] })
  list(
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
    @Query() query?: PaginationQueryDto,
    @CurrentCompanyId() companyId?: number | null,
  ) {
    return this.svc.listPurchaseOrders(
      { status, supplierId: supplierId ? +supplierId : undefined, companyId },
      query,
    );
  }

  @Get('dashboard')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_VIEW] })
  dashboard(@CurrentCompanyId() companyId: number | null) {
    return this.svc.getProcurementDashboard(companyId);
  }

  @Get('dashboard/pdf')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_VIEW] })
  async dashboardPdf(
    @Query('fromDate') fromDate: string | undefined,
    @Query('toDate') toDate: string | undefined,
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response
  ) {
    try {
      const data = await this.svc.getProcurementDashboardForPdf(fromDate, toDate, companyId);
      const payload = {
        ...data,
        fromDate: fromDate ?? data.fromDate ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
        toDate: toDate ?? data.toDate ?? new Date().toISOString().slice(0, 10),
      };
      const pdf = await generateProcurementDashboardPdf(payload);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=reporte-compras-${new Date().toISOString().slice(0, 10)}.pdf`);
      res.send(pdf);
    } catch (error) {
      res.status(500).json({ error: 'Error al generar PDF' });
    }
  }

  @Get(':id')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_VIEW] })
  get(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.svc.getPurchaseOrder(id, companyId);
  }

  @Patch(':id/approve')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_APPROVE] })
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.approvePurchaseOrder(id, user.id, companyId);
  }
}
