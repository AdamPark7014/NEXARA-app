import { Controller, Get, Post, Query, Body, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

@Controller('analytics')
@UseGuards(UrlAccessGuard, RbacGuard)
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}

  @Post('kpi')
  @RBAC({ permissions: [PERMISSIONS.BI_MANAGE] })
  recordKpi(@Body() dto: any, @CurrentCompanyId() companyId: number | null) {
    return this.svc.recordKpi(dto, companyId);
  }

  @Get('kpi')
  @RBAC({ permissions: [PERMISSIONS.BI_VIEW] })
  getKpiTimeSeries(
    @Query('name') name: string,
    @CurrentCompanyId() companyId: number | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.getKpiTimeSeries(name, companyId, from, to);
  }

  @Get('kpi/computed')
  @RBAC({ anyPermissions: [PERMISSIONS.BI_VIEW, PERMISSIONS.BI_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  getComputedKpis(@CurrentCompanyId() companyId: number | null) {
    return this.svc.getComputedKpis(companyId);
  }

  @Get('kpi/names')
  @RBAC({ permissions: [PERMISSIONS.BI_VIEW] })
  listKpiNames(@CurrentCompanyId() companyId: number | null) {
    return this.svc.listKpiNames(companyId);
  }

  @Get('dashboard')
  @RBAC({ permissions: [PERMISSIONS.BI_VIEW] })
  executiveDashboard(@CurrentCompanyId() companyId: number | null) {
    return this.svc.getExecutiveDashboard(companyId);
  }

  @Get('sales-trend')
  @RBAC({ permissions: [PERMISSIONS.BI_VIEW] })
  salesTrend(@CurrentCompanyId() companyId: number | null, @Query('months') months?: string) {
    return this.svc.getSalesTrend(companyId, months ? +months : undefined);
  }

  @Get('intelligence')
  @RBAC({ anyPermissions: [PERMISSIONS.BI_VIEW, PERMISSIONS.BI_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  intelligence(@CurrentCompanyId() companyId: number | null) {
    return this.svc.getBusinessIntelligence(companyId);
  }

  // ── BI Ejecutivo (Fase 10) ────────────────────────────────────────
  @Get('bi/executive')
  @RBAC({ anyPermissions: [PERMISSIONS.BI_VIEW, PERMISSIONS.BI_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  executiveBi(@CurrentCompanyId() companyId: number | null) {
    return this.svc.getExecutiveBiDashboard(companyId);
  }

  @Get('bi/margin-by-type')
  @RBAC({ anyPermissions: [PERMISSIONS.BI_VIEW, PERMISSIONS.BI_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  marginByType(@CurrentCompanyId() companyId: number | null) {
    return this.svc.getMarginByProjectType(companyId);
  }

  @Get('bi/engineers')
  @RBAC({ anyPermissions: [PERMISSIONS.BI_VIEW, PERMISSIONS.BI_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  engineerRanking(@CurrentCompanyId() companyId: number | null, @Query('limit') limit?: string) {
    return this.svc.getEngineerPerformanceRanking(companyId, limit ? +limit : 20);
  }

  @Get('bi/clients-roi')
  @RBAC({ anyPermissions: [PERMISSIONS.BI_VIEW, PERMISSIONS.BI_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  clientsRoi(@CurrentCompanyId() companyId: number | null, @Query('limit') limit?: string) {
    return this.svc.getClientRoi(companyId, limit ? +limit : 25);
  }

  @Get('bi/branches')
  @RBAC({ anyPermissions: [PERMISSIONS.BI_VIEW, PERMISSIONS.BI_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  branchesRanking(@CurrentCompanyId() companyId: number | null, @Query('limit') limit?: string) {
    return this.svc.getBranchActivityRanking(companyId, limit ? +limit : 25);
  }

  @Get('bi/maintenance-contracts')
  @RBAC({ anyPermissions: [PERMISSIONS.BI_VIEW, PERMISSIONS.BI_MANAGE, PERMISSIONS.CONSOLE_ADMIN] })
  maintenanceKpis(@CurrentCompanyId() companyId: number | null) {
    return this.svc.getMaintenanceContractsKpis(companyId);
  }
}
