import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { AccountingService } from './accounting.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('accounting/budgets')
export class BudgetsController {
  constructor(private readonly service: AccountingService) {}

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_MANAGE] })
  create(@Body() dto: any) {
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
