import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { AccountingService } from './accounting.service.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('accounting/banking')
@UseGuards(UrlAccessGuard)
export class BankingController {
  constructor(private readonly service: AccountingService) {}

  @Post('accounts')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.BANKING_MANAGE] })
  createAccount(@Body() dto: any) {
    return this.service.createBankAccount(dto);
  }

  @Get('accounts')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.BANKING_VIEW] })
  listAccounts() {
    return this.service.listBankAccounts();
  }

  @Get('accounts/:id/summary')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.BANKING_VIEW] })
  accountSummary(@Param('id') id: string) {
    return this.service.getBankAccountSummary(+id);
  }

  @Get('accounts/:id/transactions')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.BANKING_VIEW] })
  listTransactions(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listBankTransactions(+id, { from, to });
  }

  @Post('accounts/:id/transactions/import')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.BANKING_MANAGE] })
  importTransactions(@Param('id') id: string, @Body() dto: { transactions: any[] }) {
    return this.service.importBankTransactions(+id, dto.transactions);
  }

  @Get('spei/:trackingKey')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.BANKING_VIEW] })
  findBySpei(@Param('trackingKey') trackingKey: string) {
    return this.service.findTransactionBySpei(trackingKey);
  }

  @Patch('transactions/:id/reconcile')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.BANKING_RECONCILE] })
  reconcile(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: any) {
    return this.service.reconcileTransaction(+id, dto, user.id);
  }
}
