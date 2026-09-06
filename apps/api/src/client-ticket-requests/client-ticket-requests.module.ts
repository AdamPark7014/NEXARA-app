import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ClientTicketRequestsController } from './client-ticket-requests.controller.js';
import { ClientTicketRequestsService } from './client-ticket-requests.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [ClientTicketRequestsController],
  providers: [ClientTicketRequestsService],
})
export class ClientTicketRequestsModule {}
