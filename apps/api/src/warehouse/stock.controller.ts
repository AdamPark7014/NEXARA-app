import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { WarehouseService } from './warehouse.service.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('stock')
@UseGuards(UrlAccessGuard)
export class StockController {
  constructor(private readonly service: WarehouseService) {}

  @Get('levels')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_VIEW] })
  getLevels(
    @CurrentCompanyId() companyId: number | null,
    @Query('warehouseId') warehouseId?: string,
    @Query('productId') productId?: string,
    @Query('belowReorder') belowReorder?: string,
  ) {
    return this.service.getStockLevels({
      warehouseId: warehouseId ? +warehouseId : undefined,
      productId: productId ? +productId : undefined,
      belowReorder: belowReorder === 'true',
      companyId,
    });
  }

  @Get('levels/:id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_VIEW] })
  getLevel(@Param('id') id: string, @CurrentCompanyId() companyId: number | null) {
    return this.service.getStockLevel(+id, companyId);
  }

  @Patch('levels/:id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_MANAGE] })
  updateConfig(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.updateStockConfig(+id, dto, companyId);
  }

  @Post('movements')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_MANAGE] })
  createMovement(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Body() dto: any) {
    return this.service.createStockMovement(dto, user.id, companyId);
  }

  @Get('movements')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_VIEW] })
  listMovements(
    @CurrentCompanyId() companyId: number | null,
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
    }, companyId);
  }

  @Post('lots')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_MANAGE] })
  createLot(@CurrentCompanyId() companyId: number | null, @Body() dto: any) {
    return this.service.createLot(dto, companyId);
  }

  @Get('lots')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_VIEW] })
  listLots(@CurrentCompanyId() companyId: number | null, @Query('productId') productId?: string) {
    return this.service.listLots(productId ? +productId : undefined, companyId);
  }

  @Get('insights')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_VIEW] })
  inventoryInsights(@CurrentCompanyId() companyId: number | null) {
    return this.service.getInventoryInsights(companyId);
  }

  @Get('valuation')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_VIEW] })
  valuation(
    @CurrentCompanyId() companyId: number | null,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.service.getStockValuation(warehouseId ? +warehouseId : undefined, companyId);
  }

  @Get('alerts/low-stock')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_VIEW] })
  lowStockAlerts(@CurrentCompanyId() companyId: number | null) {
    return this.service.getLowStockAlerts(companyId);
  }

  // ── Cycle Counts ──────────────────────────────────────────────────
  @Post('cycle-counts')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_MANAGE] })
  scheduleCycleCount(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null, @Body() dto: any) {
    return this.service.scheduleCycleCount(dto, user.id, companyId);
  }

  @Get('cycle-counts')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_VIEW] })
  listCycleCounts(
    @CurrentCompanyId() companyId: number | null,
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listCycleCounts({
      warehouseId: warehouseId ? +warehouseId : undefined,
      status,
      companyId,
    });
  }

  @Get('cycle-counts/:id')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_VIEW] })
  getCycleCount(@Param('id') id: string, @CurrentCompanyId() companyId: number | null) {
    return this.service.getCycleCount(+id, companyId);
  }

  @Post('cycle-counts/:id/items')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_MANAGE] })
  recordCycleCountItems(
    @Param('id') id: string,
    @Body() dto: { items: { productId: number; countedQty: number }[] },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.recordCycleCountItems(+id, dto.items, companyId);
  }

  @Post('cycle-counts/:id/close')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_MANAGE] })
  closeCycleCount(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.closeCycleCount(+id, user.id, companyId);
  }

  @Post('cycle-counts/:id/cancel')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_MANAGE] })
  cancelCycleCount(@Param('id') id: string, @CurrentCompanyId() companyId: number | null) {
    return this.service.cancelCycleCount(+id, companyId);
  }

  // ── Stock Reservations ────────────────────────────────────────────
  @Post('reservations')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_MANAGE] })
  createReservation(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createReservation(dto, user.id);
  }

  @Get('reservations')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_VIEW] })
  listReservations(
    @CurrentCompanyId() companyId: number | null,
    @Query('productId') productId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listReservations({
      productId: productId ? +productId : undefined,
      warehouseId: warehouseId ? +warehouseId : undefined,
      status,
      companyId,
    });
  }

  @Patch('reservations/:id/release')
  @UseGuards(RbacGuard)
  @RBAC({ permissions: [PERMISSIONS.STOCK_MANAGE] })
  releaseReservation(
    @Param('id') id: string,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.releaseReservation(+id, companyId);
  }
}
