import type { AutoApprovalContext } from '../workflow/auto-approval.service.js';

/** Catálogo de eventos de dominio publicados en el bus interno. */
export const DOMAIN_EVENTS = {
  AUTO_APPROVAL_EVALUATE: 'workflow.auto_approval.evaluate',
  ENTITY_CREATED: 'entity.created',
  ENTITY_UPDATED: 'entity.updated',
} as const;

export type DomainEventName = (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];

export type EntityLifecyclePayload = {
  entityType: string;
  entityId: number;
  companyId?: number | null;
  userId?: number;
  action: 'created' | 'updated' | 'deleted';
  payload?: Record<string, unknown>;
};

export type DomainEventPayloads = {
  [DOMAIN_EVENTS.AUTO_APPROVAL_EVALUATE]: AutoApprovalContext;
  [DOMAIN_EVENTS.ENTITY_CREATED]: EntityLifecyclePayload;
  [DOMAIN_EVENTS.ENTITY_UPDATED]: EntityLifecyclePayload;
};

export type DomainEventHandler<T = unknown> = (payload: T) => void | Promise<void>;
