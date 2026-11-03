import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module.js';
import { CotizacionesModule } from '../cotizaciones/cotizaciones.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { CotizacionAbiertaController } from './cotizacion-abierta.controller.js';
import { CotizacionAbiertaService } from './cotizacion-abierta.service.js';

@Module({
  imports: [PrismaModule, UsersModule, ActivitiesModule, CotizacionesModule],
  controllers: [CotizacionAbiertaController],
  providers: [CotizacionAbiertaService],
})
export class CotizacionAbiertaModule {}
