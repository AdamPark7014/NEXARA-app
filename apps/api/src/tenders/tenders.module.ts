import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TendersService } from './tenders.service.js';
import { TendersController } from './tenders.controller.js';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule],
  providers: [TendersService],
  controllers: [TendersController],
  exports: [TendersService],
})
export class TendersModule {}
