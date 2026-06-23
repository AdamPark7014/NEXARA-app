import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WorkflowService } from './workflow.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { PERMISSIONS } from '../common/permissions.js';
import { CurrentUser } from '../common/current-user.decorator.js';

const VIEW = [PERMISSIONS.WORKFLOW_VIEW, PERMISSIONS.WORKFLOW_MANAGE, PERMISSIONS.CONSOLE_ADMIN];
const MANAGE = [PERMISSIONS.WORKFLOW_MANAGE, PERMISSIONS.CONSOLE_ADMIN];

@Controller('workflow')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class WorkflowController {
  constructor(private readonly service: WorkflowService) {}

  @Get('definitions')
  @RBAC({ anyPermissions: VIEW })
  listDefinitions() {
    return this.service.listDefinitions();
  }

  @Post('definitions')
  @RBAC({ anyPermissions: MANAGE })
  createDefinition(@Body() dto: any) {
    return this.service.createDefinition(dto);
  }

  @Post('request')
  request(@Body() dto: any, @CurrentUser() user: any) {
    return this.service.requestApproval({
      entityType: dto.entityType,
      entityId: dto.entityId,
      workflowDefinitionId: dto.workflowDefinitionId,
      startedById: user.id,
    });
  }

  @Get('my-pending')
  myPending(@CurrentUser() user: any) {
    return this.service.listMyPending(user.id);
  }

  @Get('instances/:id')
  getInstance(@Param('id', ParseIntPipe) id: number) {
    return this.service.getInstance(id);
  }

  @Get('entity/:entityType/:entityId')
  @RBAC({ anyPermissions: VIEW })
  listForEntity(
    @Param('entityType') entityType: string,
    @Param('entityId', ParseIntPipe) entityId: number,
  ) {
    return this.service.listInstancesForEntity(entityType, entityId);
  }

  @Post('approvals/:id/decide')
  decide(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { decision: 'APPROVED' | 'REJECTED'; comments?: string },
    @CurrentUser() user: any,
  ) {
    return this.service.decide(id, user.id, body.decision, body.comments);
  }
}
