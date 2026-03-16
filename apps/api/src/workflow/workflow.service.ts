import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Workflow Definitions ──────────────────────────────────────────
  async createDefinition(dto: {
    name: string;
    entityType: string;
    description?: string;
    steps: Array<{ name: string; stepNumber: number; approverRoleId?: number; approverUserId?: number; autoApproveCondition?: string }>;
  }) {
    return this.prisma.workflowDefinition.create({
      data: {
        name: dto.name.trim(),
        entityType: dto.entityType.trim(),
        description: dto.description?.trim() || null,
        steps: {
          create: dto.steps.map((s, i) => ({
            name: s.name.trim(),
            stepNumber: s.stepNumber,
            sortOrder: i,
            approverRoleId: s.approverRoleId ?? null,
            approverUserId: s.approverUserId ?? null,
            autoApproveCondition: s.autoApproveCondition ?? null,
          })),
        },
      },
      include: { steps: { orderBy: { stepNumber: 'asc' } } },
    });
  }

  async listDefinitions() {
    return this.prisma.workflowDefinition.findMany({
      include: { steps: { orderBy: { stepNumber: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async getDefinition(id: number) {
    const def = await this.prisma.workflowDefinition.findUnique({
      where: { id },
      include: { steps: { orderBy: { stepNumber: 'asc' } } },
    });
    if (!def) throw new NotFoundException('Workflow no encontrado');
    return def;
  }

  // ── Workflow Instances ────────────────────────────────────────────
  async startWorkflow(dto: { workflowId: number; entityType: string; entityId: number }, userId: number) {
    const definition = await this.prisma.workflowDefinition.findUnique({
      where: { id: dto.workflowId },
      include: { steps: { orderBy: { stepNumber: 'asc' } } },
    });
    if (!definition) throw new NotFoundException('Definicion de workflow no encontrada');
    if (definition.steps.length === 0) throw new BadRequestException('El workflow no tiene pasos definidos');

    return this.prisma.workflowInstance.create({
      data: {
        workflowId: dto.workflowId,
        entityType: dto.entityType.trim(),
        entityId: dto.entityId,
        currentStep: 1,
        startedById: userId,
      },
      include: { workflow: true },
    });
  }

  async listInstances(filters?: { isComplete?: boolean; entityType?: string }) {
    const where: any = {};
    if (filters?.isComplete !== undefined) where.isComplete = filters.isComplete;
    if (filters?.entityType) where.entityType = filters.entityType;
    return this.prisma.workflowInstance.findMany({
      where,
      include: { workflow: true, startedBy: { select: { id: true, nombre: true } } },
      orderBy: { startedAt: 'desc' },
    });
  }

  async getInstance(id: number) {
    const inst = await this.prisma.workflowInstance.findUnique({
      where: { id },
      include: { workflow: { include: { steps: { orderBy: { stepNumber: 'asc' } } } }, approvals: { include: { decidedBy: { select: { id: true, nombre: true } }, step: true } }, startedBy: { select: { id: true, nombre: true } } },
    });
    if (!inst) throw new NotFoundException('Instancia de workflow no encontrada');
    return inst;
  }

  // ── Approvals ─────────────────────────────────────────────────────
  async submitApproval(instanceId: number, dto: { decision: 'APPROVED' | 'REJECTED'; comments?: string }, userId: number) {
    const instance = await this.prisma.workflowInstance.findUnique({
      where: { id: instanceId },
      include: { workflow: { include: { steps: { orderBy: { stepNumber: 'asc' } } } } },
    });
    if (!instance) throw new NotFoundException('Instancia no encontrada');
    if (instance.isComplete || instance.isCancelled) throw new BadRequestException('El workflow ya no esta activo');

    // Find step matching currentStep number
    const currentStepDef = instance.workflow.steps.find((s: any) => s.stepNumber === instance.currentStep);
    if (!currentStepDef) throw new BadRequestException('Paso actual no encontrado en la definicion');

    const approval = await this.prisma.workflowApproval.create({
      data: {
        instanceId,
        stepId: currentStepDef.id,
        decidedById: userId,
        status: dto.decision as any,
        comments: dto.comments?.trim() || null,
        decidedAt: new Date(),
      },
    });

    if (dto.decision === 'REJECTED') {
      await this.prisma.workflowInstance.update({
        where: { id: instanceId },
        data: { isCancelled: true },
      });
      return { approval, status: 'REJECTED' };
    }

    // Advance to next step
    const steps = instance.workflow.steps;
    const currentIdx = steps.findIndex((s: any) => s.stepNumber === instance.currentStep);
    if (currentIdx < steps.length - 1) {
      const nextStep = steps[currentIdx + 1];
      await this.prisma.workflowInstance.update({
        where: { id: instanceId },
        data: { currentStep: nextStep.stepNumber },
      });
      return { approval, status: 'ACTIVE', nextStep: nextStep.name };
    } else {
      await this.prisma.workflowInstance.update({
        where: { id: instanceId },
        data: { isComplete: true, completedAt: new Date() },
      });
      return { approval, status: 'COMPLETED' };
    }
  }

  async getPendingApprovals(userId: number) {
    // Get active instances and filter by matching step approver
    const instances = await this.prisma.workflowInstance.findMany({
      where: {
        isComplete: false,
        isCancelled: false,
      },
      include: { workflow: { include: { steps: true } }, startedBy: { select: { id: true, nombre: true } } },
      orderBy: { startedAt: 'asc' },
    });
    // Filter to those where current step matches the user
    return instances.filter((inst: any) => {
      const step = inst.workflow.steps.find((s: any) => s.stepNumber === inst.currentStep);
      return step && (step.approverUserId === userId || (!step.approverUserId && !step.approverRoleId));
    });
  }
}
