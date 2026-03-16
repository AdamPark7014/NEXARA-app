import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('audit')
@UseGuards(RbacGuard)
export class AuditController {
  constructor(private readonly svc: AuditService) {}

  @Get()
  @RBAC({ permissions: [PERMISSIONS.AUDIT_VIEW] })
  query(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.query({
      entityType,
      entityId: entityId ? +entityId : undefined,
      action,
      userId: userId ? +userId : undefined,
      from,
      to,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
    });
  }

  @Get('entity-history')
  @RBAC({ permissions: [PERMISSIONS.AUDIT_VIEW] })
  entityHistory(@Query('entityType') entityType: string, @Query('entityId') entityId: string) {
    return this.svc.getEntityHistory(entityType, +entityId);
  }
}
