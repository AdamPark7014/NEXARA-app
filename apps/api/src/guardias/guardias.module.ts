import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GuardiasController } from './guardias.controller.js';
import { GuardiasService } from './guardias.service.js';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [GuardiasController],
  providers: [GuardiasService],
  exports: [GuardiasService],
})
export class GuardiasModule {}
