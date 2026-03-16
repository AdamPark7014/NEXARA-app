import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { AccountingService } from './accounting.service.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('accounting/accounts')
export class AccountsController {
  constructor(private readonly service: AccountingService) {}

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_MANAGE] })
  create(@Body() dto: any) {
    return this.service.createAccount(dto);
  }

  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  findAll(@Query('type') type?: string, @Query('isActive') isActive?: string) {
    return this.service.listAccounts({
      type,
      isActive: isActive === undefined ? undefined : isActive === 'true',
    });
  }

  @Get('trial-balance')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  trialBalance(@Query('periodId') periodId?: string) {
    return this.service.getTrialBalance(periodId ? +periodId : undefined);
  }

  @Get('income-statement')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  incomeStatement(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.getIncomeStatement(from, to);
  }

  @Get('balance-sheet')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  balanceSheet(@Query('asOf') asOf?: string) {
    return this.service.getBalanceSheet(asOf);
  }

  @Get('cost-centers')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  listCostCenters() {
    return this.service.listCostCenters();
  }

  @Post('cost-centers')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_MANAGE] })
  createCostCenter(@Body() dto: any) {
    return this.service.createCostCenter(dto);
  }

  @Get('fiscal-periods')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  listPeriods() {
    return this.service.listFiscalPeriods();
  }

  @Post('fiscal-periods')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_MANAGE] })
  createPeriod(@Body() dto: any) {
    return this.service.createFiscalPeriod(dto);
  }

  @Patch('fiscal-periods/:id/close')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_CLOSE_PERIOD] })
  closePeriod(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.closeFiscalPeriod(+id, user.id);
  }

  @Get(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  findOne(@Param('id') id: string) {
    return this.service.getAccount(+id);
  }

  @Patch(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_MANAGE] })
  update(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateAccount(+id, dto);
  }
}
