import { Controller, Get, Post, Param, Body, Query, UseGuards, Patch, Delete, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AccountingService } from './accounting.service.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import {
  CancelInvoiceDto,
  CreateCreditNoteDto,
  CreateInvoiceDto,
  RegisterPaymentDto,
  UpdateInvoiceDraftDto,
} from './dto/invoice.dto.js';
import { ListInvoicesQueryDto } from './dto/list-query.dto.js';

@Controller('accounting/invoices')
@UseGuards(UrlAccessGuard)
export class InvoicesController {
  constructor(private readonly service: AccountingService) {}

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_MANAGE] })
  create(
    @CurrentUser() user: { id: number },
    @Body() dto: CreateInvoiceDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.createInvoice({ ...dto, companyId: dto.companyId ?? companyId }, user.id);
  }

  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_VIEW] })
  findAll(@Query() query: ListInvoicesQueryDto, @CurrentCompanyId() companyId: number | null) {
    return this.service.listInvoices(
      { type: query.type, status: query.status, from: query.from, to: query.to, companyId },
      query,
    );
  }

  @Get('dashboard')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_VIEW] })
  dashboard(@CurrentCompanyId() companyId: number | null) {
    return this.service.getInvoiceDashboard(companyId);
  }

  @Get('financial-dashboard')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.INVOICING_VIEW, PERMISSIONS.CONTABILIDAD_VIEW, PERMISSIONS.CONSOLE_ADMIN] })
  financialDashboard(@CurrentCompanyId() companyId: number | null) {
    return this.service.getFinancialDashboard(companyId);
  }

  @Get('insights')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.INVOICING_VIEW, PERMISSIONS.CONTABILIDAD_VIEW, PERMISSIONS.CONSOLE_ADMIN] })
  financeInsights(@CurrentCompanyId() companyId: number | null) {
    return this.service.getFinanceInsights(companyId);
  }

  @Get('issuer-profile')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_VIEW] })
  issuerProfile(@CurrentCompanyId() companyId: number | null) {
    return this.service.getInvoiceIssuerProfile(companyId ?? undefined);
  }

  @Get('pac-info')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_VIEW] })
  pacInfo() {
    return this.service.getPacInfo();
  }

  @Get('overdue')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_VIEW] })
  overdue(@CurrentCompanyId() companyId: number | null) {
    return this.service.getOverdueInvoices(companyId);
  }

  @Post('from-sales-project/:projectId')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_MANAGE] })
  createFromSalesProject(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
    @Body() body?: { lineIds?: number[] },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.createInvoiceFromSalesProject(+projectId, user.id, body, companyId);
  }

  @Get('sat/descarga-masiva')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_VIEW] })
  descargaMasivaStatus() {
    return this.service.descargaMasivaStatus();
  }

  @Get('sat/validate-rfc/:rfc')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_VIEW] })
  validateRfc(@Param('rfc') rfc: string) {
    return this.service.validateRfc(rfc);
  }

  @Post('payments/:paymentId/stamp-complement')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_MANAGE] })
  stampPaymentComplement(
    @Param('paymentId') paymentId: string,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.stampPaymentComplement(+paymentId, user.id, companyId);
  }

  @Get(':id/xml')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_VIEW] })
  async getXml(@Param('id') id: string, @Res() res: Response) {
    const xml = await this.service.getInvoiceXml(+id);
    res.setHeader('Content-Type', xml.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${xml.filename}"`);
    res.send(xml.body);
  }

  @Get(':id/pdf')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_VIEW] })
  async getPdf(@Param('id') id: string, @Res() res: Response) {
    const pdf = await this.service.getInvoicePdf(+id);
    res.redirect(pdf.url);
  }

  @Get(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_VIEW] })
  findOne(@Param('id') id: string, @CurrentCompanyId() companyId: number | null) {
    return this.service.getInvoice(+id, companyId);
  }

  @Patch(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_MANAGE] })
  updateDraft(
    @Param('id') id: string,
    @CurrentUser() user: { id: number },
    @Body() dto: UpdateInvoiceDraftDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.updateInvoiceDraft(+id, dto, user.id, companyId);
  }

  @Post(':id/match/evaluate')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_MANAGE] })
  evaluateMatch(@Param('id') id: string, @CurrentUser() user: { id: number }) {
    return this.service.evaluateThreeWayMatch(+id, user.id);
  }

  @Post(':id/match/waive')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_MANAGE] })
  waiveMatch(
    @Param('id') id: string,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
    @Body() body?: { notes?: string },
  ) {
    return this.service.waiveThreeWayMatch(+id, user.id, body?.notes, companyId);
  }

  @Post(':id/payments')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_MANAGE] })
  registerPayment(
    @Param('id') id: string,
    @CurrentUser() user: { id: number },
    @Body() dto: RegisterPaymentDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.registerPayment({ ...dto, invoiceId: +id }, user.id, companyId);
  }

  @Post(':id/stamp')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_MANAGE] })
  stamp(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.stampInvoice(+id, user.id, companyId);
  }

  @Post(':id/credit-note')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_MANAGE] })
  createCreditNote(
    @Param('id') id: string,
    @CurrentUser() user: { id: number },
    @Body() dto: CreateCreditNoteDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.createCreditNote(+id, dto, user.id, companyId);
  }

  @Get(':id/sat-status')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_VIEW] })
  satStatus(@Param('id') id: string, @CurrentCompanyId() companyId: number | null) {
    return this.service.queryCfdiStatus(+id, companyId);
  }

  @Patch(':id/cancel')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_MANAGE] })
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: { id: number },
    @Body() dto: CancelInvoiceDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.cancelInvoice(+id, dto, user.id, companyId);
  }

  @Delete(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_MANAGE] })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.deleteInvoice(+id, user.id, companyId);
  }
}
