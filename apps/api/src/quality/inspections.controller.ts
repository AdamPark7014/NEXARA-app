import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { QualityService } from './quality.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('quality/inspections')
@UseGuards(RbacGuard)
export class InspectionsController {
  constructor(private readonly svc: QualityService) {}

  @Post()
  @RBAC({ permissions: [PERMISSIONS.QUALITY_INSPECT] })
  create(@Body() dto: any, @CurrentUser() user: any) {
    return this.svc.createInspection(dto, user.id);
  }

  @Get()
  @RBAC({ permissions: [PERMISSIONS.QUALITY_VIEW] })
  list(@Query('result') result?: string, @Query('type') type?: string, @Query('productId') productId?: string) {
    return this.svc.listInspections({ result, type, productId: productId ? +productId : undefined });
  }

  @Get(':id')
  @RBAC({ permissions: [PERMISSIONS.QUALITY_VIEW] })
  get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getInspection(id);
  }

  @Patch(':id/checklist/:checkId')
  @RBAC({ permissions: [PERMISSIONS.QUALITY_INSPECT] })
  recordCheck(@Param('checkId', ParseIntPipe) checkId: number, @Body() dto: any) {
    return this.svc.recordCheckResult(checkId, dto);
  }

  @Patch(':id/complete')
  @RBAC({ permissions: [PERMISSIONS.QUALITY_INSPECT] })
  complete(@Param('id', ParseIntPipe) id: number, @Body('result') result: 'PASSED' | 'FAILED' | 'CONDITIONAL') {
    return this.svc.completeInspection(id, result);
  }
}
