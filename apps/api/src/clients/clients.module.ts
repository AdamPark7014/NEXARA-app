import { Module } from '@nestjs/common';
import { ClientsService } from './clients.service.js';
import { ClientsController } from './clients.controller.js';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ClientsController],
  providers: [ClientsService],
})
export class ClientsModule {}
