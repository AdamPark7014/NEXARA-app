import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service.js';
import { RecordPublicLandingEventDto } from './dto/record-public-landing-event.dto.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

@Controller('public-analytics')
export class PublicAnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}

  @Post('events')
  async recordEvent(@Body() dto: RecordPublicLandingEventDto) {
    await this.svc.recordPublicLandingEvent(dto);
    return { ok: true };
  }

  @Get('summary')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.BI_VIEW] })
  summary(@CurrentCompanyId() companyId: number | null, @Query('days') days?: string) {
    const parsed = Number(days);
    return this.svc.getPublicLandingSummary(companyId, Number.isFinite(parsed) && parsed > 0 ? parsed : 30);
  }
}
