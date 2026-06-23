import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SlaTrackerService } from './sla-tracker.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('sla')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class SlaTrackerController {
  constructor(private readonly service: SlaTrackerService) {}

  @Get('stats')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.ACTIVITIES_VIEW] })
  stats(@Query('from') from?: string, @Query('to') to?: string, @Query('clientId') clientId?: string) {
    return this.service.getStats({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      clientId: clientId ? +clientId : undefined,
    });
  }
}
