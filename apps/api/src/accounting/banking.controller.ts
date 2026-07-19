import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { AccountingService } from './accounting.service.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import {
  CreateBankAccountDto,
  ImportBankTransactionsDto,
  ReconcileTransactionDto,
  UpdateBankAccountDto,
} from './dto/banking.dto.js';
import { ListBankTransactionsQueryDto } from './dto/list-query.dto.js';

@Controller('accounting/banking')
@UseGuards(UrlAccessGuard)
export class BankingController {
  constructor(private readonly service: AccountingService) {}

  @Post('accounts')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.BANKING_MANAGE] })
  createAccount(@Body() dto: CreateBankAccountDto) {
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

  @Patch('accounts/:id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.BANKING_MANAGE] })
  updateAccount(@Param('id') id: string, @Body() dto: UpdateBankAccountDto) {
    return this.service.updateBankAccount(+id, dto);
  }

  @Get('accounts/:id/transactions')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.BANKING_VIEW] })
  listTransactions(@Param('id') id: string, @Query() query: ListBankTransactionsQueryDto) {
    return this.service.listBankTransactions(+id, { from: query.from, to: query.to }, query);
  }

  @Post('accounts/:id/transactions/import')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.BANKING_MANAGE] })
  importTransactions(@Param('id') id: string, @Body() dto: ImportBankTransactionsDto) {
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
  reconcile(
    @Param('id') id: string,
    @CurrentUser() user: { id: number },
    @Body() dto: ReconcileTransactionDto,
  ) {
    return this.service.reconcileTransaction(+id, dto, user.id);
  }
}
