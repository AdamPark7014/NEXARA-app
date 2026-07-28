import { BadRequestException, Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ExportsService } from './exports.service.js';
import { ExcelExportService } from '../common/excel-export.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

const ALLOWED = new Set([
  'clients',
  'leads',
  'opportunities',
  'tenders',
  'invoices',
  'activities',
  'projects',
  'users',
  'kb-articles',
  'crm-activities',
]);

@Controller('exports')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class ExportsController {
  constructor(
    private readonly service: ExportsService,
    private readonly excelExport: ExcelExportService,
  ) {}

  @Get(':entity')
  @RBAC({
    anyPermissions: [
      PERMISSIONS.CONSOLE_ADMIN,
      PERMISSIONS.SALES_REPORTS_EXPORT,
      PERMISSIONS.CONTABILIDAD_VIEW,
    ],
  })
  async export(
    @Param('entity') entity: string,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('format') format: string | undefined,
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
  ) {
    if (!ALLOWED.has(entity)) {
      throw new BadRequestException(`Entidad ${entity} no soportada`);
    }
    // CSV deshabilitado — solo Excel (PDF va por endpoints de dominio).
    if (format && format !== 'xlsx' && format !== 'excel') {
      throw new BadRequestException('Solo se permite format=xlsx. CSV está deshabilitado.');
    }

    const result = await this.service.exportEntity(entity as any, { from, to }, companyId);
    const buffer = await this.excelExport.exportToExcel(result.rows, entity);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(Buffer.from(buffer));
  }
}
