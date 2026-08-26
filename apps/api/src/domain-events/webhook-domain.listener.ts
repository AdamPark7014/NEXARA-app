import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DOMAIN_EVENTS, type EntityLifecyclePayload } from './domain-event.types.js';
import { DomainEventBusService } from './domain-event-bus.service.js';
import type { AutoApprovalContext } from '../workflow/auto-approval.service.js';
import { WebhooksService } from '../webhooks/webhooks.service.js';

@Injectable()
export class WebhookDomainListener implements OnModuleInit {
  private readonly logger = new Logger(WebhookDomainListener.name);

  constructor(
    private readonly bus: DomainEventBusService,
    private readonly webhooks: WebhooksService,
  ) {}

  onModuleInit() {
    this.bus.subscribe<AutoApprovalContext>(DOMAIN_EVENTS.AUTO_APPROVAL_EVALUATE, (context) => {
      void this.webhooks
        .emit(
          'approval.requested',
          {
            entityType: context.entityType,
            entityId: context.entityId,
            userId: context.userId,
            payload: context.payload,
          },
          context.companyId,
        )
        .catch((err) =>
          this.logger.warn(
            `Webhook approval.requested: ${err instanceof Error ? err.message : err}`,
          ),
        );
    });

    this.bus.subscribe<EntityLifecyclePayload>(DOMAIN_EVENTS.ENTITY_CREATED, (payload) => {
      this.bridgeEntityWebhook(payload);
    });

    this.bus.subscribe<EntityLifecyclePayload>(DOMAIN_EVENTS.ENTITY_UPDATED, (payload) => {
      this.bridgeEntityWebhook(payload);
    });
  }

  private bridgeEntityWebhook(payload: EntityLifecyclePayload) {
    const type = payload.entityType.toUpperCase();
    let event: string | undefined;

    if (type === 'SALES_OPPORTUNITY' && payload.action === 'updated') {
      const stage = String(payload.payload?.stage ?? '').toUpperCase();
      if (stage === 'WON') event = 'opportunity.won';
      if (stage === 'LOST') event = 'opportunity.lost';
    } else if (type === 'PAYMENT' && payload.action === 'created') {
      event = 'payment.registered';
    } else if (type === 'INVOICE' && payload.action === 'updated') {
      if (payload.payload?.fullyPaid) event = 'invoice.paid';
      else if (String(payload.payload?.alertType ?? '').toLowerCase() === 'overdue') event = 'invoice.overdue';
    } else if (type === 'USER' && payload.action === 'updated') {
      const alertType = String(payload.payload?.alertType ?? '').toLowerCase();
      if (alertType === 'inactive') event = 'user.inactive';
      if (alertType === 'locked') event = 'user.locked';
    } else if ((type === 'SALES_CLIENT' || type === 'CLIENT') && payload.action === 'created') {
      event = 'client.created';
    } else if ((type === 'SALES_CLIENT' || type === 'CLIENT') && payload.action === 'updated') {
      event = 'client.updated';
    } else if (type === 'COTIZACION' && payload.action === 'created') {
      event = 'quote.created';
    } else if (type === 'COTIZACION' && payload.action === 'updated') {
      if (payload.payload?.discountRejected) event = 'quote.discount_rejected';
      else if (payload.payload?.discountApproved) event = 'quote.discount_approved';
      else if (String(payload.payload?.status ?? '').toUpperCase() === 'APPROVED') event = 'quote.approved';
    } else if (payload.action === 'updated' && payload.payload?.workflowComplete) {
      event = 'approval.approved';
      if (type === 'EXPENSE') event = 'expense.approved';
      if (type === 'VIATIC') event = 'viatic.approved';
      if (type === 'PURCHASE_ORDER') event = 'purchase_order.confirmed';
      if (type === 'SALES_PROJECT') event = 'sales_project.approved';
      if (type === 'ACTIVITY_CLOSURE') event = 'activity.closure_approved';
    } else if (payload.action === 'updated' && payload.payload?.workflowRejected) {
      event = 'approval.rejected';
      if (type === 'EXPENSE') event = 'expense.rejected';
      if (type === 'VIATIC') event = 'viatic.rejected';
      if (type === 'PURCHASE_ORDER') event = 'purchase_order.rejected';
      if (type === 'SALES_PROJECT') event = 'sales_project.rejected';
      if (type === 'ACTIVITY_CLOSURE') event = 'activity.closure_rejected';
      if (type === 'COTIZACION' && payload.payload?.discountRejected) event = 'quote.discount_rejected';
    } else if (type === 'EXPENSE' && payload.action === 'updated') {
      const estatus = String(payload.payload?.estatusPago ?? '').toLowerCase();
      if (estatus === 'rechazado') event = 'expense.rejected';
      if (estatus === 'aprobado') event = 'expense.approved';
    } else if (type === 'PURCHASE_ORDER' && payload.action === 'updated') {
      const status = String(payload.payload?.status ?? '').toUpperCase();
      if (status === 'CONFIRMED') event = 'purchase_order.confirmed';
      if (status === 'CANCELLED' && payload.payload?.workflowRejected) event = 'purchase_order.rejected';
    } else if (type === 'SALES_PROJECT' && payload.action === 'updated') {
      if (payload.payload?.projectApproved) event = 'sales_project.approved';
      if (payload.payload?.projectRejected) event = 'sales_project.rejected';
    } else if (type === 'ACTIVITY' && payload.action === 'updated') {
      const alertType = String(payload.payload?.alertType ?? '').toLowerCase();
      const estatus = String(payload.payload?.estatus ?? '').toLowerCase();
      if (alertType === 'sla_breach') event = 'ticket.sla_breach';
      else if (/finalizada/.test(estatus)) event = 'activity.completed';
      else if (payload.payload?.closureApproved) event = 'activity.closure_approved';
      else if (payload.payload?.closureRejected) event = 'activity.closure_rejected';
    } else if (type === 'INVENTORY' && payload.action === 'updated') {
      const alertType = String(payload.payload?.alertType ?? '').toLowerCase();
      if (alertType === 'low') event = 'stock.low';
      if (alertType === 'dead') event = 'stock.dead';
    }

    if (!event) return;
    void this.webhooks
      .emit(
        event,
        {
          entityType: payload.entityType,
          entityId: payload.entityId,
          userId: payload.userId,
          action: payload.action,
          ...(payload.payload ?? {}),
        },
        payload.companyId,
      )
      .catch((err) =>
        this.logger.warn(`Webhook ${event}: ${err instanceof Error ? err.message : err}`),
      );
  }
}
