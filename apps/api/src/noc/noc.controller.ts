import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NocService } from './noc.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('noc')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class NocController {
  constructor(private readonly service: NocService) {}

  @Get('summary')
  @RBAC({ anyPermissions: [PERMISSIONS.NOC_VIEW, PERMISSIONS.CONSOLE_ADMIN] })
  summary() {
    return this.service.getSummary();
  }

  @Get('devices')
  @RBAC({ anyPermissions: [PERMISSIONS.NOC_VIEW, PERMISSIONS.CONSOLE_ADMIN] })
  devices(@Query('type') type?: string, @Query('status') status?: string) {
    return this.service.listDevices({ type, status });
  }

  @Get('alerts')
  @RBAC({ anyPermissions: [PERMISSIONS.NOC_VIEW, PERMISSIONS.CONSOLE_ADMIN] })
  alerts() {
    return this.service.listAlerts();
  }
}
