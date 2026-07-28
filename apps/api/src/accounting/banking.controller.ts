import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { AccountingService } from './accounting.service.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
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
  createAccount(@Body() dto: CreateBankAccountDto, @CurrentCompanyId() companyId: number | null) {
    return this.service.createBankAccount({ ...dto, companyId });
  }

  @Get('accounts')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.BANKING_VIEW] })
  listAccounts(@CurrentCompanyId() companyId: number | null) {
    return this.service.listBankAccounts(companyId);
  }

  @Get('accounts/:id/summary')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.BANKING_VIEW] })
  accountSummary(@Param('id') id: string, @CurrentCompanyId() companyId: number | null) {
    return this.service.getBankAccountSummary(+id, companyId);
  }

  @Patch('accounts/:id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.BANKING_MANAGE] })
  updateAccount(
    @Param('id') id: string,
    @Body() dto: UpdateBankAccountDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.updateBankAccount(+id, dto, companyId);
  }

  @Get('accounts/:id/transactions')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.BANKING_VIEW] })
  listTransactions(
    @Param('id') id: string,
    @Query() query: ListBankTransactionsQueryDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.listBankTransactions(+id, { from: query.from, to: query.to }, query, companyId);
  }

  @Post('accounts/:id/transactions/import')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.BANKING_MANAGE] })
  importTransactions(
    @Param('id') id: string,
    @Body() dto: ImportBankTransactionsDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.importBankTransactions(+id, dto.transactions, companyId);
  }

  @Get('spei/:trackingKey')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.BANKING_VIEW] })
  findBySpei(
    @Param('trackingKey') trackingKey: string,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.findTransactionBySpei(trackingKey, companyId);
  }

  @Patch('transactions/:id/reconcile')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.BANKING_RECONCILE] })
  reconcile(
    @Param('id') id: string,
    @CurrentUser() user: { id: number },
    @Body() dto: ReconcileTransactionDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.reconcileTransaction(+id, dto, user.id, companyId);
  }
}
