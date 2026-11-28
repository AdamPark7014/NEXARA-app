import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DeshacerController } from './deshacer.controller.js';
import { DeshacerService } from './deshacer.service.js';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [DeshacerController],
  providers: [DeshacerService],
  exports: [DeshacerService],
})
export class DeshacerModule {}
