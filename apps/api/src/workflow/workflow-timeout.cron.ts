import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

/**
 * Escalación de aprobaciones pendientes que superan `timeoutHours` del paso actual.
 */
@Injectable()
export class WorkflowTimeoutCronService {
  private readonly logger = new Logger(WorkflowTimeoutCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleTimeouts() {
    const openInstances = await this.prisma.workflowInstance.findMany({
      where: { isComplete: false, isCancelled: false },
      include: {
        workflow: { include: { steps: { orderBy: { stepNumber: 'asc' } } } },
        approvals: { include: { step: true } },
      },
      take: 200,
    });

    const now = Date.now();
    let escalated = 0;

    for (const inst of openInstances) {
      const step = inst.workflow.steps.find((s) => s.stepNumber === inst.currentStep);
      if (!step?.timeoutHours) continue;

      const pending = inst.approvals.find(
        (a) => a.status === 'PENDING' && a.step.stepNumber === inst.currentStep,
      );
      if (!pending?.createdAt) continue;
      if (pending.comments?.startsWith('[ESCALATED]')) continue;

      const deadline = pending.createdAt.getTime() + step.timeoutHours * 3600 * 1000;
      if (now <= deadline) continue;

      await this.prisma.workflowApproval.update({
        where: { id: pending.id },
        data: { comments: '[ESCALATED] SLA del paso vencido — requiere atención.' },
      });

      const approverId = step.approverUserId ?? inst.startedById;
      if (approverId) {
        await this.notifications.createNotification({
          userId: approverId,
          type: 'WORKFLOW_ESCALATION',
          category: 'approval',
          title: 'Aprobación vencida',
          message: `${inst.workflow.name} · ${inst.entityType} #${inst.entityId} superó el SLA del paso "${step.name}".`,
          relatedEntityId: inst.entityId,
          entityType: inst.entityType,
          relatedUrl: '/erp/approvals',
          priority: 'high',
          companyId: inst.companyId,
        });
      }
      escalated += 1;
    }

    if (escalated > 0) {
      this.logger.log(`Workflow timeout: ${escalated} aprobación(es) escaladas`);
    }
  }
}
