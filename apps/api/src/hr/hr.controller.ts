import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, ParseIntPipe, ForbiddenException } from '@nestjs/common';
import { HrService } from './hr.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

@Controller('hr')
@UseGuards(UrlAccessGuard, RbacGuard)
export class HrController {
  constructor(private readonly svc: HrService) {}

  // ── Leave Requests ────────────────────────────────────────────────

  @Post('leaves')
  @RBAC({ anyPermissions: [PERMISSIONS.HR_VIEW, PERMISSIONS.PEOPLE_VIEW] })
  createLeave(
    @Body() dto: any,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    const userPermissions: string[] = user.permissions || [];
    const isHrStaff = userPermissions.includes(PERMISSIONS.HR_VIEW) || userPermissions.includes(PERMISSIONS.HR_MANAGE) || user.isSuperAdmin;
    if (!isHrStaff) {
      dto = { ...dto, userId: user.id };
    }
    return this.svc.createLeave(dto, user.id, companyId);
  }

  @Get('leaves')
  @RBAC({ anyPermissions: [PERMISSIONS.HR_VIEW, PERMISSIONS.PEOPLE_VIEW] })
  listLeaves(
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('userId') userId?: string,
  ) {
    const userPermissions: string[] = user.permissions || [];
    const isHrStaff = userPermissions.includes(PERMISSIONS.HR_VIEW) || userPermissions.includes(PERMISSIONS.HR_MANAGE) || user.isSuperAdmin;
    const effectiveUserId = isHrStaff ? (userId ? +userId : undefined) : user.id;
    return this.svc.listLeaves(companyId, query, { status, type, userId: effectiveUserId });
  }

  @Get('leaves/balance/:userId')
  @RBAC({ anyPermissions: [PERMISSIONS.HR_VIEW, PERMISSIONS.PEOPLE_VIEW] })
  getLeaveBalance(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
    @Query('year') year?: string,
  ) {
    const userPermissions: string[] = user.permissions || [];
    const isHrStaff = userPermissions.includes(PERMISSIONS.HR_VIEW) || userPermissions.includes(PERMISSIONS.HR_MANAGE) || user.isSuperAdmin;
    if (!isHrStaff && userId !== user.id) {
      throw new ForbiddenException('Solo puedes consultar tu propio balance');
    }
    return this.svc.getLeaveBalance(userId, companyId, year ? +year : undefined);
  }

  @Get('leaves/:id')
  @RBAC({ anyPermissions: [PERMISSIONS.HR_VIEW, PERMISSIONS.PEOPLE_VIEW] })
  getLeave(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.svc.getLeave(id, companyId);
  }

  @Patch('leaves/:id/approve')
  @RBAC({ permissions: [PERMISSIONS.HR_APPROVE_LEAVE] })
  approveLeave(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.approveLeave(id, user.id, companyId);
  }

  @Patch('leaves/:id/reject')
  @RBAC({ permissions: [PERMISSIONS.HR_APPROVE_LEAVE] })
  rejectLeave(
    @Param('id', ParseIntPipe) id: number,
    @Body('rejectionReason') rejectionReason: string,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.rejectLeave(id, user.id, rejectionReason, companyId);
  }

  @Patch('leaves/:id/cancel')
  @RBAC({ anyPermissions: [PERMISSIONS.HR_VIEW, PERMISSIONS.PEOPLE_VIEW] })
  cancelLeave(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.cancelLeave(id, user.id, companyId);
  }

  // ── Performance Reviews ───────────────────────────────────────────

  @Post('reviews')
  @RBAC({ permissions: [PERMISSIONS.HR_MANAGE] })
  createReview(
    @Body() dto: any,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.createReview(dto, user.id, companyId);
  }

  @Get('reviews')
  @RBAC({ permissions: [PERMISSIONS.HR_VIEW] })
  listReviews(
    @Query() query: PaginationQueryDto,
    @CurrentCompanyId() companyId: number | null,
    @Query('period') period?: string,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('reviewerId') reviewerId?: string,
  ) {
    return this.svc.listReviews(
      query,
      {
        period,
        status,
        userId: userId ? +userId : undefined,
        reviewerId: reviewerId ? +reviewerId : undefined,
      },
      companyId,
    );
  }

  @Get('reviews/:id')
  @RBAC({ permissions: [PERMISSIONS.HR_VIEW] })
  getReview(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.svc.getReview(id, companyId);
  }

  @Patch('reviews/:id')
  @RBAC({ permissions: [PERMISSIONS.HR_MANAGE] })
  updateReview(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.svc.updateReview(id, dto, companyId);
  }

  @Patch('reviews/:id/submit')
  @RBAC({ permissions: [PERMISSIONS.HR_MANAGE] })
  submitReview(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.svc.submitReview(id, companyId);
  }

  @Patch('reviews/:id/acknowledge')
  @RBAC({ permissions: [PERMISSIONS.HR_VIEW] })
  acknowledgeReview(@Param('id', ParseIntPipe) id: number, @CurrentCompanyId() companyId: number | null) {
    return this.svc.acknowledgeReview(id, companyId);
  }

  // ── Dashboard ─────────────────────────────────────────────────────

  @Get('dashboard')
  @RBAC({ permissions: [PERMISSIONS.HR_VIEW] })
  getDashboard(@CurrentCompanyId() companyId: number | null) {
    return this.svc.getDashboard(companyId);
  }
}
