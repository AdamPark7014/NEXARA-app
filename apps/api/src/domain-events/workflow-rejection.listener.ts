import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DOMAIN_EVENTS, type EntityLifecyclePayload } from './domain-event.types.js';
import { DomainEventBusService } from './domain-event-bus.service.js';
import { CotizacionesService } from '../cotizaciones/cotizaciones.service.js';
import { ExpensesService } from '../expenses/expenses.service.js';
import { ViaticosService } from '../viaticos/viaticos.service.js';
import { ProcurementService } from '../procurement/procurement.service.js';
import { VentasService } from '../ventas/ventas.service.js';
import { ActivityLifecycleService } from '../activities/activity-lifecycle.service.js';

@Injectable()
export class WorkflowRejectionListener implements OnModuleInit {
  private readonly logger = new Logger(WorkflowRejectionListener.name);

  constructor(
    private readonly bus: DomainEventBusService,
    private readonly cotizaciones: CotizacionesService,
    private readonly expenses: ExpensesService,
    private readonly viaticos: ViaticosService,
    private readonly procurement: ProcurementService,
    private readonly ventas: VentasService,
    private readonly activityLifecycle: ActivityLifecycleService,
  ) {}

  onModuleInit() {
    this.bus.subscribe<EntityLifecyclePayload>(DOMAIN_EVENTS.ENTITY_UPDATED, (payload) => {
      if (!payload.payload?.workflowRejected) return;
      if (!payload.companyId) return;

      const type = payload.entityType.toUpperCase();
      const comments = payload.payload?.comments as string | null | undefined;
      const actorId = payload.userId ?? (payload.payload?.startedById as number | undefined);

      const handle = async () => {
        switch (type) {
          case 'COTIZACION':
            await this.cotizaciones.onWorkflowDiscountRejected(
              payload.entityId,
              payload.companyId!,
              actorId,
              comments,
            );
            break;
          case 'EXPENSE':
            await this.expenses.onWorkflowRejected(
              payload.entityId,
              payload.companyId!,
              actorId,
              comments ?? undefined,
            );
            break;
          case 'VIATIC':
            await this.viaticos.onWorkflowRejected(
              payload.entityId,
              payload.companyId!,
              actorId,
              comments ?? undefined,
            );
            break;
          case 'PURCHASE_ORDER':
            await this.procurement.onPurchaseOrderWorkflowRejected(
              payload.entityId,
              payload.companyId!,
              actorId,
              comments ?? undefined,
            );
            break;
          case 'SALES_PROJECT':
            await this.ventas.onWorkflowProjectRejected(
              payload.entityId,
              payload.companyId!,
              actorId,
              comments ?? undefined,
            );
            break;
          case 'ACTIVITY_CLOSURE':
            await this.activityLifecycle.onActivityValidationRejected({
              activityId: payload.entityId,
              companyId: payload.companyId ?? null,
              actorId,
              comments,
            });
            break;
          default:
            break;
        }
      };

      void handle().catch((err) =>
        this.logger.warn(
          `${type} workflow rejected #${payload.entityId}: ${
            err instanceof Error ? err.message : err
          }`,
        ),
      );
    });
  }
}
