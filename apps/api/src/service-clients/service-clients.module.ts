import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ServiceClientsController } from './service-clients.controller.js';
import { ServiceClientsService } from './service-clients.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ServiceClientsController],
  providers: [ServiceClientsService],
  exports: [ServiceClientsService],
})
export class ServiceClientsModule {}
