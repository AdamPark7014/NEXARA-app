import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ClientTicketStatus } from '@prisma/client';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { UrlAccessGuard } from '../common/rbac/url-access.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { ClientTicketRequestsService } from './client-ticket-requests.service.js';
import { ClientTicketRequestsQueryDto } from './dto/client-ticket-requests-query.dto.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

@Controller('client-ticket-requests')
@UseGuards(UrlAccessGuard, RbacGuard)
export class ClientTicketRequestsController {
  constructor(private readonly service: ClientTicketRequestsService) {}

  private normalizeStatus(value?: string) {
    if (!value) return undefined;
    const normalized = value.toUpperCase();
    return (Object.values(ClientTicketStatus) as string[]).includes(normalized)
      ? (normalized as ClientTicketStatus)
      : undefined;
  }

  @Get()
  @RBAC({
    anyPermissions: [
      PERMISSIONS.CONSOLE_ADMIN,
      PERMISSIONS.SUPPORT_VIEW,
      PERMISSIONS.SUPPORT_MANAGE,
      PERMISSIONS.ACTIVITIES_VIEW,
      PERMISSIONS.ACTIVITIES_MANAGE,
    ],
  })
  findAll(
    @Query() query: ClientTicketRequestsQueryDto,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.findAll(this.normalizeStatus(query.status), query, companyId);
  }

  @Get(':id')
  @RBAC({
    anyPermissions: [
      PERMISSIONS.CONSOLE_ADMIN,
      PERMISSIONS.SUPPORT_VIEW,
      PERMISSIONS.SUPPORT_MANAGE,
      PERMISSIONS.ACTIVITIES_VIEW,
      PERMISSIONS.ACTIVITIES_MANAGE,
    ],
  })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.findOne(id, companyId);
  }

  @Patch(':id/assign')
  @RBAC({
    anyPermissions: [PERMISSIONS.ACTIVITIES_MANAGE, PERMISSIONS.SUPPORT_MANAGE, PERMISSIONS.CONSOLE_ADMIN],
  })
  assign(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { activityId?: number },
    @CurrentCompanyId() companyId: number | null,
  ) {
    const activityId = Number(body.activityId);
    if (!activityId || Number.isNaN(activityId)) {
      throw new BadRequestException('activityId invalido');
    }
    return this.service.assign(id, activityId, companyId);
  }

  @Patch(':id/status')
  @RBAC({
    anyPermissions: [PERMISSIONS.CONSOLE_ADMIN, PERMISSIONS.SUPPORT_MANAGE, PERMISSIONS.ACTIVITIES_MANAGE],
  })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status?: string },
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (!body.status) throw new BadRequestException('status requerido');
    const status = this.normalizeStatus(body.status);
    if (!status) throw new BadRequestException('status invalido');
    return this.service.updateStatus(id, status, companyId);
  }
}
