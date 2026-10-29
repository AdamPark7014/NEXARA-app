import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FestivosController } from './festivos.controller.js';
import { FestivosService } from './festivos.service.js';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [FestivosController],
  providers: [FestivosService],
  exports: [FestivosService],
})
export class FestivosModule {}
