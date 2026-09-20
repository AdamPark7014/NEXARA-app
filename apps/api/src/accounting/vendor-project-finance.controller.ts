import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { VendorProjectFinanceService, type ProjectKind } from './vendor-project-finance.service.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

/**
 * Proveedores y Proyectos del workspace de Contabilidad.
 * Mismo contrato de autorización que el dashboard de la contadora.
 */
const CONTADORA = {
  anyPermissions: [
    PERMISSIONS.CONTABILIDAD_VIEW,
    PERMISSIONS.INVOICING_VIEW,
    PERMISSIONS.CONSOLE_ADMIN,
  ],
} as const;

const asBool = (value: string | undefined): boolean =>
  value === '1' || value === 'true' || value === 'si';

const asId = (value: string, label: string): number => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestException(`${label} inválido`);
  }
  return id;
};

const asKind = (value: string | undefined): ProjectKind => {
  if (value === undefined || value === '' || value === 'operacional') return 'operacional';
  if (value === 'obra') return 'obra';
  throw new BadRequestException('tipo debe ser "operacional" u "obra"');
};

@Controller('accounting/workspace')
@UseGuards(UrlAccessGuard)
export class VendorProjectFinanceController {
  constructor(private readonly service: VendorProjectFinanceService) {}

  @Get('proveedores')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [...CONTADORA.anyPermissions] })
  listVendors(
    @CurrentCompanyId() companyId: number | null,
    @Query('q') q?: string,
    @Query('soloActivos') soloActivos?: string,
  ) {
    return this.service.listVendors(companyId, {
      q,
      soloActivos: asBool(soloActivos),
    });
  }

  @Get('proveedores/:id')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [...CONTADORA.anyPermissions] })
  vendorDetail(@Param('id') id: string, @CurrentCompanyId() companyId: number | null) {
    return this.service.getVendorDetail(companyId, asId(id, 'Proveedor'));
  }

  @Get('proyectos')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [...CONTADORA.anyPermissions] })
  listProjects(@CurrentCompanyId() companyId: number | null, @Query('q') q?: string) {
    return this.service.listProjects(companyId, { q });
  }

  @Get('proyectos/:id')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [...CONTADORA.anyPermissions] })
  projectDetail(
    @Param('id') id: string,
    @CurrentCompanyId() companyId: number | null,
    @Query('tipo') tipo?: string,
  ) {
    return this.service.getProjectDetail(companyId, asId(id, 'Proyecto'), asKind(tipo));
  }
}
