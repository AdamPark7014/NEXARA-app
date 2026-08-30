import { ServiceClientsModule } from '../service-clients/service-clients.module.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { IntegraController } from './integra.controller';
import { IntegraArtemisService } from './integra-artemis.service';
import { IntegraSiteService } from './integra-site.service';
import { IntegraSyncService } from './integra-sync.service';
import { IntegraMediaService } from './integra-media.service';
import { IntegraPortfolioService } from './integra-portfolio.service';

@Module({
  imports: [ConfigModule, PrismaModule, AuditModule, ServiceClientsModule],
  controllers: [IntegraController],
  providers: [
    IntegraArtemisService,
    IntegraSiteService,
    IntegraSyncService,
    IntegraMediaService,
    IntegraPortfolioService,
  ],
  exports: [IntegraArtemisService, IntegraSiteService, IntegraSyncService, IntegraPortfolioService],
})
export class IntegraModule {}
