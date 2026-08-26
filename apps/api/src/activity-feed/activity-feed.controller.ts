import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ActivityFeedService } from './activity-feed.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { AuthService } from '../auth/auth.service.js';

@Controller('activity-feed')
@UseGuards(AuthGuard('jwt'), RbacGuard)
@RBAC({})
export class ActivityFeedController {
  constructor(
    private readonly feed: ActivityFeedService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('limit') limit?: string,
  ) {
    const permissions = this.authService.resolveUserPermissions(user, Boolean(user?.isSuperAdmin));
    return this.feed.getFeed(
      Number(user.id),
      companyId,
      permissions,
      limit ? Number(limit) : undefined,
    );
  }
}
