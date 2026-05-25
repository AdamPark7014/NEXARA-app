import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CrmActivitiesService } from './crm-activities.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';

const VIEW = [PERMISSIONS.CRM_ACTIVITIES_VIEW, PERMISSIONS.CRM_ACTIVITIES_MANAGE, PERMISSIONS.SALES_VIEW, PERMISSIONS.SALES_MANAGE, PERMISSIONS.CONSOLE_ADMIN];
const MANAGE = [PERMISSIONS.CRM_ACTIVITIES_MANAGE, PERMISSIONS.SALES_MANAGE, PERMISSIONS.CONSOLE_ADMIN];

@Controller('crm-activities')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class CrmActivitiesController {
  constructor(private readonly service: CrmActivitiesService) {}

  @Post()
  @RBAC({ anyPermissions: MANAGE })
  create(@Body() dto: any, @CurrentUser() user: any) {
    return this.service.create({ ...dto, createdById: user?.id, ownerId: dto.ownerId ?? user?.id });
  }

  @Get()
  @RBAC({ anyPermissions: VIEW })
  list(
    @Query('ownerId') ownerId?: string,
    @Query('status') status?: string,
    @Query('activityType') activityType?: string,
    @Query('leadId') leadId?: string,
    @Query('opportunityId') opportunityId?: string,
    @Query('tenderId') tenderId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('overdue') overdue?: string,
  ) {
    return this.service.list({
      ownerId: ownerId ? +ownerId : undefined,
      status,
      activityType,
      leadId: leadId ? +leadId : undefined,
      opportunityId: opportunityId ? +opportunityId : undefined,
      tenderId: tenderId ? +tenderId : undefined,
      from,
      to,
      overdue: overdue === 'true',
    });
  }

  @Get('my-agenda')
  @RBAC({ anyPermissions: VIEW })
  myAgenda(@CurrentUser() user: any) {
    return this.service.getMyAgenda(user.id);
  }

  @Patch(':id/complete')
  @RBAC({ anyPermissions: MANAGE })
  complete(@Param('id', ParseIntPipe) id: number, @Body() body: { outcome?: string }) {
    return this.service.complete(id, body?.outcome);
  }

  @Patch(':id')
  @RBAC({ anyPermissions: MANAGE })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RBAC({ anyPermissions: MANAGE })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
