import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Definiciones ──────────────────────────────────────────────
  async listDefinitions() {
    return this.prisma.workflowDefinition.findMany({
      include: { steps: { orderBy: { stepNumber: 'asc' } }, _count: { select: { instances: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createDefinition(dto: {
    name: string;
    description?: string;
    entityType: string;
    steps: Array<{ stepNumber: number; name: string; description?: string; approverRoleId?: number; approverUserId?: number; timeoutHours?: number; autoApproveCondition?: string }>;
  }) {
    if (!dto.steps?.length) throw new BadRequestException('Define al menos un paso de aprobación');
    return this.prisma.workflowDefinition.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        entityType: dto.entityType.trim().toUpperCase(),
        steps: {
          create: dto.steps.map((s, idx) => ({
            stepNumber: s.stepNumber ?? idx + 1,
            name: s.name.trim(),
            description: s.description?.trim() || null,
            approverRoleId: s.approverRoleId ?? null,
            approverUserId: s.approverUserId ?? null,
            timeoutHours: s.timeoutHours ?? null,
            autoApproveCondition: s.autoApproveCondition ?? null,
            sortOrder: idx,
          })),
        },
      },
      include: { steps: { orderBy: { stepNumber: 'asc' } } },
    });
  }

  // ── Solicitar aprobación ─────────────────────────────────────
  async requestApproval(dto: {
    entityType: string;
    entityId: number;
    workflowDefinitionId?: number;
    startedById: number;
  }) {
    // Resuelve la definición: por id explícito o por entityType activo
    const def = dto.workflowDefinitionId
      ? await this.prisma.workflowDefinition.findUnique({ where: { id: dto.workflowDefinitionId }, include: { steps: { orderBy: { stepNumber: 'asc' } } } })
      : await this.prisma.workflowDefinition.findFirst({
          where: { entityType: dto.entityType.toUpperCase(), status: 'ACTIVE' },
          include: { steps: { orderBy: { stepNumber: 'asc' } } },
        });
    if (!def) throw new NotFoundException(`Sin definición de workflow para ${dto.entityType}`);
    if (!def.steps.length) throw new BadRequestException('La definición no tiene pasos');

    // Evita duplicar instancias abiertas
    const existing = await this.prisma.workflowInstance.findFirst({
      where: { workflowId: def.id, entityType: dto.entityType.toUpperCase(), entityId: dto.entityId, isComplete: false, isCancelled: false },
    });
    if (existing) return this.getInstance(existing.id);

    const instance = await this.prisma.workflowInstance.create({
      data: {
        workflowId: def.id,
        entityId: dto.entityId,
        entityType: dto.entityType.toUpperCase(),
        currentStep: 1,
        startedById: dto.startedById,
        approvals: {
          create: { stepId: def.steps[0].id, status: 'PENDING' },
        },
      },
    });

    // Notificar al aprobador del paso 1
    const firstStep = def.steps[0];
    if (firstStep.approverUserId) {
      await this.notifyApprover(firstStep.approverUserId, instance.id, def.name, dto.entityType, dto.entityId);
    }
    return this.getInstance(instance.id);
  }

  async getInstance(id: number) {
    const instance = await this.prisma.workflowInstance.findUnique({
      where: { id },
      include: {
        workflow: { include: { steps: { orderBy: { stepNumber: 'asc' } } } },
        startedBy: { select: { id: true, nombre: true } },
        approvals: {
          include: {
            step: true,
            decidedBy: { select: { id: true, nombre: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!instance) throw new NotFoundException('Instancia no encontrada');
    return instance;
  }

  /**
   * Devuelve TODAS las instancias de workflow (open/closed/cancelled) asociadas
   * a una entidad concreta. Usado por la tab "Historial de aprobaciones" en
   * cada entidad (cotización, gasto, viático, OC, proyecto).
   */
  async listInstancesForEntity(entityType: string, entityId: number) {
    return this.prisma.workflowInstance.findMany({
      where: {
        entityType: entityType.toUpperCase(),
        entityId,
      },
      include: {
        workflow: {
          include: {
            steps: { orderBy: { stepNumber: 'asc' } },
          },
        },
        startedBy: { select: { id: true, nombre: true } },
        approvals: {
          include: {
            step: true,
            decidedBy: { select: { id: true, nombre: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  async listMyPending(userId: number) {
    // Aprobaciones pendientes donde el usuario es approverUser o tiene el rol approverRole
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { roleId: true } });
    return this.prisma.workflowApproval.findMany({
      where: {
        status: 'PENDING',
        OR: [
          { step: { approverUserId: userId } },
          { step: { approverRoleId: user?.roleId ?? -1 } },
        ],
      },
      include: {
        step: true,
        instance: {
          include: {
            workflow: { select: { name: true, entityType: true } },
            startedBy: { select: { id: true, nombre: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async decide(approvalId: number, userId: number, decision: 'APPROVED' | 'REJECTED', comments?: string) {
    const approval = await this.prisma.workflowApproval.findUnique({
      where: { id: approvalId },
      include: { instance: { include: { workflow: { include: { steps: { orderBy: { stepNumber: 'asc' } } } } } }, step: true },
    });
    if (!approval) throw new NotFoundException('Aprobación no encontrada');
    if (approval.status !== 'PENDING') throw new BadRequestException('Esta aprobación ya fue decidida');

    await this.prisma.workflowApproval.update({
      where: { id: approvalId },
      data: { status: decision, comments: comments?.trim() || null, decidedById: userId, decidedAt: new Date() },
    });

    if (decision === 'REJECTED') {
      await this.prisma.workflowInstance.update({
        where: { id: approval.instanceId },
        data: { isComplete: true, isCancelled: true, completedAt: new Date() },
      });
      const inst = approval.instance;
      await this.notifications.createNotification({
        userId: inst.startedById,
        type: 'WORKFLOW_REJECTED',
        category: 'workflow',
        title: '❌ Solicitud rechazada',
        message: `Tu solicitud "${inst.workflow.name}" para ${inst.entityType} #${inst.entityId} fue rechazada. ${comments ? `Motivo: ${comments}` : ''}`,
        entityType: inst.entityType,
        relatedEntityId: inst.entityId,
      } as any).catch(() => null);
      return { decided: true, complete: true, cancelled: true };
    }

    // APPROVED: avanzar al siguiente paso, o cerrar instancia
    const steps = approval.instance.workflow.steps;
    const currentIdx = steps.findIndex((s) => s.id === approval.stepId);
    const nextStep = steps[currentIdx + 1];

    if (nextStep) {
      await this.prisma.workflowInstance.update({
        where: { id: approval.instanceId },
        data: {
          currentStep: nextStep.stepNumber,
          approvals: { create: { stepId: nextStep.id, status: 'PENDING' } },
        },
      });
      if (nextStep.approverUserId) {
        await this.notifyApprover(nextStep.approverUserId, approval.instanceId, approval.instance.workflow.name, approval.instance.entityType, approval.instance.entityId);
      }
      return { decided: true, complete: false, nextStep: nextStep.stepNumber };
    }

    // Sin más pasos → completado
    await this.prisma.workflowInstance.update({
      where: { id: approval.instanceId },
      data: { isComplete: true, completedAt: new Date() },
    });
    await this.notifications.createNotification({
      userId: approval.instance.startedById,
      type: 'WORKFLOW_APPROVED',
      category: 'workflow',
      title: '✅ Solicitud aprobada',
      message: `Tu solicitud "${approval.instance.workflow.name}" para ${approval.instance.entityType} #${approval.instance.entityId} fue aprobada en todos los niveles.`,
      entityType: approval.instance.entityType,
      relatedEntityId: approval.instance.entityId,
    } as any).catch(() => null);
    return { decided: true, complete: true };
  }

  private async notifyApprover(userId: number, instanceId: number, workflowName: string, entityType: string, entityId: number) {
    try {
      await this.notifications.createNotification({
        userId,
        type: 'WORKFLOW_PENDING',
        category: 'workflow',
        title: '🛡️ Aprobación pendiente',
        message: `Tienes una solicitud de aprobación: ${workflowName} — ${entityType} #${entityId}`,
        entityType,
        relatedEntityId: entityId,
        relatedUrl: `/approvals/${instanceId}`,
      } as any);
    } catch {
      // silent
    }
  }
}
