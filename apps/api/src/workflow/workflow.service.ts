import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  assertCompanyAccess,
  companyWhere,
  requireCompanyId,
} from '../common/tenant/tenant-scope.js';
import { matchesAutoApproveCondition } from './workflow-auto-approve-condition.js';
import { DomainEventBusService } from '../domain-events/domain-event-bus.service.js';

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly domainEvents: DomainEventBusService,
  ) {}

  // ── Definiciones ──────────────────────────────────────────────
  async listDefinitions(companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    return this.prisma.workflowDefinition.findMany({
      where: companyWhere(tenantId),
      include: { steps: { orderBy: { stepNumber: 'asc' } }, _count: { select: { instances: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createDefinition(
    dto: {
      name: string;
      description?: string;
      entityType: string;
      steps: Array<{
        stepNumber: number;
        name: string;
        description?: string;
        approverRoleId?: number;
        approverUserId?: number;
        timeoutHours?: number;
        autoApproveCondition?: string;
      }>;
    },
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    if (!dto.steps?.length) throw new BadRequestException('Define al menos un paso de aprobación');
    return this.prisma.workflowDefinition.create({
      data: {
        companyId: tenantId,
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
    companyId?: number | null;
  }) {
    const tenantId = requireCompanyId(dto.companyId);
    // Resuelve la definición: por id explícito o por entityType activo WITHIN company
    const def = dto.workflowDefinitionId
      ? await this.prisma.workflowDefinition.findFirst({
          where: { id: dto.workflowDefinitionId, ...companyWhere(tenantId) },
          include: { steps: { orderBy: { stepNumber: 'asc' } } },
        })
      : await this.prisma.workflowDefinition.findFirst({
          where: {
            entityType: dto.entityType.toUpperCase(),
            status: 'ACTIVE',
            ...companyWhere(tenantId),
          },
          include: { steps: { orderBy: { stepNumber: 'asc' } } },
        });
    if (!def) throw new NotFoundException(`Sin definición de workflow para ${dto.entityType}`);
    assertCompanyAccess(def, tenantId, 'Definición de workflow');
    if (!def.steps.length) throw new BadRequestException('La definición no tiene pasos');

    // Evita duplicar instancias abiertas
    const existing = await this.prisma.workflowInstance.findFirst({
      where: {
        workflowId: def.id,
        entityType: dto.entityType.toUpperCase(),
        entityId: dto.entityId,
        isComplete: false,
        isCancelled: false,
        ...companyWhere(tenantId),
      },
    });
    if (existing) return this.getInstance(existing.id, tenantId);

    const instance = await this.prisma.workflowInstance.create({
      data: {
        companyId: tenantId,
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

    void this.tryAutoApproveChain(instance.id, tenantId).catch((err) =>
      this.logger.warn(
        `Auto-approve chain: ${err instanceof Error ? err.message : err}`,
      ),
    );

    return this.getInstance(instance.id, tenantId);
  }

  async getInstance(id: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    const instance = await this.prisma.workflowInstance.findFirst({
      where: { id, ...companyWhere(tenantId) },
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
    assertCompanyAccess(instance, tenantId, 'Instancia');
    return instance;
  }

  /**
   * Devuelve TODAS las instancias de workflow (open/closed/cancelled) asociadas
   * a una entidad concreta. Usado por la tab "Historial de aprobaciones" en
   * cada entidad (cotización, gasto, viático, OC, proyecto).
   */
  async listInstancesForEntity(entityType: string, entityId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    return this.prisma.workflowInstance.findMany({
      where: {
        entityType: entityType.toUpperCase(),
        entityId,
        ...companyWhere(tenantId),
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

  async listMyPending(userId: number, companyId?: number | null) {
    const tenantId = requireCompanyId(companyId);
    // Aprobaciones pendientes donde el usuario es approverUser o tiene el rol approverRole.
    // Incluye la cadena COMPLETA de aprobaciones de cada instancia para que la
    // bandeja `/erp/approvals` pueda dibujar el timeline (paso 1 ✓, paso 2 ✓, paso 3 ⏳…).
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { roleId: true, role: { select: { nombre: true } } },
    });
    return this.prisma.workflowApproval.findMany({
      where: {
        status: 'PENDING',
        instance: { ...companyWhere(tenantId) },
        OR: [
          { step: { approverUserId: userId } },
          { step: { approverRoleId: user?.roleId ?? -1 } },
        ],
      },
      include: {
        step: { include: { approverRole: { select: { nombre: true } }, approverUser: { select: { nombre: true } } } },
        instance: {
          include: {
            workflow: {
              select: {
                name: true,
                entityType: true,
                steps: {
                  orderBy: { stepNumber: 'asc' },
                  include: {
                    approverRole: { select: { nombre: true } },
                    approverUser: { select: { nombre: true } },
                  },
                },
              },
            },
            startedBy: { select: { id: true, nombre: true, role: { select: { nombre: true } } } },
            approvals: {
              orderBy: { createdAt: 'asc' },
              include: {
                step: true,
                decidedBy: { select: { id: true, nombre: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async decide(
    approvalId: number,
    userId: number,
    decision: 'APPROVED' | 'REJECTED',
    comments?: string,
    companyId?: number | null,
  ) {
    const tenantId = requireCompanyId(companyId);
    const approval = await this.prisma.workflowApproval.findFirst({
      where: {
        id: approvalId,
        instance: { ...companyWhere(tenantId) },
      },
      include: {
        instance: {
          include: { workflow: { include: { steps: { orderBy: { stepNumber: 'asc' } } } } },
        },
        step: true,
      },
    });
    if (!approval) throw new NotFoundException('Aprobación no encontrada');
    assertCompanyAccess(approval.instance, tenantId, 'Instancia');
    if (approval.status !== 'PENDING') throw new BadRequestException('Esta aprobación ya fue decidida');

    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, roleId: true, roleKey: true, role: { select: { nombre: true, accesoConsoleAdmin: true } } },
    });
    const isElevated =
      actor?.roleKey === 'super_admin' ||
      Boolean(actor?.role?.accesoConsoleAdmin) ||
      (actor?.role?.nombre || '').toLowerCase().includes('super');
    const isApprover =
      isElevated ||
      approval.step.approverUserId === userId ||
      (approval.step.approverRoleId != null && approval.step.approverRoleId === actor?.roleId);
    if (!isApprover) {
      throw new ForbiddenException('No eres el aprobador de este paso');
    }

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
      this.domainEvents.publishEntityLifecycle('updated', {
        entityType: inst.entityType,
        entityId: inst.entityId,
        companyId: inst.companyId,
        userId,
        payload: {
          workflowRejected: true,
          workflowName: inst.workflow.name,
          workflowInstanceId: inst.id,
          comments: comments?.trim() || null,
        },
      });
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
      void this.tryAutoApproveChain(approval.instanceId, tenantId).catch((err) =>
        this.logger.warn(
          `Auto-approve chain: ${err instanceof Error ? err.message : err}`,
        ),
      );
      return { decided: true, complete: false, nextStep: nextStep.stepNumber };
    }

    // Sin más pasos → completado
    await this.prisma.workflowInstance.update({
      where: { id: approval.instanceId },
      data: { isComplete: true, completedAt: new Date() },
    });

    await this.finalizeWorkflowApproval(approval.instance, userId);
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

  private async buildEntityContext(
    entityType: string,
    entityId: number,
    companyId: number,
  ): Promise<Record<string, unknown>> {
    const type = entityType.toUpperCase();
    if (type === 'COTIZACION') {
      const quote = await this.prisma.cotizacion.findFirst({
        where: { id: entityId, ...companyWhere(companyId) },
        include: { items: true },
      });
      if (!quote) return {};
      const discounts = quote.items.map((it) => Number(it.discount ?? 0));
      const maxDiscountPercent = discounts.length ? Math.max(...discounts) : 0;
      return {
        maxDiscountPercent,
        total: Number(quote.total),
        amount: Number(quote.total),
      };
    }
    if (type === 'EXPENSE') {
      const expense = await this.prisma.expense.findFirst({
        where: { id: entityId, ...companyWhere(companyId) },
      });
      if (!expense) return {};
      const amount = Number(expense.montoSolicitado ?? 0);
      return { amount, montoSolicitado: amount };
    }
    if (type === 'VIATIC') {
      const viatic = await this.prisma.viatico.findFirst({
        where: { id: entityId, ...companyWhere(companyId) },
      });
      if (!viatic) return {};
      const amount = Number(viatic.montoSolicitado ?? 0);
      return { amount, montoSolicitado: amount };
    }
    if (type === 'SALES_PROJECT') {
      const project = await this.prisma.salesProject.findFirst({
        where: { id: entityId, ...companyWhere(companyId) },
      });
      if (!project) return {};
      return { budget: Number(project.budget ?? 0) };
    }
    if (type === 'PURCHASE_ORDER') {
      const po = await this.prisma.purchaseOrder.findFirst({
        where: { id: entityId, ...companyWhere(companyId) },
      });
      if (!po) return {};
      const amount = Number(po.totalAmount ?? 0);
      return { amount, totalAmount: amount };
    }
    return {};
  }

  private async tryAutoApproveChain(instanceId: number, companyId: number): Promise<void> {
    for (let guard = 0; guard < 8; guard++) {
      const pending = await this.prisma.workflowApproval.findFirst({
        where: { instanceId, status: 'PENDING' },
        include: {
          step: true,
          instance: {
            include: { workflow: { include: { steps: { orderBy: { stepNumber: 'asc' } } } } },
          },
        },
      });
      if (!pending?.step?.autoApproveCondition) break;

      const ctx = await this.buildEntityContext(
        pending.instance.entityType,
        pending.instance.entityId,
        companyId,
      );
      if (!matchesAutoApproveCondition(pending.step.autoApproveCondition, ctx)) break;

      const result = await this.systemAdvanceApproval(
        pending,
        `[AUTO] ${pending.step.autoApproveCondition.trim()}`,
      );
      if (result.complete || result.cancelled) break;
    }
  }

  private async systemAdvanceApproval(
    approval: {
      id: number;
      instanceId: number;
      stepId: number;
      instance: {
        id: number;
        entityId: number;
        entityType: string;
        companyId: number;
        startedById: number;
        workflow: {
          name: string;
          steps: Array<{ id: number; stepNumber: number; approverUserId: number | null }>;
        };
      };
      step: { id: number };
    },
    comments: string,
  ): Promise<{ complete: boolean; cancelled: boolean }> {
    await this.prisma.workflowApproval.update({
      where: { id: approval.id },
      data: {
        status: 'APPROVED',
        comments: comments.trim(),
        decidedById: approval.instance.startedById,
        decidedAt: new Date(),
      },
    });

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
        await this.notifyApprover(
          nextStep.approverUserId,
          approval.instanceId,
          approval.instance.workflow.name,
          approval.instance.entityType,
          approval.instance.entityId,
        );
      }
      return { complete: false, cancelled: false };
    }

    await this.prisma.workflowInstance.update({
      where: { id: approval.instanceId },
      data: { isComplete: true, completedAt: new Date() },
    });

    await this.finalizeWorkflowApproval(approval.instance, approval.instance.startedById);

    await this.notifications.createNotification({
      userId: approval.instance.startedById,
      type: 'WORKFLOW_APPROVED',
      category: 'workflow',
      title: '✅ Solicitud aprobada',
      message: `Tu solicitud "${approval.instance.workflow.name}" para ${approval.instance.entityType} #${approval.instance.entityId} fue aprobada en todos los niveles.`,
      entityType: approval.instance.entityType,
      relatedEntityId: approval.instance.entityId,
    } as any).catch(() => null);

    return { complete: true, cancelled: false };
  }

  private async finalizeWorkflowApproval(
    instance: {
      id: number;
      entityId: number;
      entityType: string;
      companyId: number;
      startedById: number;
      workflow: { name: string };
    },
    actorId: number,
  ) {
    const ctx = await this.buildEntityContext(instance.entityType, instance.entityId, instance.companyId);
    this.domainEvents.publishEntityLifecycle('updated', {
      entityType: instance.entityType,
      entityId: instance.entityId,
      companyId: instance.companyId,
      userId: actorId,
      payload: {
        workflowComplete: true,
        workflowName: instance.workflow.name,
        workflowInstanceId: instance.id,
        startedById: instance.startedById,
        ...ctx,
      },
    });
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
        relatedUrl: `/erp/approvals?highlight=${instanceId}`,
      } as any);
    } catch {
      // silent
    }
  }
}
