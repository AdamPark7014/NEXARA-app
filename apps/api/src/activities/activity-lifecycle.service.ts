import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ACTIVITY_STATUS, statusVariants } from './activity-status.js';

/**
 * Efectos en cadena al cerrar una actividad.
 *
 * El cierre de una actividad es el punto donde el trabajo de campo se convierte
 * en información para el resto del ERP, pero hasta ahora no propagaba nada: las
 * entidades que ya apuntaban a la actividad se quedaban desincronizadas.
 *
 * Costuras que cierra:
 *
 *  - **Visita de contrato** (`MaintenanceContractVisit.activityId`).
 *    `materializeVisitAsActivity` crea la actividad y deja la visita en
 *    `GENERATED`; nada la pasaba a `COMPLETED`, así que `completedAt` quedaba
 *    nulo para siempre. Analítica, KPIs de dirección y alertas de contrato
 *    contaban como pendientes visitas ya realizadas.
 *
 *  - **Solicitud de ticket del cliente** (`ClientTicketRequest.activityId`).
 *    El cliente veía su solicitud abierta indefinidamente aunque el servicio ya
 *    estuviera terminado.
 *
 *  - **Motor de aprobaciones**. `WorkflowDefinition` / `WorkflowInstance`
 *    existían sin que ningún módulo los invocara. Aquí se enchufan: si la
 *    empresa tiene definido un flujo activo para el cierre de actividades, se
 *    abre la instancia; si no lo tiene, no pasa nada.
 *
 * Todo es best-effort y aislado: un fallo propagando efectos **no** debe
 * revertir el cierre de la actividad, que ya ocurrió en campo.
 */

/** Nombre de `WorkflowDefinition.entityType` que dispara el cierre. */
export const ACTIVITY_CLOSURE_WORKFLOW = 'ACTIVITY_CLOSURE';

export type ActivityClosureOutcome = {
  contractVisitCompleted: boolean;
  clientTicketClosed: boolean;
  workflowInstanceId: number | null;
  errors: string[];
};

@Injectable()
export class ActivityLifecycleService {
  private readonly logger = new Logger(ActivityLifecycleService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Propaga el cierre de una actividad. Nunca lanza: devuelve qué se pudo hacer
   * y qué falló, para que el llamador pueda registrarlo sin arriesgar la
   * operación principal.
   */
  /**
   * ¿Tiene la empresa definida la validación del Arquitecto?
   *
   * Si la tiene, el trabajo terminado en campo pasa a `Por Validar` y espera su
   * visto bueno. Si no, se cierra directo como siempre: no dejamos actividades
   * atascadas en empresas que no han configurado el flujo.
   */
  async requiresArchitectValidation(companyId: number | null): Promise<boolean> {
    if (companyId == null || companyId <= 0) return false;
    try {
      const definition = await this.prisma.workflowDefinition.findFirst({
        where: { entityType: ACTIVITY_CLOSURE_WORKFLOW, status: 'ACTIVE', companyId },
        select: { id: true, steps: { select: { id: true }, take: 1 } },
      });
      return Boolean(definition && definition.steps.length > 0);
    } catch (error) {
      this.logger.warn(
        `No se pudo comprobar el flujo de validación: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  async onActivityFinished(input: {
    activityId: number;
    companyId: number | null;
    actorId?: number | null;
    /** Falso mientras la actividad espera la validación del Arquitecto. */
    applyClosureEffects?: boolean;
  }): Promise<ActivityClosureOutcome> {
    const outcome: ActivityClosureOutcome = {
      contractVisitCompleted: false,
      clientTicketClosed: false,
      workflowInstanceId: null,
      errors: [],
    };

    const { activityId, applyClosureEffects = true } = input;
    if (!Number.isFinite(activityId) || activityId <= 0) {
      outcome.errors.push('activityId inválido');
      return outcome;
    }

    if (applyClosureEffects) {
      outcome.contractVisitCompleted = await this.completeContractVisit(activityId, outcome);
      outcome.clientTicketClosed = await this.closeClientTicketRequest(activityId, outcome);
    }
    outcome.workflowInstanceId = await this.startClosureWorkflow(input, outcome);

    return outcome;
  }

  /**
   * El Arquitecto aprobó: la actividad pasa a finalizada y ahora sí se propagan
   * los efectos que estaban esperando su visto bueno.
   */
  async onActivityValidated(input: {
    activityId: number;
    companyId: number | null;
  }): Promise<ActivityClosureOutcome> {
    const outcome: ActivityClosureOutcome = {
      contractVisitCompleted: false,
      clientTicketClosed: false,
      workflowInstanceId: null,
      errors: [],
    };

    const { activityId } = input;
    if (!Number.isFinite(activityId) || activityId <= 0) {
      outcome.errors.push('activityId inválido');
      return outcome;
    }

    try {
      await this.prisma.activity.updateMany({
        where: { id: activityId, estatus: { in: statusVariants(ACTIVITY_STATUS.POR_VALIDAR) } },
        data: { estatus: ACTIVITY_STATUS.FINALIZADA },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outcome.errors.push(`marcar finalizada: ${message}`);
      this.logger.warn(`No se pudo finalizar la actividad ${activityId}: ${message}`);
    }

    outcome.contractVisitCompleted = await this.completeContractVisit(activityId, outcome);
    outcome.clientTicketClosed = await this.closeClientTicketRequest(activityId, outcome);

    return outcome;
  }

  /** Marca como COMPLETED la visita de contrato que originó la actividad. */
  private async completeContractVisit(
    activityId: number,
    outcome: ActivityClosureOutcome,
  ): Promise<boolean> {
    try {
      const visits = this.prisma as unknown as {
        maintenanceContractVisit: {
          updateMany: (args: unknown) => Promise<{ count: number }>;
        };
      };

      // updateMany + filtro por estado: idempotente y sin pisar una visita ya
      // cerrada o explícitamente omitida (SKIPPED).
      const result = await visits.maintenanceContractVisit.updateMany({
        where: { activityId, status: { in: ['SCHEDULED', 'GENERATED'] } },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      return result.count > 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outcome.errors.push(`visita de contrato: ${message}`);
      this.logger.warn(`No se pudo cerrar la visita de la actividad ${activityId}: ${message}`);
      return false;
    }
  }

  /** Cierra la solicitud del portal de cliente que originó la actividad. */
  private async closeClientTicketRequest(
    activityId: number,
    outcome: ActivityClosureOutcome,
  ): Promise<boolean> {
    try {
      const result = await this.prisma.clientTicketRequest.updateMany({
        where: { activityId, status: { in: ['NEW', 'ASSIGNED'] } },
        data: { status: 'CLOSED' },
      });
      return result.count > 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outcome.errors.push(`solicitud de cliente: ${message}`);
      this.logger.warn(`No se pudo cerrar la solicitud de la actividad ${activityId}: ${message}`);
      return false;
    }
  }

  /**
   * Abre la instancia de aprobación de cierre, si la empresa tiene definido el
   * flujo. La ausencia de definición es el caso normal, no un error.
   */
  private async startClosureWorkflow(
    input: { activityId: number; companyId: number | null; actorId?: number | null },
    outcome: ActivityClosureOutcome,
  ): Promise<number | null> {
    const { activityId, companyId, actorId } = input;
    if (companyId == null || companyId <= 0 || !actorId) return null;

    try {
      const definition = await this.prisma.workflowDefinition.findFirst({
        where: {
          entityType: ACTIVITY_CLOSURE_WORKFLOW,
          status: 'ACTIVE',
          companyId,
        },
        include: { steps: { orderBy: { stepNumber: 'asc' } } },
      });
      if (!definition || definition.steps.length === 0) return null;

      // No duplicar si ya hay una instancia abierta para esta actividad.
      const existing = await this.prisma.workflowInstance.findFirst({
        where: {
          workflowId: definition.id,
          entityType: ACTIVITY_CLOSURE_WORKFLOW,
          entityId: activityId,
          isComplete: false,
          isCancelled: false,
          companyId,
        },
        select: { id: true },
      });
      if (existing) return existing.id;

      const instance = await this.prisma.workflowInstance.create({
        data: {
          companyId,
          workflowId: definition.id,
          entityId: activityId,
          entityType: ACTIVITY_CLOSURE_WORKFLOW,
          currentStep: 1,
          startedById: actorId,
          approvals: { create: { stepId: definition.steps[0].id, status: 'PENDING' } },
        },
        select: { id: true },
      });

      return instance.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outcome.errors.push(`workflow de cierre: ${message}`);
      this.logger.warn(`No se pudo abrir el workflow de cierre de ${activityId}: ${message}`);
      return null;
    }
  }
}
