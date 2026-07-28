import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { AccountingService } from './accounting.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CreateBudgetDto } from './dto/account.dto.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

@Controller('accounting/budgets')
@UseGuards(UrlAccessGuard)
export class BudgetsController {
  constructor(private readonly service: AccountingService) {}

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_MANAGE] })
  create(@Body() dto: CreateBudgetDto, @CurrentCompanyId() companyId: number | null) {
    return this.service.createBudget(dto, companyId);
  }

  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  findAll(
    @CurrentCompanyId() companyId: number | null,
    @Query('costCenterId') costCenterId?: string,
    @Query('year') year?: string,
  ) {
    return this.service.listBudgets(
      {
        costCenterId: costCenterId ? +costCenterId : undefined,
        year: year ? +year : undefined,
      },
      companyId,
    );
  }

  @Get('vs-actual')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.ACCOUNTING_VIEW] })
  vsActual(
    @CurrentCompanyId() companyId: number | null,
    @Query('costCenterId') costCenterId: string,
    @Query('year') year: string,
  ) {
    return this.service.getBudgetVsActual(+costCenterId, +year, companyId);
  }
}
