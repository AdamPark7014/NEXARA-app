import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { VentasService } from './ventas.service.js';
import { PdfGeneratorService } from './pdf-generator.service.js';
import { CotizacionesModule } from '../cotizaciones/cotizaciones.module.js';
import { VentasClientesController } from './ventas-clientes.controller.js';
import { VentasLeadsController } from './ventas-leads.controller.js';
import { VentasOportunidadesController } from './ventas-oportunidades.controller.js';
import { VentasProyectosController } from './ventas-proyectos.controller.js';
import { VentasReportesController } from './ventas-reportes.controller.js';
import { VentasCotizacionesController } from './ventas-cotizaciones.controller.js';
import { VentasOrderTemplatesController } from './ventas-order-templates.controller.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WorkflowModule } from '../workflow/workflow.module.js';

@Module({
  imports: [PrismaModule, AuthModule, forwardRef(() => CotizacionesModule), NotificationsModule, WorkflowModule],
  providers: [VentasService, PdfGeneratorService],
  exports: [VentasService],
  controllers: [VentasClientesController, VentasLeadsController, VentasOportunidadesController, VentasProyectosController, VentasReportesController, VentasCotizacionesController, VentasOrderTemplatesController],
})
export class VentasModule {}
