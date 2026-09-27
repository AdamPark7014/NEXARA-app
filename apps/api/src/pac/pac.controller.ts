import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { PacReadinessService } from './pac-readiness.service.js';
import { puedeVerPreparacionPac } from './pac-readiness.acceso.js';

/**
 * Diagnóstico del timbrado (PAC). Solo lectura.
 *
 * Mismas dos capas que los endpoints de facturación (`accounting/invoices`):
 * `UrlAccessGuard` (matriz de URLs por rol) + `RbacGuard` con `invoicing.view`.
 * Encima, una lista cerrada de roles: dirección general, dirección
 * administrativa y contabilidad.
 */
@Controller('pac')
@UseGuards(UrlAccessGuard)
export class PacController {
  constructor(private readonly readiness: PacReadinessService) {}

  /** ¿Qué le falta a la facturación electrónica para poder encenderse en producción? */
  @Get('readiness')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_VIEW] })
  getReadiness(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    if (!puedeVerPreparacionPac(user)) {
      throw new ForbiddenException(
        'Solo dirección general, dirección administrativa y contabilidad pueden ver la preparación de la facturación electrónica.',
      );
    }
    return this.readiness.readiness(companyId);
  }
}
