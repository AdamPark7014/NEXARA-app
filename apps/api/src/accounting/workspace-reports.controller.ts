import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AccountingWorkspaceReportsService } from './workspace-reports.service.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { requirePositiveIntQuery } from '../common/dto/query-params.js';

/**
 * Reportes de contabilidad (`/erp/contabilidad/reportes`) y comparativo de
 * presupuestos (`/erp/contabilidad/presupuestos`).
 *
 * Autorización: `UrlAccessGuard` (whitelist de URL por rol v2) + `RbacGuard`
 * con `contabilidad.view`. Se aceptan además `accounting.view` y
 * `console.admin`, igual que el dashboard del mismo hub: es la misma pantalla
 * partida en dos controladores.
 *
 * La empresa **nunca** llega por query: sale de `CurrentCompanyId`, que la
 * resuelve el `TenantInterceptor`. El servicio la exige con `requireCompanyId`.
 */
const SOLO_LECTURA_CONTABILIDAD = {
  anyPermissions: [
    PERMISSIONS.CONTABILIDAD_VIEW,
    PERMISSIONS.ACCOUNTING_VIEW,
    PERMISSIONS.CONSOLE_ADMIN,
  ],
};

const opcionalEntero = (raw: string | undefined, nombre: string): number | undefined =>
  raw === undefined || String(raw).trim() === '' ? undefined : requirePositiveIntQuery(raw, nombre);

const esVerdadero = (raw: string | undefined): boolean =>
  raw === '1' || raw === 'true' || raw === 'si' || raw === 'sí';

@Controller('accounting/workspace')
@UseGuards(UrlAccessGuard)
export class AccountingWorkspaceReportsController {
  constructor(private readonly service: AccountingWorkspaceReportsService) {}

  /** Catálogo de reportes ejecutables, con las opciones reales de cada filtro. */
  @Get('reportes/catalogo')
  @UseGuards(RbacGuard)
  @RBAC(SOLO_LECTURA_CONTABILIDAD)
  catalogo(@CurrentCompanyId() companyId: number | null) {
    return this.service.getCatalogo(companyId);
  }

  /** Presupuesto vs real vs variación por línea y por centro de costo. */
  @Get('presupuestos/comparativo')
  @UseGuards(RbacGuard)
  @RBAC(SOLO_LECTURA_CONTABILIDAD)
  comparativoPresupuestos(
    @CurrentCompanyId() companyId: number | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('costCenterId') costCenterId?: string,
  ) {
    return this.service.comparativoPresupuestos(
      { from, to, costCenterId: opcionalEntero(costCenterId, 'costCenterId') },
      companyId,
    );
  }

  /** Pólizas que forman el «real» de una línea del comparativo. */
  @Get('presupuestos/comparativo/detalle')
  @UseGuards(RbacGuard)
  @RBAC(SOLO_LECTURA_CONTABILIDAD)
  detallePresupuesto(
    @CurrentCompanyId() companyId: number | null,
    @Query('costCenterId') costCenterId: string,
    @Query('year') year: string,
    @Query('month') month?: string,
  ) {
    return this.service.detallePresupuesto(
      {
        costCenterId: requirePositiveIntQuery(costCenterId, 'costCenterId'),
        year: requirePositiveIntQuery(year, 'year'),
        month: opcionalEntero(month, 'month') ?? null,
      },
      companyId,
    );
  }

  @Get('presupuestos/comparativo/export')
  @UseGuards(RbacGuard)
  @RBAC(SOLO_LECTURA_CONTABILIDAD)
  async exportComparativo(
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('costCenterId') costCenterId?: string,
  ) {
    const data = await this.service.comparativoPresupuestos(
      { from, to, costCenterId: opcionalEntero(costCenterId, 'costCenterId') },
      companyId,
    );
    const csv = this.service.csvComparativoPresupuestos(data);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=presupuesto-vs-real-${data.periodo.from}_${data.periodo.to}.csv`,
    );
    // BOM: sin él Excel en español abre los acentos rotos.
    res.send('﻿' + csv);
  }

  /** Transacciones que forman una línea del reporte (drill-down). */
  @Get('reportes/:id/detalle')
  @UseGuards(RbacGuard)
  @RBAC(SOLO_LECTURA_CONTABILIDAD)
  detalle(
    @Param('id') id: string,
    @Query('clave') clave: string,
    @CurrentCompanyId() companyId: number | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('asOf') asOf?: string,
    @Query('periodId') periodId?: string,
  ) {
    return this.service.detalle(
      id,
      clave,
      { from, to, asOf, periodId: opcionalEntero(periodId, 'periodId') },
      companyId,
    );
  }

  @Get('reportes/:id/export')
  @UseGuards(RbacGuard)
  @RBAC(SOLO_LECTURA_CONTABILIDAD)
  async exportReporte(
    @Param('id') id: string,
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
    @Query('formato') formato?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('asOf') asOf?: string,
    @Query('costCenterId') costCenterId?: string,
    @Query('projectId') projectId?: string,
    @Query('periodId') periodId?: string,
    @Query('categoria') categoria?: string,
    @Query('comparar') comparar?: string,
  ) {
    const resultado = await this.service.ejecutar(
      id,
      {
        from,
        to,
        asOf,
        categoria: categoria?.trim() || undefined,
        costCenterId: opcionalEntero(costCenterId, 'costCenterId'),
        projectId: opcionalEntero(projectId, 'projectId'),
        periodId: opcionalEntero(periodId, 'periodId'),
        comparar: esVerdadero(comparar),
      },
      companyId,
    );
    // Hoy solo CSV. `formato` se acepta para no romper el enlace cuando se sume otro.
    const { from: desde, to: hasta, asOf: corte } = resultado.periodo;
    const sufijo = corte ?? (desde && hasta ? `${desde}_${hasta}` : new Date().toISOString().slice(0, 10));
    const csv = this.service.aCsv(resultado);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${id}-${sufijo || 'reporte'}.csv`);
    res.send('﻿' + csv);
    void formato;
  }

  /** Ejecuta un reporte del catálogo con los filtros recibidos. */
  @Get('reportes/:id')
  @UseGuards(RbacGuard)
  @RBAC(SOLO_LECTURA_CONTABILIDAD)
  ejecutar(
    @Param('id') id: string,
    @CurrentCompanyId() companyId: number | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('asOf') asOf?: string,
    @Query('costCenterId') costCenterId?: string,
    @Query('projectId') projectId?: string,
    @Query('periodId') periodId?: string,
    @Query('categoria') categoria?: string,
    @Query('comparar') comparar?: string,
  ) {
    return this.service.ejecutar(
      id,
      {
        from,
        to,
        asOf,
        categoria: categoria?.trim() || undefined,
        costCenterId: opcionalEntero(costCenterId, 'costCenterId'),
        projectId: opcionalEntero(projectId, 'projectId'),
        periodId: opcionalEntero(periodId, 'periodId'),
        comparar: esVerdadero(comparar),
      },
      companyId,
    );
  }
}
