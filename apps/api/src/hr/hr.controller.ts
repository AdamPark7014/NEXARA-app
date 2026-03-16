import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { HrService } from './hr.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';

@Controller('hr')
@UseGuards(RbacGuard)
export class HrController {
  constructor(private readonly svc: HrService) {}

  // ── Leave Requests ────────────────────────────────────────────────

  @Post('leaves')
  @RBAC({ permissions: [PERMISSIONS.HR_VIEW] })
  createLeave(@Body() dto: any, @CurrentUser() user: any) {
    return this.svc.createLeave(dto, user.id);
  }

  @Get('leaves')
  @RBAC({ permissions: [PERMISSIONS.HR_VIEW] })
  listLeaves(
    @Query() query: PaginationQueryDto,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('userId') userId?: string,
  ) {
    return this.svc.listLeaves(query, { status, type, userId: userId ? +userId : undefined });
  }

  @Get('leaves/balance/:userId')
  @RBAC({ permissions: [PERMISSIONS.HR_VIEW] })
  getLeaveBalance(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('year') year?: string,
  ) {
    return this.svc.getLeaveBalance(userId, year ? +year : undefined);
  }

  @Get('leaves/:id')
  @RBAC({ permissions: [PERMISSIONS.HR_VIEW] })
  getLeave(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getLeave(id);
  }

  @Patch('leaves/:id/approve')
  @RBAC({ permissions: [PERMISSIONS.HR_APPROVE_LEAVE] })
  approveLeave(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.approveLeave(id, user.id);
  }

  @Patch('leaves/:id/reject')
  @RBAC({ permissions: [PERMISSIONS.HR_APPROVE_LEAVE] })
  rejectLeave(
    @Param('id', ParseIntPipe) id: number,
    @Body('rejectionReason') rejectionReason: string,
    @CurrentUser() user: any,
  ) {
    return this.svc.rejectLeave(id, user.id, rejectionReason);
  }

  @Patch('leaves/:id/cancel')
  @RBAC({ permissions: [PERMISSIONS.HR_VIEW] })
  cancelLeave(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.cancelLeave(id, user.id);
  }

  // ── Performance Reviews ───────────────────────────────────────────

  @Post('reviews')
  @RBAC({ permissions: [PERMISSIONS.HR_MANAGE] })
  createReview(@Body() dto: any, @CurrentUser() user: any) {
    return this.svc.createReview(dto, user.id);
  }

  @Get('reviews')
  @RBAC({ permissions: [PERMISSIONS.HR_VIEW] })
  listReviews(
    @Query() query: PaginationQueryDto,
    @Query('period') period?: string,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('reviewerId') reviewerId?: string,
  ) {
    return this.svc.listReviews(query, {
      period, status,
      userId: userId ? +userId : undefined,
      reviewerId: reviewerId ? +reviewerId : undefined,
    });
  }

  @Get('reviews/:id')
  @RBAC({ permissions: [PERMISSIONS.HR_VIEW] })
  getReview(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getReview(id);
  }

  @Patch('reviews/:id')
  @RBAC({ permissions: [PERMISSIONS.HR_MANAGE] })
  updateReview(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.updateReview(id, dto);
  }

  @Patch('reviews/:id/submit')
  @RBAC({ permissions: [PERMISSIONS.HR_MANAGE] })
  submitReview(@Param('id', ParseIntPipe) id: number) {
    return this.svc.submitReview(id);
  }

  @Patch('reviews/:id/acknowledge')
  @RBAC({ permissions: [PERMISSIONS.HR_VIEW] })
  acknowledgeReview(@Param('id', ParseIntPipe) id: number) {
    return this.svc.acknowledgeReview(id);
  }

  // ── Dashboard ─────────────────────────────────────────────────────

  @Get('dashboard')
  @RBAC({ permissions: [PERMISSIONS.HR_VIEW] })
  getDashboard() {
    return this.svc.getDashboard();
  }
}
