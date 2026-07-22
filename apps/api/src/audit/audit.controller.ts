import { Controller, Get, Query, Res, UseGuards, Post, Body } from '@nestjs/common';
import type { Response } from 'express';
import { AuditService } from './audit.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('audit')
@UseGuards(UrlAccessGuard, RbacGuard)
export class AuditController {
  constructor(private readonly svc: AuditService) {}

  @Get()
  @RBAC({ permissions: [PERMISSIONS.AUDIT_VIEW] })
  query(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('source') source?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentCompanyId() companyId?: number | null,
  ) {
    return this.svc.query({
      entityType,
      entityId: entityId ? +entityId : undefined,
      action,
      userId: userId ? +userId : undefined,
      source,
      companyId,
      from,
      to,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
    });
  }

  @Get('export.csv')
  @RBAC({ permissions: [PERMISSIONS.AUDIT_VIEW] })
  async exportCsv(
    @Res() res: Response,
    @Query('entityType') entityType?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @CurrentCompanyId() companyId?: number | null,
  ) {
    const csv = await this.svc.exportCsv({
      entityType,
      action,
      userId: userId ? +userId : undefined,
      companyId,
      from,
      to,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=audit-export-${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csv);
  }

  @Post('purge')
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  purge(@Body('days') days?: number) {
    return this.svc.purgeOlderThan(days ?? 365);
  }

  @Get('entity-history')
  @RBAC({ permissions: [PERMISSIONS.AUDIT_VIEW] })
  entityHistory(@Query('entityType') entityType: string, @Query('entityId') entityId: string) {
    return this.svc.getEntityHistory(entityType, +entityId);
  }
}
