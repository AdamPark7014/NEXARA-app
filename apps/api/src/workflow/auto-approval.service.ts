/**
 * AutoApprovalService — dispara workflows de aprobación automáticamente cuando
 * una entidad cumple cierta política de negocio (descuento alto, monto que
 * supera umbral, presupuesto out-of-policy, etc.).
 *
 * Filosofía:
 *  - El módulo de dominio (cotizaciones, expenses, viaticos…) NO conoce los
 *    workflows, solo notifica al `AutoApprovalService` el evento + payload.
 *  - El servicio consulta una tabla declarativa de reglas y, si alguna matchea,
 *    invoca `WorkflowService.requestApproval()` con el `workflowDefinitionId`
 *    correspondiente.
 *  - El workflow service ya es idempotente: si hay instancia abierta, la
 *    devuelve sin duplicar.
 *
 * Reglas incluidas:
 *  - COTIZACION descuento > 15 %  → "Aprobación de descuento en cotización"
 *  - EXPENSE   monto    > 5 000   → "Aprobación de gasto operativo"
 *  - VIATIC    out-of-policy      → "Aprobación de viáticos"
 *  - SALES_PROJECT presupuesto > 500 000 → "Aprobación de proyecto > $500k"
 *  - PURCHASE_ORDER cualquier OC  → "Aprobación de orden de compra"
 *
 * Si la definición no existe (no se ha corrido el seeder), simplemente loggea
 * un warning y continúa — el módulo de dominio nunca falla por esto.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { WorkflowService } from './workflow.service.js';

export type AutoApprovalContext = {
  /** Tipo de entidad — debe coincidir con el `entityType` de la `WorkflowDefinition`. */
  entityType:
    | 'COTIZACION'
    | 'EXPENSE'
    | 'VIATIC'
    | 'SALES_PROJECT'
    | 'PURCHASE_ORDER';
  /** PK de la entidad recién creada/actualizada. */
  entityId: number;
  /** Usuario que originó la acción (será `startedBy` del workflow). */
  userId: number;
  /** Payload arbitrario evaluado por la regla. */
  payload: Record<string, unknown>;
};

type AutoApprovalRule = {
  /** Nombre exacto del workflow registrado en el seeder. */
  workflowName: string;
  /** Predicado puro sobre payload — true ⇒ se dispara la solicitud. */
  shouldTrigger: (payload: Record<string, unknown>) => boolean;
};

const RULES: Record<AutoApprovalContext['entityType'], AutoApprovalRule[]> = {
  COTIZACION: [
    {
      workflowName: 'Aprobación de descuento en cotización',
      shouldTrigger: (p) => {
        const maxDiscount = Number(p.maxDiscountPercent ?? p.discountPercent ?? 0);
        return maxDiscount > 15;
      },
    },
  ],
  EXPENSE: [
    {
      workflowName: 'Aprobación de gasto operativo',
      shouldTrigger: (p) => {
        const amount = Number(p.amount ?? p.montoSolicitado ?? 0);
        return amount > 5000;
      },
    },
  ],
  VIATIC: [
    {
      workflowName: 'Aprobación de viáticos',
      shouldTrigger: (p) => {
        const amount = Number(p.amount ?? p.montoSolicitado ?? 0);
        const outOfPolicy = Boolean(p.outOfPolicy);
        return outOfPolicy || amount > 3000;
      },
    },
  ],
  SALES_PROJECT: [
    {
      workflowName: 'Aprobación de proyecto > $500k',
      shouldTrigger: (p) => Number(p.budget ?? 0) > 500000,
    },
  ],
  PURCHASE_ORDER: [
    {
      workflowName: 'Aprobación de orden de compra',
      shouldTrigger: (p) => Number(p.amount ?? p.totalAmount ?? 0) > 0,
    },
  ],
};

@Injectable()
export class AutoApprovalService {
  private readonly logger = new Logger(AutoApprovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowService,
  ) {}

  /**
   * Evalúa todas las reglas del `entityType` y dispara las que matchean.
   * Es idempotente — el WorkflowService ya filtra instancias abiertas.
   * Nunca lanza excepciones que afecten al dominio que lo invoca.
   */
  async evaluate(context: AutoApprovalContext): Promise<{
    triggered: string[];
    skipped: string[];
  }> {
    const triggered: string[] = [];
    const skipped: string[] = [];

    const candidates = RULES[context.entityType] || [];
    for (const rule of candidates) {
      try {
        if (!rule.shouldTrigger(context.payload)) {
          continue;
        }

        const def = await this.prisma.workflowDefinition.findUnique({
          where: { name: rule.workflowName },
          select: { id: true, status: true },
        });

        if (!def) {
          this.logger.warn(
            `AutoApproval: workflow "${rule.workflowName}" no existe. Corre seed-workflows.ts.`,
          );
          skipped.push(rule.workflowName);
          continue;
        }
        if (def.status !== 'ACTIVE') {
          skipped.push(rule.workflowName);
          continue;
        }

        await this.workflow.requestApproval({
          entityType: context.entityType,
          entityId: context.entityId,
          workflowDefinitionId: def.id,
          startedById: context.userId,
        });
        triggered.push(rule.workflowName);
        this.logger.log(
          `AutoApproval ✅ ${rule.workflowName} disparado para ${context.entityType}#${context.entityId}`,
        );
      } catch (err) {
        this.logger.error(
          `AutoApproval ❌ falló para ${rule.workflowName} (${context.entityType}#${context.entityId}): ${(err as Error).message}`,
        );
        skipped.push(rule.workflowName);
      }
    }

    return { triggered, skipped };
  }
}
