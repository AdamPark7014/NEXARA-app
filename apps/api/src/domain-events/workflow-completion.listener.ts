import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { DOMAIN_EVENTS, type EntityLifecyclePayload } from './domain-event.types.js';

import { DomainEventBusService } from './domain-event-bus.service.js';

import { CotizacionesService } from '../cotizaciones/cotizaciones.service.js';

import { VentasService } from '../ventas/ventas.service.js';

import { ActivityLifecycleService } from '../activities/activity-lifecycle.service.js';

import { ExpensesService } from '../expenses/expenses.service.js';

import { ViaticosService } from '../viaticos/viaticos.service.js';

import { ProcurementService } from '../procurement/procurement.service.js';

/**
 * Efectos de dominio al completar workflows — desacoplado de WorkflowService
 * para evitar dependencias circulares con módulos de negocio.
 */
@Injectable()
export class WorkflowCompletionListener implements OnModuleInit {
  private readonly logger = new Logger(WorkflowCompletionListener.name);

  constructor(
    private readonly bus: DomainEventBusService,
    private readonly cotizaciones: CotizacionesService,
    private readonly ventas: VentasService,
    private readonly activityLifecycle: ActivityLifecycleService,
    private readonly expenses: ExpensesService,
    private readonly viaticos: ViaticosService,
    private readonly procurement: ProcurementService,
  ) {}

  onModuleInit() {
    this.bus.subscribe<EntityLifecyclePayload>(DOMAIN_EVENTS.ENTITY_UPDATED, (payload) => {
      if (!payload.payload?.workflowComplete) return;

      if (!payload.companyId) return;

      const type = payload.entityType.toUpperCase();

      const actorId = payload.userId ?? (payload.payload?.startedById as number | undefined);

      const handle = async () => {
        switch (type) {
          case 'COTIZACION':
            await this.cotizaciones.onWorkflowDiscountApproved(
              payload.entityId,
              payload.companyId!,
              actorId,
            );
            break;

          case 'SALES_PROJECT':
            await this.ventas.onWorkflowProjectApproved(
              payload.entityId,
              payload.companyId!,
              actorId,
            );
            break;

          case 'ACTIVITY_CLOSURE':
            await this.activityLifecycle.onActivityValidated({
              activityId: payload.entityId,
              companyId: payload.companyId ?? null,
            });
            break;

          case 'EXPENSE':
            await this.expenses.onWorkflowApproved(
              payload.entityId,
              payload.companyId!,
              actorId,
            );
            break;

          case 'VIATIC':
            await this.viaticos.onWorkflowApproved(
              payload.entityId,
              payload.companyId!,
              actorId,
            );
            break;

          case 'PURCHASE_ORDER':
            await this.procurement.onPurchaseOrderWorkflowApproved(
              payload.entityId,
              payload.companyId!,
              actorId,
            );
            break;

          default:
            break;
        }
      };

      void handle().catch((err) =>
        this.logger.warn(
          `${type} workflow complete #${payload.entityId}: ${
            err instanceof Error ? err.message : err
          }`,
        ),
      );
    });
  }
}
