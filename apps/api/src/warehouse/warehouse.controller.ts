import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { WarehouseService } from './warehouse.service.js';
import { CurrentUser } from '../common/current-user.decorator.js';
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
  create(@Body() dto: any) {
    return this.service.createWarehouse(dto);
  }

  @Get()
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.WAREHOUSE_VIEW] })
  findAll() {
    return this.service.listWarehouses();
  }

  @Get(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.WAREHOUSE_VIEW] })
  findOne(@Param('id') id: string) {
    return this.service.getWarehouse(+id);
  }

  @Patch(':id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.WAREHOUSE_MANAGE] })
  update(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateWarehouse(+id, dto);
  }

  @Post(':id/locations')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.WAREHOUSE_MANAGE] })
  createLocation(@Param('id') id: string, @Body() dto: any) {
    return this.service.createLocation(+id, dto);
  }

  @Get(':id/locations')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.WAREHOUSE_VIEW] })
  listLocations(@Param('id') id: string) {
    return this.service.listLocations(+id);
  }
}
