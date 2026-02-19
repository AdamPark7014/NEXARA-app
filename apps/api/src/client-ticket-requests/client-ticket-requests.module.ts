import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ClientTicketRequestsController } from './client-ticket-requests.controller.js';
import { ClientTicketRequestsService } from './client-ticket-requests.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [ClientTicketRequestsController],
  providers: [ClientTicketRequestsService],
})
export class ClientTicketRequestsModule {}
