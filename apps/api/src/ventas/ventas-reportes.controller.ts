import { Controller, Get, Post, Query, Body, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { VentasService } from './ventas.service.js';

@Controller('ventas/reportes')
export class VentasReportesController {
  constructor(private readonly ventasService: VentasService) {}

  @Get('resumen')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  async summary(@Query('start') start: string, @Query('end') end: string, @CurrentUser() user: any) {
    return this.ventasService.buildReportSummary({ start, end }, user);
  }

  @Get('metricas')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  async metrics(@Query('period') period: 'week' | 'month' | 'year' = 'month', @CurrentUser() user: any) {
    return this.ventasService.getMetricsByPeriod(period, user);
  }

  @Get('vendedores')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  async vendorStats(@Query('period') period: 'week' | 'month' | 'year' = 'month', @CurrentUser() user: any) {
    return this.ventasService.getVendorStatsByPeriod(period, user);
  }

  @Get('pdf')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  async pdf(
    @Query('start') start: string,
    @Query('end') end: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const { pdf } = await this.ventasService.generateReportPdf({ start, end }, user);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte-ventas.pdf');
    res.send(pdf);
  }

  @Post('generar-pdf')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.PANEL_VENTAS] })
  async generatePdf(
    @Body() dto: { period: 'week' | 'month' | 'year'; includeVendorStats?: boolean },
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.ventasService.generateDynamicReportPdf(dto.period, user, dto.includeVendorStats);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=reporte-ventas-${dto.period}-${new Date().toISOString().slice(0, 10)}.pdf`);
    res.send(pdfBuffer);
  }
}
