import { Module } from '@nestjs/common';
import { CotizacionesService } from './cotizaciones.service.js';
import { CotizacionesController } from './cotizaciones.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { WorkflowModule } from '../workflow/workflow.module.js';

@Module({
  imports: [PrismaModule, AuthModule, WorkflowModule],
  controllers: [CotizacionesController],
  providers: [CotizacionesService],
  exports: [CotizacionesService],
})
export class CotizacionesModule {}
