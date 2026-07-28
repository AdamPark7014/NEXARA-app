import { Body, Controller, ForbiddenException, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WorkflowService } from './workflow.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { CurrentCompanyId } from '../common/tenant/current-company.decorator.js';

const VIEW = [PERMISSIONS.WORKFLOW_VIEW, PERMISSIONS.WORKFLOW_MANAGE, PERMISSIONS.CONSOLE_ADMIN];
const MANAGE = [PERMISSIONS.WORKFLOW_MANAGE, PERMISSIONS.CONSOLE_ADMIN];
const DECIDE = [
  PERMISSIONS.WORKFLOW_VIEW,
  PERMISSIONS.WORKFLOW_MANAGE,
  PERMISSIONS.CONSOLE_ADMIN,
];

@Controller('workflow')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class WorkflowController {
  constructor(private readonly service: WorkflowService) {}

  @Get('definitions')
  @RBAC({ anyPermissions: VIEW })
  listDefinitions(@CurrentCompanyId() companyId: number | null) {
    return this.service.listDefinitions(companyId);
  }

  @Post('definitions')
  @RBAC({ anyPermissions: MANAGE })
  createDefinition(@Body() dto: any, @CurrentCompanyId() companyId: number | null) {
    return this.service.createDefinition(dto, companyId);
  }

  @Post('request')
  @RBAC({ anyPermissions: VIEW })
  request(
    @Body() dto: any,
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.requestApproval({
      entityType: dto.entityType,
      entityId: dto.entityId,
      workflowDefinitionId: dto.workflowDefinitionId,
      startedById: user.id,
      companyId,
    });
  }

  @Get('my-pending')
  @RBAC({ anyPermissions: VIEW })
  myPending(@CurrentUser() user: any, @CurrentCompanyId() companyId: number | null) {
    return this.service.listMyPending(user.id, companyId);
  }

  @Get('instances/:id')
  @RBAC({ anyPermissions: VIEW })
  getInstance(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.getInstance(id, companyId);
  }

  @Get('entity/:entityType/:entityId')
  @RBAC({ anyPermissions: VIEW })
  listForEntity(
    @Param('entityType') entityType: string,
    @Param('entityId', ParseIntPipe) entityId: number,
    @CurrentCompanyId() companyId: number | null,
  ) {
    return this.service.listInstancesForEntity(entityType, entityId, companyId);
  }

  @Post('approvals/:id/decide')
  @RBAC({ anyPermissions: DECIDE })
  decide(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { decision: 'APPROVED' | 'REJECTED'; comments?: string },
    @CurrentUser() user: any,
    @CurrentCompanyId() companyId: number | null,
  ) {
    if (!body?.decision || !['APPROVED', 'REJECTED'].includes(body.decision)) {
      throw new ForbiddenException('Decisión inválida');
    }
    return this.service.decide(id, user.id, body.decision, body.comments, companyId);
  }
}
