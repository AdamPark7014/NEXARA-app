import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

type SeedWorkflow = {
  name: string;
  description: string;
  entityType: string;
  steps: Array<{
    stepNumber: number;
    name: string;
    description?: string;
    timeoutHours?: number;
    autoApproveCondition?: string;
  }>;
};

const DEFAULT_WORKFLOWS: SeedWorkflow[] = [
  {
    name: 'Aprobación de descuento en cotización',
    description: 'Descuentos superiores al 15% requieren autorización comercial.',
    entityType: 'COTIZACION',
    steps: [
      {
        stepNumber: 1,
        name: 'Director comercial',
        description: 'Valida margen y descuento',
        timeoutHours: 48,
        autoApproveCondition: 'maxDiscountPercent<=18',
      },
      {
        stepNumber: 2,
        name: 'Dirección general',
        description: 'Aprobación final',
        timeoutHours: 72,
        autoApproveCondition: 'maxDiscountPercent<=22',
      },
    ],
  },
  {
    name: 'Aprobación de gasto operativo',
    description: 'Gastos operativos mayores a $5,000 MXN.',
    entityType: 'EXPENSE',
    steps: [{ stepNumber: 1, name: 'Coordinador administrativo', timeoutHours: 24 }],
  },
  {
    name: 'Aprobación de viáticos',
    description: 'Viáticos fuera de política o montos elevados.',
    entityType: 'VIATIC',
    steps: [{ stepNumber: 1, name: 'Coordinador de operaciones', timeoutHours: 24 }],
  },
  {
    name: 'Aprobación de proyecto > $500k',
    description: 'Proyectos comerciales con presupuesto elevado.',
    entityType: 'SALES_PROJECT',
    steps: [
      { stepNumber: 1, name: 'Director de operaciones', timeoutHours: 48 },
      { stepNumber: 2, name: 'CEO', timeoutHours: 72 },
    ],
  },
  {
    name: 'Aprobación de orden de compra',
    description: 'Todas las órdenes de compra requieren autorización.',
    entityType: 'PURCHASE_ORDER',
    steps: [{ stepNumber: 1, name: 'Compras / Administración', timeoutHours: 48 }],
  },
  {
    name: 'Validación de cierre de actividad',
    description: 'El arquitecto valida OT terminadas en campo antes de cerrar visitas y tickets.',
    entityType: 'ACTIVITY_CLOSURE',
    steps: [
      {
        stepNumber: 1,
        name: 'Arquitecto / Validación final',
        description: 'Revisa evidencias y autoriza el cierre',
        timeoutHours: 48,
      },
    ],
  },
];

@Injectable()
export class WorkflowSeedService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Bootstrap en background — no bloquea el arranque del API.
    void this.seedAllCompanies().catch((err) =>
      this.logger.warn(`Seed workflows: ${err instanceof Error ? err.message : err}`),
    );
  }

  async seedAllCompanies() {
    const companies = await this.prisma.companyProfile.findMany({ select: { id: true } });
    for (const c of companies) {
      await this.seedForCompany(c.id);
    }
  }

  async seedForCompany(companyId: number) {
    for (const wf of DEFAULT_WORKFLOWS) {
      const existing = await this.prisma.workflowDefinition.findFirst({
        where: { companyId, name: wf.name },
        select: { id: true },
      });
      if (existing) continue;

      await this.prisma.workflowDefinition.create({
        data: {
          companyId,
          name: wf.name,
          description: wf.description,
          entityType: wf.entityType,
          status: 'ACTIVE',
          steps: {
            create: wf.steps.map((s, idx) => ({
              stepNumber: s.stepNumber,
              name: s.name,
              description: s.description ?? null,
              timeoutHours: s.timeoutHours ?? null,
              autoApproveCondition: s.autoApproveCondition ?? null,
              sortOrder: idx,
            })),
          },
        },
      });
      this.logger.log(`Workflow seed ✅ "${wf.name}" · company ${companyId}`);
    }
    await this.upsertAutoApproveConditions(companyId);
  }

  /** Rellena autoApproveCondition en workflows ya existentes (solo si el paso no tiene valor). */
  private async upsertAutoApproveConditions(companyId: number) {
    const rules: Record<string, Record<number, string>> = {
      'Aprobación de descuento en cotización': {
        1: 'maxDiscountPercent<=18',
        2: 'maxDiscountPercent<=22',
      },
    };

    for (const [name, stepRules] of Object.entries(rules)) {
      const def = await this.prisma.workflowDefinition.findFirst({
        where: { companyId, name },
        include: { steps: true },
      });
      if (!def) continue;

      for (const step of def.steps) {
        const cond = stepRules[step.stepNumber];
        if (!cond || step.autoApproveCondition) continue;
        await this.prisma.workflowStep.update({
          where: { id: step.id },
          data: { autoApproveCondition: cond },
        });
        this.logger.log(`Workflow upsert autoApprove · "${name}" paso ${step.stepNumber} · company ${companyId}`);
      }
    }
  }
}
