import { Controller, Get, Post, Query, Body, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { VentasService } from './ventas.service.js';

const SALES_REPORT_VIEW_ACCESS = [PERMISSIONS.SALES_REPORTS_VIEW, PERMISSIONS.SALES_VIEW, PERMISSIONS.PANEL_VENTAS];
const SALES_REPORT_EXPORT_ACCESS = [PERMISSIONS.SALES_REPORTS_EXPORT, PERMISSIONS.SALES_MANAGE, PERMISSIONS.PANEL_VENTAS];
const SALES_AUDIT_ACCESS = [PERMISSIONS.SALES_AUDIT_VIEW, PERMISSIONS.SALES_REPORTS_VIEW, PERMISSIONS.PANEL_VENTAS];
const SALES_QUOTA_MANAGE_ACCESS = [PERMISSIONS.SALES_MANAGE, PERMISSIONS.PANEL_VENTAS];

@Controller('ventas/reportes')
export class VentasReportesController {
  constructor(private readonly ventasService: VentasService) {}

  @Get('resumen')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_REPORT_VIEW_ACCESS })
  async summary(@Query('start') start: string, @Query('end') end: string, @CurrentUser() user: any) {
    return this.ventasService.buildReportSummary({ start, end }, user);
  }

  @Get('metricas')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_REPORT_VIEW_ACCESS })
  async metrics(@Query('period') period: 'week' | 'month' | 'year' = 'month', @CurrentUser() user: any) {
    return this.ventasService.getMetricsByPeriod(period, user);
  }

  @Get('vendedores')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_REPORT_VIEW_ACCESS })
  async vendorStats(@Query('period') period: 'week' | 'month' | 'year' = 'month', @CurrentUser() user: any) {
    return this.ventasService.getVendorStatsByPeriod(period, user);
  }

  @Get('cuotas')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_REPORT_VIEW_ACCESS })
  async quotas(@Query('period') period: 'week' | 'month' | 'year' = 'month', @CurrentUser() user: any) {
    return this.ventasService.getSalesQuotaProgress(period, user);
  }

  @Post('cuotas')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_QUOTA_MANAGE_ACCESS })
  async setQuota(
    @Body() dto: {
      period: 'week' | 'month' | 'year';
      ownerId?: number;
      targetRevenue: number;
      targetOpportunities?: number;
    },
    @CurrentUser() user: any,
  ) {
    const result = await this.ventasService.setSalesQuota(
      dto.period,
      dto.targetRevenue,
      dto.targetOpportunities || 0,
      dto.ownerId,
      user,
    );

    await this.ventasService.createAuditEvent({
      action: 'report.quota.set',
      entityType: 'quota',
      actorId: user?.id,
      metadata: result,
    });

    return result;
  }

  @Get('insights')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_REPORT_VIEW_ACCESS })
  async insights(@Query('period') period: 'week' | 'month' | 'year' = 'month', @CurrentUser() user: any) {
    return this.ventasService.getExecutiveInsights(period, user);
  }

  @Get('cockpit')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_REPORT_VIEW_ACCESS })
  async cockpit(@Query('period') period: 'week' | 'month' | 'year' = 'month', @CurrentUser() user: any) {
    return this.ventasService.getManagerCockpit(period, user);
  }

  @Get('auditoria')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_AUDIT_ACCESS })
  async audit(
    @Query('period') period: 'week' | 'month' | 'year' = 'month',
    @Query('limit') limit = '50',
    @CurrentUser() user: any,
  ) {
    return this.ventasService.listAuditEvents(period, Number(limit) || 50, user);
  }

  @Get('pdf')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_REPORT_EXPORT_ACCESS })
  async pdf(
    @Query('start') start: string,
    @Query('end') end: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const { pdf } = await this.ventasService.generateReportPdf({ start, end }, user);
    await this.ventasService.createAuditEvent({
      action: 'report.pdf.export',
      entityType: 'report',
      actorId: user?.id,
      metadata: { start, end, mode: 'range' },
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte-ventas.pdf');
    res.send(pdf);
  }

  @Post('generar-pdf')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ anyPermissions: SALES_REPORT_EXPORT_ACCESS })
  async generatePdf(
    @Body() dto: { period: 'week' | 'month' | 'year'; includeVendorStats?: boolean; logoUrl?: string },
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.ventasService.generateDynamicReportPdf(dto.period, user, dto.includeVendorStats, dto.logoUrl);
    await this.ventasService.createAuditEvent({
      action: 'report.pdf.generate',
      entityType: 'report',
      actorId: user?.id,
      metadata: { period: dto.period, includeVendorStats: Boolean(dto.includeVendorStats) },
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=reporte-ventas-${dto.period}-${new Date().toISOString().slice(0, 10)}.pdf`);
    res.send(pdfBuffer);
  }
}
