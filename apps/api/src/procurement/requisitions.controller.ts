import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ProcurementService } from './procurement.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('procurement/requisitions')
@UseGuards(RbacGuard)
export class RequisitionsController {
  constructor(private readonly svc: ProcurementService) {}

  @Post()
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_REQUEST] })
  create(@Body() dto: any, @CurrentUser() user: any) {
    return this.svc.createRequisition(dto, user.id);
  }

  @Get()
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_VIEW] })
  list(@Query('status') status?: string, @Query('departmentId') deptId?: string) {
    return this.svc.listRequisitions({ status, departmentId: deptId ? +deptId : undefined });
  }

  @Get(':id')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_VIEW] })
  get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getRequisition(id);
  }

  @Patch(':id/approve')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_APPROVE] })
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.approveRequisition(id, user.id);
  }

  @Patch(':id/reject')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_APPROVE] })
  reject(@Param('id', ParseIntPipe) id: number, @Body('reason') reason: string, @CurrentUser() user: any) {
    return this.svc.rejectRequisition(id, user.id, reason);
  }
}
