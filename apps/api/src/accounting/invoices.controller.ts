import { Controller, Get, Post, Param, Body, Query, UseGuards, Patch } from '@nestjs/common';
import { AccountingService } from './accounting.service.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('accounting/invoices')
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

  @Get('overdue')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_VIEW] })
  overdue() {
    return this.service.getOverdueInvoices();
  }

  @Get(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_VIEW] })
  findOne(@Param('id') id: string) {
    return this.service.getInvoice(+id);
  }

  @Post(':id/payments')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_MANAGE] })
  registerPayment(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: any) {
    return this.service.registerPayment({ ...dto, invoiceId: +id }, user.id);
  }

  @Patch(':id/cancel')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.INVOICING_MANAGE] })
  cancel(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: any) {
    return this.service.cancelInvoice(+id, dto, user.id);
  }
}
