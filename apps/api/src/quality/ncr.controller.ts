import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { QualityService } from './quality.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';

@Controller('quality/ncr')
@UseGuards(RbacGuard)
export class NcrController {
  constructor(private readonly svc: QualityService) {}

  @Post()
  @RBAC({ permissions: [PERMISSIONS.QUALITY_MANAGE] })
  create(@Body() dto: any, @CurrentUser() user: any) {
    return this.svc.createNCR(dto, user.id);
  }

  @Get()
  @RBAC({ permissions: [PERMISSIONS.QUALITY_VIEW] })
  list(@Query('status') status?: string, @Query('severity') severity?: string, @Query() query?: PaginationQueryDto) {
    return this.svc.listNCRs({ status, severity }, query);
  }

  @Get('dashboard')
  @RBAC({ permissions: [PERMISSIONS.QUALITY_VIEW] })
  dashboard() {
    return this.svc.getQualityDashboard();
  }

  @Patch(':id')
  @RBAC({ permissions: [PERMISSIONS.QUALITY_MANAGE] })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.updateNCR(id, dto);
  }

  @Patch(':id/assign')
  @RBAC({ permissions: [PERMISSIONS.QUALITY_MANAGE] })
  assign(@Param('id', ParseIntPipe) id: number, @Body('assignedToId') assignedToId: number) {
    return this.svc.assignNCR(id, assignedToId);
  }

  @Patch(':id/corrective-action')
  @RBAC({ permissions: [PERMISSIONS.QUALITY_MANAGE] })
  submitCapa(@Param('id', ParseIntPipe) id: number, @Body() dto: { correctiveAction: string; preventiveAction?: string }) {
    return this.svc.submitCorrectiveAction(id, dto.correctiveAction, dto.preventiveAction);
  }

  @Patch(':id/resolve')
  @RBAC({ permissions: [PERMISSIONS.QUALITY_MANAGE] })
  resolve(@Param('id', ParseIntPipe) id: number) {
    return this.svc.resolveNCR(id);
  }

  @Patch(':id/close')
  @RBAC({ permissions: [PERMISSIONS.QUALITY_MANAGE] })
  close(@Param('id', ParseIntPipe) id: number) {
    return this.svc.closeNCR(id);
  }
}
