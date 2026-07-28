import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { AccountingService } from './accounting.service.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { generateFinancialReportsPdf } from './accounting-reports-pdf.js';
import {
  CreateAccountDto,
  CreateCostCenterDto,
  CreateFiscalPeriodDto,
  UpdateAccountDto,
} from './dto/account.dto.js';

@Controller('accounting/accounts')
@UseGuards(UrlAccessGuard)
export class AccountsController {
  constructor(private readonly service: AccountingService) {}

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_MANAGE] })
  create(@Body() dto: CreateAccountDto, @CurrentCompanyId() companyId: number | null) {
    return this.service.createAccount({ ...dto, companyId });
  }

  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  findAll(
    @CurrentCompanyId() companyId: number | null,
    @Query('type') type?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.service.listAccounts({
      type,
      isActive: isActive === undefined ? undefined : isActive === 'true',
      companyId,
    });
  }

  @Get('trial-balance')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  trialBalance(
    @CurrentCompanyId() companyId: number | null,
    @Query('periodId') periodId?: string,
  ) {
    return this.service.getTrialBalance(periodId ? +periodId : undefined, companyId);
  }

  @Get('income-statement')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  incomeStatement(
    @CurrentCompanyId() companyId: number | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.getIncomeStatement(from, to, companyId);
  }

  @Get('balance-sheet')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  balanceSheet(
    @CurrentCompanyId() companyId: number | null,
    @Query('asOf') asOf?: string,
  ) {
    return this.service.getBalanceSheet(asOf, companyId);
  }

  @Get('cost-centers')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  listCostCenters(@CurrentCompanyId() companyId: number | null) {
    return this.service.listCostCenters(companyId);
  }

  @Post('cost-centers')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_MANAGE] })
  createCostCenter(@Body() dto: CreateCostCenterDto, @CurrentCompanyId() companyId: number | null) {
    return this.service.createCostCenter(dto, companyId);
  }

  @Get('fiscal-periods')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  listPeriods(@CurrentCompanyId() companyId: number | null) {
    return this.service.listFiscalPeriods(companyId);
  }

  @Post('fiscal-periods')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_MANAGE] })
  createPeriod(@Body() dto: CreateFiscalPeriodDto, @CurrentCompanyId() companyId: number | null) {
    return this.service.createFiscalPeriod({ ...dto, companyId });
  }

  @Patch('fiscal-periods/:id/close')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_CLOSE_PERIOD] })
  closePeriod(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.closeFiscalPeriod(+id, user.id, companyId);
  }

  @Patch('fiscal-periods/:id/reopen')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_CLOSE_PERIOD] })
  reopenPeriod(@Param('id') id: string, @CurrentCompanyId() companyId: number | null) {
    return this.service.reopenFiscalPeriod(+id, companyId);
  }

  @Get('reports/pdf')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  async reportsPdf(
    @CurrentCompanyId() companyId: number | null,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('asOfDate') asOfDate?: string,
    @Res() res?: Response,
  ) {
    try {
      const data = await this.service.getFinancialReportsForPdf(fromDate, toDate, asOfDate, companyId);
      const pdf = await generateFinancialReportsPdf(data);

      if (res) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename=reportes-financieros-${new Date().toISOString().slice(0, 10)}.pdf`,
        );
        res.send(pdf);
      }
      return pdf;
    } catch (error) {
      if (res) {
        res.status(500).json({ error: 'Error al generar PDF' });
      }
      throw error;
    }
  }

  @Get('compliance/sat-agrupador-status')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  satAgrupadorStatus(@CurrentCompanyId() companyId: number | null) {
    return this.service.getSatAgrupadorStatus(companyId);
  }

  @Get('compliance/diot')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  diotReport(
    @Query('month') month: string,
    @Query('year') year: string,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.getDiotReport(+month, +year, companyId);
  }

  @Get('compliance/diot/csv')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  async diotReportCsv(
    @Query('month') month: string,
    @Query('year') year: string,
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
  ) {
    const report = await this.service.getDiotReport(+month, +year, companyId);
    const csv = this.service.getDiotReportCsv(report);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=diot-${year}-${String(month).padStart(2, '0')}.csv`);
    res.send('﻿' + csv);
  }

  @Get('compliance/catalogo-cuentas-xml')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  async catalogoCuentasXml(@CurrentCompanyId() companyId: number | null, @Res() res: Response) {
    const xml = await this.service.exportCatalogoCuentasXml(companyId);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=catalogo-cuentas-${new Date().toISOString().slice(0, 10)}.xml`);
    res.send(xml);
  }

  @Get('compliance/balanza-xml')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  async balanzaXml(
    @Query('month') month: string,
    @Query('year') year: string,
    @CurrentCompanyId() companyId: number | null,
    @Res() res: Response,
  ) {
    const xml = await this.service.exportBalanzaXml(+month, +year, companyId);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=balanza-${year}-${String(month).padStart(2, '0')}.xml`);
    res.send(xml);
  }

  @Get(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  findOne(@Param('id') id: string, @CurrentCompanyId() companyId: number | null) {
    return this.service.getAccount(+id, companyId);
  }

  @Patch(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_MANAGE] })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.updateAccount(+id, dto, companyId);
  }
}
