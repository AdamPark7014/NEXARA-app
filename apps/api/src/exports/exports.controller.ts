import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ExportsService } from './exports.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('exports')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class ExportsController {
  constructor(private readonly service: ExportsService) {}

  @Get(':entity')
  @RBAC({ anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.SALES_REPORTS_EXPORT, PERMISSIONS.CONTABILIDAD_VIEW] })
  async export(
    @Param('entity') entity: string,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.service.exportEntity(entity as any, { from, to });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    // BOM para que Excel detecte UTF-8
    res.write('\uFEFF');
    res.end(result.csv);
  }
}
