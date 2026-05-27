import { Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RbacGuard, RBAC } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { AlertsService } from './alerts.service.js';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  /** Dispara los 3 chequeos (margen + SLA + stock) on-demand. */
  @Post('run-now')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.CONSOLE_ADMIN] })
  async runNow() {
    return this.alerts.runAllNow();
  }
}
