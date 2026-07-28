import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { AiTriageService } from './ai-triage.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

@Controller('ai')
@UseGuards(RbacGuard)
export class AiController {
  constructor(private readonly triage: AiTriageService) {}

  @Post('triage')
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_MANAGE, PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.CONSOLE_ADMIN] })
  triageTicket(
    @Body() body: { title: string; description?: string; clientName?: string },
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.triage.triageActivityText(body, companyId);
  }

  @Get('suggestions')
  @RBAC({ anyPermissions: [PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.BI_VIEW, PERMISSIONS.CONSOLE_ADMIN] })
  suggestions(@CurrentCompanyId() companyId: number | null) {
    return this.triage.suggestNextActions(companyId);
  }
}
