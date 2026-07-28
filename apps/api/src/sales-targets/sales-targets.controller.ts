import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SalesTargetsService } from './sales-targets.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

const VIEW = [PERMISSIONS.SALES_TARGETS_VIEW, PERMISSIONS.SALES_TARGETS_MANAGE, PERMISSIONS.SALES_MANAGE, PERMISSIONS.CONSOLE_ADMIN];
const MANAGE = [PERMISSIONS.SALES_TARGETS_MANAGE, PERMISSIONS.CONSOLE_ADMIN];

@Controller('sales-targets')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class SalesTargetsController {
  constructor(private readonly service: SalesTargetsService) {}

  @Post()
  @RBAC({ anyPermissions: MANAGE })
  upsert(@Body() dto: any, @CurrentCompanyId() companyId: number | null) {
    return this.service.upsert(dto, companyId);
  }

  @Get()
  @RBAC({ anyPermissions: VIEW })
  list(
    @CurrentCompanyId() companyId: number | null,
    @Query('ownerId') ownerId?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.service.list(
      {
        ownerId: ownerId ? +ownerId : undefined,
        year: year ? +year : undefined,
        month: month ? +month : undefined,
      },
      companyId,
    );
  }

  @Get('performance')
  @RBAC({ anyPermissions: VIEW })
  performance(
    @CurrentCompanyId() companyId: number | null,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.service.getPerformance(
      year ? +year : undefined,
      month ? +month : undefined,
      companyId,
    );
  }

  @Delete(':id')
  @RBAC({ anyPermissions: MANAGE })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.service.remove(id, companyId);
  }
}
