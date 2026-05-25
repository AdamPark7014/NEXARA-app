import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExecutiveService } from './executive.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('executive')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class ExecutiveController {
  constructor(private readonly service: ExecutiveService) {}

  @Get('c-level')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.SALES_REPORTS_VIEW, PERMISSIONS.CONTABILIDAD_VIEW] })
  cLevel() {
    return this.service.getCLevelDashboard();
  }
}
