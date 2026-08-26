import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { AutoApprovalContext } from '../workflow/auto-approval.service.js';
import {
  DOMAIN_EVENTS,
  type DomainEventHandler,
  type DomainEventName,
  type EntityLifecyclePayload,
} from './domain-event.types.js';

/**
 * Bus de eventos de dominio in-process (Node EventEmitter).
 * Desacopla módulos de dominio de side-effects (workflows, webhooks, analytics).
 */
@Injectable()
export class DomainEventBusService {
  private readonly logger = new Logger(DomainEventBusService.name);
  private readonly emitter = new EventEmitter();

  subscribe<T>(event: DomainEventName, handler: DomainEventHandler<T>): void {
    this.emitter.on(event, (payload: T) => {
      void Promise.resolve(handler(payload)).catch((err) =>
        this.logger.warn(
          `Handler ${event}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    });
  }

  publish<T>(event: DomainEventName, payload: T): void {
    this.emitter.emit(event, payload);
  }

  /** Dispara evaluación de auto-aprobación vía bus (fire-and-forget). */
  requestAutoApproval(context: AutoApprovalContext): void {
    this.publish(DOMAIN_EVENTS.AUTO_APPROVAL_EVALUATE, context);
  }

  publishEntityLifecycle(
    action: EntityLifecyclePayload['action'],
    payload: Omit<EntityLifecyclePayload, 'action'>,
  ): void {
    const event =
      action === 'created' ? DOMAIN_EVENTS.ENTITY_CREATED : DOMAIN_EVENTS.ENTITY_UPDATED;
    this.publish(event, { ...payload, action });
  }
}
