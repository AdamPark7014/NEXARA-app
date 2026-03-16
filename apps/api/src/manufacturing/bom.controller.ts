import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ManufacturingService } from './manufacturing.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('manufacturing/bom')
@UseGuards(RbacGuard)
export class BomController {
  constructor(private readonly svc: ManufacturingService) {}

  @Post()
  @RBAC({ permissions: [PERMISSIONS.BOM_MANAGE] })
  create(@Body() dto: any) {
    return this.svc.createBOM(dto);
  }

  @Get()
  @RBAC({ permissions: [PERMISSIONS.MANUFACTURING_VIEW] })
  list(@Query('productId') productId?: string) {
    return this.svc.listBOMs(productId ? +productId : undefined);
  }

  @Get(':id')
  @RBAC({ permissions: [PERMISSIONS.MANUFACTURING_VIEW] })
  get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getBOM(id);
  }

  @Post('work-centers')
  @RBAC({ permissions: [PERMISSIONS.MANUFACTURING_MANAGE] })
  createWorkCenter(@Body() dto: any) {
    return this.svc.createWorkCenter(dto);
  }

  @Get('work-centers/all')
  @RBAC({ permissions: [PERMISSIONS.MANUFACTURING_VIEW] })
  listWorkCenters() {
    return this.svc.listWorkCenters();
  }

  @Post(':id/routings')
  @RBAC({ permissions: [PERMISSIONS.BOM_MANAGE] })
  createRouting(@Param('id', ParseIntPipe) bomId: number, @Body() dto: any) {
    return this.svc.createRouting({ ...dto, bomId });
  }

  @Get(':id/routings')
  @RBAC({ permissions: [PERMISSIONS.MANUFACTURING_VIEW] })
  listRoutings(@Param('id', ParseIntPipe) bomId: number) {
    return this.svc.listRoutings(bomId);
  }
}
