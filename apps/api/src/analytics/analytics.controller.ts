import { Controller, Get, Post, Query, Body, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('analytics')
@UseGuards(UrlAccessGuard, RbacGuard)
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}

  @Post('kpi')
  @RBAC({ permissions: [PERMISSIONS.BI_MANAGE] })
  recordKpi(@Body() dto: any) {
    return this.svc.recordKpi(dto);
  }

  @Get('kpi')
  @RBAC({ permissions: [PERMISSIONS.BI_VIEW] })
  getKpiTimeSeries(@Query('name') name: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.getKpiTimeSeries(name, from, to);
  }

  @Get('kpi/computed')
  @RBAC({ anyPermissions: [PERMISSIONS.BI_VIEW, PERMISSIONS.BI_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  getComputedKpis() {
    return this.svc.getComputedKpis();
  }

  @Get('kpi/names')
  @RBAC({ permissions: [PERMISSIONS.BI_VIEW] })
  listKpiNames() {
    return this.svc.listKpiNames();
  }

  @Get('dashboard')
  @RBAC({ permissions: [PERMISSIONS.BI_VIEW] })
  executiveDashboard() {
    return this.svc.getExecutiveDashboard();
  }

  @Get('sales-trend')
  @RBAC({ permissions: [PERMISSIONS.BI_VIEW] })
  salesTrend(@Query('months') months?: string) {
    return this.svc.getSalesTrend(months ? +months : undefined);
  }

  // ── BI Ejecutivo (Fase 10) ────────────────────────────────────────
  @Get('bi/executive')
  @RBAC({ anyPermissions: [PERMISSIONS.BI_VIEW, PERMISSIONS.BI_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  executiveBi() {
    return this.svc.getExecutiveBiDashboard();
  }

  @Get('bi/margin-by-type')
  @RBAC({ anyPermissions: [PERMISSIONS.BI_VIEW, PERMISSIONS.BI_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  marginByType() {
    return this.svc.getMarginByProjectType();
  }

  @Get('bi/engineers')
  @RBAC({ anyPermissions: [PERMISSIONS.BI_VIEW, PERMISSIONS.BI_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  engineerRanking(@Query('limit') limit?: string) {
    return this.svc.getEngineerPerformanceRanking(limit ? +limit : 20);
  }

  @Get('bi/clients-roi')
  @RBAC({ anyPermissions: [PERMISSIONS.BI_VIEW, PERMISSIONS.BI_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  clientsRoi(@Query('limit') limit?: string) {
    return this.svc.getClientRoi(limit ? +limit : 25);
  }

  @Get('bi/branches')
  @RBAC({ anyPermissions: [PERMISSIONS.BI_VIEW, PERMISSIONS.BI_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  branchesRanking(@Query('limit') limit?: string) {
    return this.svc.getBranchActivityRanking(limit ? +limit : 25);
  }

  @Get('bi/maintenance-contracts')
  @RBAC({ anyPermissions: [PERMISSIONS.BI_VIEW, PERMISSIONS.BI_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  maintenanceKpis() {
    return this.svc.getMaintenanceContractsKpis();
  }
}
