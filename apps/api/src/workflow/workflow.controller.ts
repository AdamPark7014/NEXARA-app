import { Controller, Get, Post, Param, Query, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { WorkflowService } from './workflow.service.js';
import { RBAC, RbacGuard } from '../common/rbac.guard.js';
import { CurrentUser } from '../common/current-user.decorator.js';
import { PERMISSIONS } from '../common/permissions.js';

@Controller('workflow')
@UseGuards(RbacGuard)
export class WorkflowController {
  constructor(private readonly svc: WorkflowService) {}

  // Definitions
  @Post('definitions')
  @RBAC({ permissions: [PERMISSIONS.WORKFLOW_MANAGE] })
  createDefinition(@Body() dto: any) {
    return this.svc.createDefinition(dto);
  }

  @Get('definitions')
  @RBAC({ permissions: [PERMISSIONS.WORKFLOW_VIEW] })
  listDefinitions() {
    return this.svc.listDefinitions();
  }

  @Get('definitions/:id')
  @RBAC({ permissions: [PERMISSIONS.WORKFLOW_VIEW] })
  getDefinition(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getDefinition(id);
  }

  // Instances
  @Post('instances')
  @RBAC({ permissions: [PERMISSIONS.WORKFLOW_VIEW] })
  startWorkflow(@Body() dto: any, @CurrentUser() user: any) {
    return this.svc.startWorkflow(dto, user.id);
  }

  @Get('instances')
  @RBAC({ permissions: [PERMISSIONS.WORKFLOW_VIEW] })
  listInstances(@Query('isComplete') isComplete?: string, @Query('entityType') entityType?: string) {
    return this.svc.listInstances({ isComplete: isComplete !== undefined ? isComplete === 'true' : undefined, entityType });
  }

  @Get('instances/pending')
  @RBAC({ permissions: [PERMISSIONS.WORKFLOW_VIEW] })
  pendingApprovals(@CurrentUser() user: any) {
    return this.svc.getPendingApprovals(user.id);
  }

  @Get('instances/:id')
  @RBAC({ permissions: [PERMISSIONS.WORKFLOW_VIEW] })
  getInstance(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getInstance(id);
  }

  // Approvals
  @Post('instances/:id/approve')
  @RBAC({ permissions: [PERMISSIONS.WORKFLOW_VIEW] })
  approve(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @CurrentUser() user: any) {
    return this.svc.submitApproval(id, dto, user.id);
  }
}
