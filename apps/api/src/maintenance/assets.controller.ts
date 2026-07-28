import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

@Controller('maintenance/assets')
@UseGuards(RbacGuard)
export class AssetsController {
  constructor(private readonly svc: MaintenanceService) {}

  @Post()
  @RBAC({ permissions: [PERMISSIONS.ASSETS_MANAGE] })
  create(@Body() dto: any, @CurrentCompanyId() companyId: number | null) {
    return this.svc.createAsset(dto, companyId);
  }

  @Get()
  @RBAC({ permissions: [PERMISSIONS.ASSETS_VIEW] })
  list(
    @CurrentCompanyId() companyId: number | null,
    @Query('status') status?: string,
    @Query('category') category?: string,
  ) {
    return this.svc.listAssets(companyId, { status, category });
  }

  @Get('intelligence')
  @RBAC({ permissions: [PERMISSIONS.ASSETS_VIEW] })
  intelligence(@CurrentCompanyId() companyId: number | null) {
    return this.svc.getCmmsIntelligence(companyId);
  }

  @Get('schedules/all')
  @RBAC({ permissions: [PERMISSIONS.MAINTENANCE_VIEW] })
  listSchedules(@CurrentCompanyId() companyId: number | null, @Query('assetId') assetId?: string) {
    return this.svc.listSchedules(companyId, assetId ? +assetId : undefined);
  }

  @Get('schedules/overdue')
  @RBAC({ permissions: [PERMISSIONS.MAINTENANCE_VIEW] })
  overdueSchedules(@CurrentCompanyId() companyId: number | null) {
    return this.svc.getOverdueSchedules(companyId);
  }

  @Get('depreciation/summary')
  @RBAC({ permissions: [PERMISSIONS.ASSETS_VIEW] })
  depreciationSummary(@CurrentCompanyId() companyId: number | null) {
    return this.svc.getDepreciationSummary(companyId);
  }

  @Get(':id')
  @RBAC({ permissions: [PERMISSIONS.ASSETS_VIEW] })
  get(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.svc.getAsset(id, companyId);
  }

  @Patch(':id')
  @RBAC({ permissions: [PERMISSIONS.ASSETS_MANAGE] })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.updateAsset(id, dto, companyId);
  }

  @Post(':id/schedules')
  @RBAC({ permissions: [PERMISSIONS.MAINTENANCE_MANAGE] })
  createSchedule(
    @Param('id', ParseIntPipe) assetId: number,
    @Body() dto: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.createSchedule({ ...dto, assetId }, companyId);
  }

  @Get(':id/depreciation')
  @RBAC({ permissions: [PERMISSIONS.ASSETS_VIEW] })
  depreciation(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.svc.getAssetDepreciation(id, companyId);
  }
}
