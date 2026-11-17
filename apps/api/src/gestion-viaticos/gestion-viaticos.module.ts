import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CostosModule } from '../costos/costos.module.js';
import { GestionViaticosController } from './gestion-viaticos.controller.js';
import { GestionViaticosService } from './gestion-viaticos.service.js';

@Module({
  imports: [PrismaModule, NotificationsModule, CostosModule],
  controllers: [GestionViaticosController],
  providers: [GestionViaticosService],
  exports: [GestionViaticosService],
})
export class GestionViaticosModule {}
