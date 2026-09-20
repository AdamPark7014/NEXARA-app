import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { WorkspaceArApService } from './workspace-ar-ap.service.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

/**
 * Cartera de la contadora — `/accounting/workspace/cxc` y `/cxp`.
 *
 * Mismo contrato de guardas que el resto del workspace: `UrlAccessGuard`
 * (whitelist por rol) + `RbacGuard` con los permisos de contabilidad.
 */

const PERMISOS_CARTERA = [
  PERMISSIONS.CONTABILIDAD_VIEW,
  PERMISSIONS.INVOICING_VIEW,
  PERMISSIONS.CONSOLE_ADMIN,
];

@Controller('accounting/workspace')
@UseGuards(UrlAccessGuard)
export class WorkspaceArApController {
  constructor(private readonly service: WorkspaceArApService) {}

  // ── Cuentas por cobrar ──────────────────────────────────────────────
  @Get('cxc')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: PERMISOS_CARTERA })
  listarCxc(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('estado') estado: string | undefined,
    @Query('aging') aging: string | undefined,
    @Query('contraparte') contraparte: string | undefined,
    @Query('proyecto') proyecto: string | undefined,
    @Query('q') q: string | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.listar('cxc', companyId, {
      from, to, estado, aging, contraparte, proyecto, q, page, limit,
    });
  }

  @Get('cxc/:id/xml')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: PERMISOS_CARTERA })
  async xmlCxc(
    @Param('id') id: string,
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
  ) {
    const xml = await this.service.xml('cxc', Number(id), companyId);
    res.setHeader('Content-Type', xml.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${xml.filename}"`);
    res.send(xml.body);
  }

  @Get('cxc/:id')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: PERMISOS_CARTERA })
  detalleCxc(@Param('id') id: string, @CurrentCompanyId() companyId: number | null) {
    return this.service.detalle('cxc', Number(id), companyId);
  }

  // ── Cuentas por pagar ───────────────────────────────────────────────
  @Get('cxp')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: PERMISOS_CARTERA })
  listarCxp(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('estado') estado: string | undefined,
    @Query('aging') aging: string | undefined,
    @Query('contraparte') contraparte: string | undefined,
    @Query('proyecto') proyecto: string | undefined,
    @Query('q') q: string | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.listar('cxp', companyId, {
      from, to, estado, aging, contraparte, proyecto, q, page, limit,
    });
  }

  /** Debe declararse antes que `cxp/:id` — si no, `calendario` entra como id. */
  @Get('cxp/calendario')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: PERMISOS_CARTERA })
  calendarioCxp(
    @Query('dias') dias: string | undefined,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.calendario('cxp', companyId, { dias });
  }

  @Get('cxp/:id/xml')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: PERMISOS_CARTERA })
  async xmlCxp(
    @Param('id') id: string,
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
  ) {
    const xml = await this.service.xml('cxp', Number(id), companyId);
    res.setHeader('Content-Type', xml.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${xml.filename}"`);
    res.send(xml.body);
  }

  @Get('cxp/:id')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: PERMISOS_CARTERA })
  detalleCxp(@Param('id') id: string, @CurrentCompanyId() companyId: number | null) {
    return this.service.detalle('cxp', Number(id), companyId);
  }
}
