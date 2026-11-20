import { Module, forwardRef } from '@nestjs/common';
import { CotizacionesService } from './cotizaciones.service.js';
import { CotizacionesCoreService } from './cotizaciones-core.service.js';
import { CotizacionesController } from './cotizaciones.controller.js';
import { CotizacionesPublicasController } from './cotizaciones-publicas.controller.js';
import { ExportablesNasController } from './exportables-nas.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { VentasModule } from '../ventas/ventas.module.js';
import { SmartQuoteModule } from '../smart-quote/smart-quote.module.js';
import { AiModule } from '../ai/ai.module.js';
import { CotizarFraseService } from './cotizar-frase.service.js';
import { RedactarTextosService } from './redactar-textos.service.js';
import { SeguimientoCotizacionService } from './seguimiento-cotizacion.service.js';
import { ExportablesNasService } from './exportables-nas.service.js';
import { NasExportGuard } from '../common/nas-export.guard.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    WorkflowModule,
    NotificationsModule,
    forwardRef(() => VentasModule),
    forwardRef(() => SmartQuoteModule),
    AiModule,
  ],
  // Las rutas literales (public, exportables) van antes que `cotizaciones/:id`.
  controllers: [CotizacionesPublicasController, ExportablesNasController, CotizacionesController],
  providers: [CotizacionesService, CotizacionesCoreService, CotizarFraseService, RedactarTextosService, SeguimientoCotizacionService, ExportablesNasService, NasExportGuard],
  exports: [CotizacionesService, CotizacionesCoreService],
})
export class CotizacionesModule {}