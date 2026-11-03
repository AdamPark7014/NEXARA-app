import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AccountingWorkspaceLedgerService, type LedgerQuery } from './workspace-ledger.service.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { ModulePolicyService } from '../common/tenant/module-policy.service.js';
import type { UsuarioDePolitica } from '../common/tenant/module-policy.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

/**
 * Libro de movimientos del workspace de Contabilidad.
 *
 * Mismo contrato de autorización que el resto del hub de la contadora
 * (`workspace.controller.ts`): whitelist de URL por rol + permiso de
 * contabilidad / facturación / consola.
 */
@Controller('accounting/workspace')
@UseGuards(UrlAccessGuard)
export class AccountingWorkspaceLedgerController {
  constructor(
    private readonly service: AccountingWorkspaceLedgerService,
    private readonly policy: ModulePolicyService,
  ) {}

  @Get('movimientos')
  @UseGuards(RbacGuard)
  @RBAC({
    anyPermissions: [
      PERMISSIONS.CONTABILIDAD_VIEW,
      PERMISSIONS.INVOICING_VIEW,
      PERMISSIONS.CONSOLE_ADMIN,
    ],
  })
  async movimientos(
    @Query() query: LedgerQuery,
    @CurrentUser() user: UsuarioDePolitica,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const verNomina = await this.policy.puedeUsar('employee-payments', user, companyId);
    return this.service.listMovements(companyId, query, { verNomina });
  }

  @Get('movimientos/export')
  @UseGuards(RbacGuard)
  @RBAC({
    anyPermissions: [
      PERMISSIONS.CONTABILIDAD_VIEW,
      PERMISSIONS.INVOICING_VIEW,
      PERMISSIONS.CONSOLE_ADMIN,
    ],
  })
  async exportMovimientos(
    @Query() query: LedgerQuery,
    @CurrentUser() user: UsuarioDePolitica,
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
  ) {
    const verNomina = await this.policy.puedeUsar('employee-payments', user, companyId);
    const { csv, filename, rows, truncated } = await this.service.exportMovements(companyId, query, { verNomina });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.setHeader('X-Ledger-Rows', String(rows));
    if (truncated) res.setHeader('X-Ledger-Truncated', '1');
    // BOM para que Excel en español abra el acentuado sin romperlo.
    res.send('﻿' + csv);
  }
}
