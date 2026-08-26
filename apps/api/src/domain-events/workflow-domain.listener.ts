import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DOMAIN_EVENTS } from './domain-event.types.js';
import { DomainEventBusService } from './domain-event-bus.service.js';
import { AutoApprovalService, type AutoApprovalContext } from '../workflow/auto-approval.service.js';

@Injectable()
export class WorkflowDomainListener implements OnModuleInit {
  private readonly logger = new Logger(WorkflowDomainListener.name);

  constructor(
    private readonly bus: DomainEventBusService,
    private readonly autoApproval: AutoApprovalService,
  ) {}

  onModuleInit() {
    this.bus.subscribe<AutoApprovalContext>(DOMAIN_EVENTS.AUTO_APPROVAL_EVALUATE, async (context) => {
      await this.autoApproval.evaluate(context);
    });
  }
}
