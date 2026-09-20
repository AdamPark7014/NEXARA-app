import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AccountingService } from './accounting.service.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('accounting/workspace')
@UseGuards(UrlAccessGuard)
export class AccountingWorkspaceController {
  constructor(private readonly service: AccountingService) {}

  @Get('dashboard')
  @UseGuards(RbacGuard)
  @RBAC({
    anyPermissions: [
      PERMISSIONS.CONTABILIDAD_VIEW,
      PERMISSIONS.INVOICING_VIEW,
      PERMISSIONS.CONSOLE_ADMIN,
    ],
  })
  dashboard(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.getWorkspaceDashboard(companyId, from, to);
  }
}
