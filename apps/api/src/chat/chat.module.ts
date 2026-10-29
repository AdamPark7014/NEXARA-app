import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { LigasService } from './ligas/ligas.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [PrismaModule, RealtimeModule, NotificationsModule],
  controllers: [ChatController],
  providers: [ChatService, LigasService],
  exports: [ChatService, LigasService],
})
export class ChatModule {}
