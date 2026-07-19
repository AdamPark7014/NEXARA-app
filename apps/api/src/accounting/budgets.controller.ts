import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { AccountingService } from './accounting.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CreateBudgetDto } from './dto/account.dto.js';

@Controller('accounting/budgets')
@UseGuards(UrlAccessGuard)
export class BudgetsController {
  constructor(private readonly service: AccountingService) {}

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_MANAGE] })
  create(@Body() dto: CreateBudgetDto) {
    return this.service.createBudget(dto);
  }

  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  findAll(@Query('costCenterId') costCenterId?: string, @Query('year') year?: string) {
    return this.service.listBudgets({
      costCenterId: costCenterId ? +costCenterId : undefined,
      year: year ? +year : undefined,
    });
  }

  @Get('vs-actual')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  vsActual(@Query('costCenterId') costCenterId: string, @Query('year') year: string) {
    return this.service.getBudgetVsActual(+costCenterId, +year);
  }
}
