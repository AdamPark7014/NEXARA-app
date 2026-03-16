import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('maintenance/assets')
@UseGuards(RbacGuard)
export class AssetsController {
  constructor(private readonly svc: MaintenanceService) {}

  @Post()
  @RBAC({ permissions: [PERMISSIONS.ASSETS_MANAGE] })
  create(@Body() dto: any) {
    return this.svc.createAsset(dto);
  }

  @Get()
  @RBAC({ permissions: [PERMISSIONS.ASSETS_VIEW] })
  list(@Query('status') status?: string, @Query('category') category?: string) {
    return this.svc.listAssets({ status, category });
  }

  @Get(':id')
  @RBAC({ permissions: [PERMISSIONS.ASSETS_VIEW] })
  get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getAsset(id);
  }

  @Patch(':id')
  @RBAC({ permissions: [PERMISSIONS.ASSETS_MANAGE] })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.updateAsset(id, dto);
  }

  @Post(':id/schedules')
  @RBAC({ permissions: [PERMISSIONS.MAINTENANCE_MANAGE] })
  createSchedule(@Param('id', ParseIntPipe) assetId: number, @Body() dto: any) {
    return this.svc.createSchedule({ ...dto, assetId });
  }

  @Get('schedules/all')
  @RBAC({ permissions: [PERMISSIONS.MAINTENANCE_VIEW] })
  listSchedules(@Query('assetId') assetId?: string) {
    return this.svc.listSchedules(assetId ? +assetId : undefined);
  }

  @Get('schedules/overdue')
  @RBAC({ permissions: [PERMISSIONS.MAINTENANCE_VIEW] })
  overdueSchedules() {
    return this.svc.getOverdueSchedules();
  }

  // ── Depreciation ──────────────────────────────────────────────────

  @Get('depreciation/summary')
  @RBAC({ permissions: [PERMISSIONS.ASSETS_VIEW] })
  depreciationSummary() {
    return this.svc.getDepreciationSummary();
  }

  @Get(':id/depreciation')
  @RBAC({ permissions: [PERMISSIONS.ASSETS_VIEW] })
  depreciation(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getAssetDepreciation(id);
  }
}
