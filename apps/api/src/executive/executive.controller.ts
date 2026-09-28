import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExecutiveService } from './executive.service.js';
import { CeoBriefService } from './ceo-brief.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

@Controller('executive')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class ExecutiveController {
  constructor(
    private readonly service: ExecutiveService,
    private readonly brief: CeoBriefService,
  ) {}

  @Get('c-level')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.SALES_REPORTS_VIEW, PERMISSIONS.CONTABILIDAD_VIEW] })
  cLevel(@CurrentCompanyId() companyId: number | null) {
    return this.service.getCLevelDashboard(companyId);
  }

  /** «Tu día»: lo que hoy espera algo de quien consulta (el mismo resumen que llega cada mañana). */
  @Get('brief')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.SALES_REPORTS_VIEW, PERMISSIONS.CONTABILIDAD_VIEW] })
  tuDia(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.brief.resumen(companyId, {
      id: Number(user?.id),
      roleKey: user?.roleKey ?? null,
      isSuperAdmin: Boolean(user?.isSuperAdmin || user?.superadmin),
    });
  }
}
