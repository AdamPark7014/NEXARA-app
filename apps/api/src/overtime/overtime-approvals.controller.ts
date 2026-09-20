import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';
import { OvertimeApprovalsService } from './overtime-approvals.service.js';

@Controller()
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class OvertimeApprovalsController {
  constructor(private readonly service: OvertimeApprovalsService) {}

  @Get('overtime-approvals')
  @RBAC({
    anyPermissions: [
      PERMISSIONS.HR_VIEW,
      PERMISSIONS.HR_MANAGE,
      PERMISSIONS.CONTABILIDAD_VIEW,
      PERMISSIONS.CONTABILIDAD_MANAGE,
    ],
  })
  list(
    @CurrentCompanyId() companyId: number | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('estado') estado?: string,
    @Query('userId') userId?: string,
  ) {
    const parsed = userId ? Number(userId) : undefined;
    if (userId && Number.isNaN(parsed)) throw new BadRequestException('userId inválido');
    return this.service.list({ from, to, estado, userId: parsed }, companyId);
  }

  @Post('overtime-approvals/upsert-candidates')
  @RBAC({ anyPermissions: [PERMISSIONS.HR_MANAGE, PERMISSIONS.CONTABILIDAD_MANAGE] })
  upsertCandidates(
    @CurrentCompanyId() companyId: number | null,
    @Body() body: { from?: string; to?: string },
  ) {
    if (!body?.from || !body?.to) throw new BadRequestException('from y to requeridos');
    return this.service.upsertCandidates(body.from, body.to, companyId);
  }

  @Patch('overtime-approvals/:id/approve')
  @RBAC({ anyPermissions: [PERMISSIONS.HR_MANAGE, PERMISSIONS.CONTABILIDAD_MANAGE] })
  approve(
    @Param('id') id: string,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
    @Body() body?: { nota?: string },
  ) {
    return this.service.decide(+id, 'APROBADO', user.id, body?.nota, companyId);
  }

  @Patch('overtime-approvals/:id/reject')
  @RBAC({ anyPermissions: [PERMISSIONS.HR_MANAGE, PERMISSIONS.CONTABILIDAD_MANAGE] })
  reject(
    @Param('id') id: string,
    @CurrentUser() user: { id: number },
    @CurrentCompanyId() companyId: number | null,
    @Body() body?: { nota?: string },
  ) {
    return this.service.decide(+id, 'RECHAZADO', user.id, body?.nota, companyId);
  }

  @Get('attendance-rejections')
  @RBAC({ anyPermissions: [PERMISSIONS.HR_VIEW, PERMISSIONS.HR_MANAGE, PERMISSIONS.ATTENDANCE_MANAGE] })
  listRejections(
    @CurrentCompanyId() companyId: number | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
  ) {
    const parsed = userId ? Number(userId) : undefined;
    if (userId && Number.isNaN(parsed)) throw new BadRequestException('userId inválido');
    return this.service.listRejections({ from, to, userId: parsed }, companyId);
  }
}
