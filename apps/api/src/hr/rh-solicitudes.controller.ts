import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RhSolicitudesService } from './rh-solicitudes.service.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { RbacGuard, RBAC } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('hr/solicitudes-aprobacion')
@UseGuards(UrlAccessGuard, RbacGuard)
export class RhSolicitudesController {
  constructor(private readonly svc: RhSolicitudesService) {}

  @Get()
  @RBAC({ anyPermissions: [PERMISSIONS.HR_VIEW, PERMISSIONS.PEOPLE_VIEW, PERMISSIONS.HR_APPROVE_LEAVE] })
  listar(
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('estado') estado?: string,
  ) {
    return this.svc.listar(user, Number(companyId), estado);
  }

  @Get('mis-pendientes')
  @RBAC({})
  misPendientes(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.svc.misPendientes(user, Number(companyId));
  }
}
