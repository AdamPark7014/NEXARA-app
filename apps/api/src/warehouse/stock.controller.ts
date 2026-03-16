import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { WarehouseService } from './warehouse.service.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('stock')
export class StockController {
  constructor(private readonly service: WarehouseService) {}

  @Get('levels')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_VIEW] })
  getLevels(
    @Query('warehouseId') warehouseId?: string,
    @Query('productId') productId?: string,
    @Query('belowReorder') belowReorder?: string,
  ) {
    return this.service.getStockLevels({
      warehouseId: warehouseId ? +warehouseId : undefined,
      productId: productId ? +productId : undefined,
      belowReorder: belowReorder === 'true',
    });
  }

  @Get('levels/:id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_VIEW] })
  getLevel(@Param('id') id: string) {
    return this.service.getStockLevel(+id);
  }

  @Patch('levels/:id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_MANAGE] })
  updateConfig(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateStockConfig(+id, dto);
  }

  @Post('movements')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_MANAGE] })
  createMovement(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createStockMovement(dto, user.id);
  }

  @Get('movements')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_VIEW] })
  listMovements(
    @Query('productId') productId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listStockMovements({
      productId: productId ? +productId : undefined,
      warehouseId: warehouseId ? +warehouseId : undefined,
      type, from, to,
    });
  }

  @Post('lots')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_MANAGE] })
  createLot(@Body() dto: any) {
    return this.service.createLot(dto);
  }

  @Get('lots')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_VIEW] })
  listLots(@Query('productId') productId?: string) {
    return this.service.listLots(productId ? +productId : undefined);
  }

  @Get('valuation')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_VIEW] })
  valuation(@Query('warehouseId') warehouseId?: string) {
    return this.service.getStockValuation(warehouseId ? +warehouseId : undefined);
  }

  @Get('alerts/low-stock')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_VIEW] })
  lowStockAlerts() {
    return this.service.getLowStockAlerts();
  }
}
