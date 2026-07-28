import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { WarehouseService } from './warehouse.service.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('warehouse')
@UseGuards(UrlAccessGuard)
export class WarehouseController {
  constructor(private readonly service: WarehouseService) {}

  @Post()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.WAREHOUSE_MANAGE] })
  create(@Body() dto: any, @CurrentCompanyId() companyId: number | null) {
    return this.service.createWarehouse({ ...dto, companyId });
  }

  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.WAREHOUSE_VIEW] })
  findAll(@CurrentCompanyId() companyId: number | null) {
    return this.service.listWarehouses(companyId);
  }

  @Get(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.WAREHOUSE_VIEW] })
  findOne(@Param('id') id: string, @CurrentCompanyId() companyId: number | null) {
    return this.service.getWarehouse(+id, companyId);
  }

  @Patch(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.WAREHOUSE_MANAGE] })
  update(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.updateWarehouse(+id, dto, companyId);
  }

  @Post(':id/locations')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.WAREHOUSE_MANAGE] })
  createLocation(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.createLocation(+id, dto, companyId);
  }

  @Get(':id/locations')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.WAREHOUSE_VIEW] })
  listLocations(@Param('id') id: string) {
    return this.service.listLocations(+id);
  }
}
