import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, ParseIntPipe, Res } from '@nestjs/common';
import { Response } from 'express';
import { ProcurementService } from './procurement.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { generateProcurementDashboardPdf } from './procurement-dashboard-pdf.js';

@Controller('procurement/purchase-orders')
@UseGuards(RbacGuard)
export class PurchaseOrdersController {
  constructor(private readonly svc: ProcurementService) {}

  @Get('suppliers')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_VIEW] })
  listSuppliers() {
    return this.svc.listSuppliers();
  }

  @Post('suppliers')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_MANAGE] })
  createSupplier(@Body() dto: any) {
    return this.svc.createSupplier(dto);
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

  @Get('dashboard/pdf')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_VIEW] })
  async dashboardPdf(
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Res() res: Response
  ) {
    try {
      const data = await this.svc.getProcurementDashboardForPdf(fromDate, toDate);
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
  get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getPurchaseOrder(id);
  }

  @Patch(':id/approve')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_APPROVE] })
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.approvePurchaseOrder(id, user.id);
  }
}
