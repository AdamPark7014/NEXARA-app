import { Controller, Get, Post, Param, Body, Query, UseGuards, Patch, Delete } from '@nestjs/common';
import { AccountingService } from './accounting.service.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('accounting/invoices')
@UseGuards(UrlAccessGuard)
export class InvoicesController {
  constructor(private readonly service: AccountingService) {}

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_MANAGE] })
  create(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createInvoice(dto, user.id);
  }

  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_VIEW] })
  findAll(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listInvoices({ type, status, from, to });
  }

  @Get('dashboard')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_VIEW] })
  dashboard() {
    return this.service.getInvoiceDashboard();
  }

  @Get('financial-dashboard')
  @UseGuards(RbacGuard)
  @RBAC({ anyPermissions: [PERMISSIONS.INVOICING_VIEW, PERMISSIONS.CONTABILIDAD_VIEW, PERMISSIONS.CONSOLE_ADMIN] })
  financialDashboard() {
    return this.service.getFinancialDashboard();
  }

  @Get('issuer-profile')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_VIEW] })
  issuerProfile() {
    return this.service.getInvoiceIssuerProfile();
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
  overdue() {
    return this.service.getOverdueInvoices();
  }

  @Post('from-sales-project/:projectId')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_MANAGE] })
  createFromSalesProject(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
    @Body() body?: { lineIds?: number[] },
  ) {
    return this.service.createInvoiceFromSalesProject(+projectId, user.id, body);
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
  stampPaymentComplement(@Param('paymentId') paymentId: string, @CurrentUser() user: any) {
    return this.service.stampPaymentComplement(+paymentId, user.id);
  }

  @Get(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_VIEW] })
  findOne(@Param('id') id: string) {
    return this.service.getInvoice(+id);
  }

  @Patch(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_MANAGE] })
  updateDraft(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateInvoiceDraft(+id, dto);
  }

  @Post(':id/payments')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_MANAGE] })
  registerPayment(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: any) {
    return this.service.registerPayment({ ...dto, invoiceId: +id }, user.id);
  }

  @Post(':id/stamp')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_MANAGE] })
  stamp(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.stampInvoice(+id, user.id);
  }

  @Post(':id/credit-note')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_MANAGE] })
  createCreditNote(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: any) {
    return this.service.createCreditNote(+id, dto, user.id);
  }

  @Get(':id/sat-status')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_VIEW] })
  satStatus(@Param('id') id: string) {
    return this.service.queryCfdiStatus(+id);
  }

  @Patch(':id/cancel')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_MANAGE] })
  cancel(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: any) {
    return this.service.cancelInvoice(+id, dto, user.id);
  }

  @Delete(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_MANAGE] })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.deleteInvoice(+id, user.id);
  }
}
