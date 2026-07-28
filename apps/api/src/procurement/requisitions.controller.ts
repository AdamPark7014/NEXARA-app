import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ProcurementService } from './procurement.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';

@Controller('procurement/requisitions')
@UseGuards(RbacGuard)
export class RequisitionsController {
  constructor(private readonly svc: ProcurementService) {}

  @Post()
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_REQUEST] })
  create(
    @Body() dto: any,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.createRequisition(dto, user.id, companyId);
  }

  @Get()
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_VIEW] })
  list(
    @CurrentCompanyId() companyId: number | null,
    @Query('status') status?: string,
    @Query('departmentId') deptId?: string,
    @Query() query?: PaginationQueryDto,
  ) {
    return this.svc.listRequisitions(
      { status, departmentId: deptId ? +deptId : undefined },
      query,
      companyId,
    );
  }

  @Get(':id')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_VIEW] })
  get(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.svc.getRequisition(id, companyId);
  }

  @Patch(':id/approve')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_APPROVE] })
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.approveRequisition(id, user.id, companyId);
  }

  @Patch(':id/reject')
  @RBAC({ permissions: [PERMISSIONS.PROCUREMENT_APPROVE] })
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.rejectRequisition(id, user.id, reason, companyId);
  }
}
