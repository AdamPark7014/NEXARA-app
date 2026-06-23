import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SalesTargetsService } from './sales-targets.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

const VIEW = [PERMISSIONS.SALES_TARGETS_VIEW, PERMISSIONS.SALES_TARGETS_MANAGE, PERMISSIONS.SALES_MANAGE, PERMISSIONS.CONSOLE_ADMIN];
const MANAGE = [PERMISSIONS.SALES_TARGETS_MANAGE, PERMISSIONS.CONSOLE_ADMIN];

@Controller('sales-targets')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class SalesTargetsController {
  constructor(private readonly service: SalesTargetsService) {}

  @Post()
  @RBAC({ anyPermissions: MANAGE })
  upsert(@Body() dto: any) {
    return this.service.upsert(dto);
  }

  @Get()
  @RBAC({ anyPermissions: VIEW })
  list(
    @Query('ownerId') ownerId?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.service.list({
      ownerId: ownerId ? +ownerId : undefined,
      year: year ? +year : undefined,
      month: month ? +month : undefined,
    });
  }

  @Get('performance')
  @RBAC({ anyPermissions: VIEW })
  performance(@Query('year') year?: string, @Query('month') month?: string) {
    return this.service.getPerformance(year ? +year : undefined, month ? +month : undefined);
  }

  @Delete(':id')
  @RBAC({ anyPermissions: MANAGE })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
