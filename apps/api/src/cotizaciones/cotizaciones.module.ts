import { Module, forwardRef } from '@nestjs/common';
import { CotizacionesService } from './cotizaciones.service.js';
import { CotizacionesController } from './cotizaciones.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { VentasModule } from '../ventas/ventas.module.js';
import { SmartQuoteModule } from '../smart-quote/smart-quote.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    WorkflowModule,
    NotificationsModule,
    forwardRef(() => VentasModule),
    forwardRef(() => SmartQuoteModule),
  ],
  controllers: [CotizacionesController],
  providers: [CotizacionesService],
  exports: [CotizacionesService],
})
export class CotizacionesModule {}
