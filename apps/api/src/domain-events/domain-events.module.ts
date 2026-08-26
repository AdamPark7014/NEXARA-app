import { Global, Module } from '@nestjs/common';
import { DomainEventBusService } from './domain-event-bus.service.js';
import { WorkflowDomainListener } from './workflow-domain.listener.js';
import { WebhookDomainListener } from './webhook-domain.listener.js';
import { WorkflowCompletionListener } from './workflow-completion.listener.js';
import { WorkflowRejectionListener } from './workflow-rejection.listener.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { WebhooksModule } from '../webhooks/webhooks.module.js';
import { CotizacionesModule } from '../cotizaciones/cotizaciones.module.js';
import { ExpensesModule } from '../expenses/expenses.module.js';
import { ViaticosModule } from '../viaticos/viaticos.module.js';
import { ProcurementModule } from '../procurement/procurement.module.js';
import { VentasModule } from '../ventas/ventas.module.js';
import { ActivitiesModule } from '../activities/activities.module.js';

@Global()
@Module({
  imports: [
    WorkflowModule,
    WebhooksModule,
    CotizacionesModule,
    ExpensesModule,
    ViaticosModule,
    ProcurementModule,
    VentasModule,
    ActivitiesModule,
  ],
  providers: [
    DomainEventBusService,
    WorkflowDomainListener,
    WebhookDomainListener,
    WorkflowCompletionListener,
    WorkflowRejectionListener,
  ],
  exports: [DomainEventBusService],
})
export class DomainEventsModule {}
