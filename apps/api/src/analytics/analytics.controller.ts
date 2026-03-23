import { Controller, Get, Post, Query, Body, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('analytics')
@UseGuards(RbacGuard)
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

  @Get('production-efficiency')
  @RBAC({ permissions: [PERMISSIONS.BI_VIEW] })
  productionEfficiency() {
    return this.svc.getProductionEfficiency();
  }
}
