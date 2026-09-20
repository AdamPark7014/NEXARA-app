import { BadRequestException, Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ExportsService } from './exports.service.js';
import { ExcelExportService } from '../common/excel-export.service.js';
import { REPORTES_POR_ENTIDAD } from '../common/excel/reportes.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

/** Las entidades exportables son exactamente las que tienen columnas declaradas. */
const ALLOWED = new Set(Object.keys(REPORTES_POR_ENTIDAD));

const fechaCorta = (iso?: string) => {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

/** «Del 01/09/2026 al 30/09/2026», o lo que haya, o el histórico completo. */
function periodo(from?: string, to?: string): string {
  const desde = fechaCorta(from);
  const hasta = fechaCorta(to);
  if (desde && hasta) return `Del ${desde} al ${hasta}`;
  if (desde) return `Desde ${desde}`;
  if (hasta) return `Hasta ${hasta}`;
  return 'Histórico completo';
}

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
    @CurrentUser() user: any,
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

    const definicion = REPORTES_POR_ENTIDAD[entity];
    const result = await this.service.exportEntity(entity as any, { from, to }, companyId);
    const buffer = await this.excelExport.exportarReporte({
      titulo: definicion.titulo,
      subtitulo: periodo(from, to),
      hoja: definicion.hoja,
      columnas: definicion.columnas,
      filas: result.rows,
      generadoPor: user?.nombre ?? null,
      filtros: [
        { etiqueta: 'Desde', valor: fechaCorta(from) ?? 'Sin límite' },
        { etiqueta: 'Hasta', valor: fechaCorta(to) ?? 'Sin límite' },
      ],
    });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(Buffer.from(buffer));
  }
}
