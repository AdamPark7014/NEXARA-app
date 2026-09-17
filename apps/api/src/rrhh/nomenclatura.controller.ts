import { Controller, Get, UseGuards } from '@nestjs/common';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { NomenclaturaAuditoriaService } from './nomenclatura-auditoria.service.js';

/** Número de empleado oficial: auditoría para RH y dirección. */
@Controller('hr/nomenclaturas')
@UseGuards(UrlAccessGuard, RbacGuard)
export class NomenclaturaController {
  constructor(private readonly auditoria: NomenclaturaAuditoriaService) {}

  @Get('auditoria')
  @RBAC({ anyPermissions: [PERMISSIONS.USERS_MANAGE, PERMISSIONS.HR_VIEW, PERMISSIONS.CONSOLE_ADMIN] })
  auditar() {
    return this.auditoria.auditar();
  }
}
