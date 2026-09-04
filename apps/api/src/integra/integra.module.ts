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
import { IntegraEdgeService } from './integra-edge.service';
import {
  IntegraEdgeController,
  IntegraEdgeAdminController,
} from './integra-edge.controller';
import { IntegraPushService } from './integra-push.service';
import { IntegraPushController } from './integra-push.controller';
import { IntegraAcsFanoutService } from './integra-acs-fanout.service';
import { IntegraSpacesService } from './integra-spaces.service';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [ConfigModule, PrismaModule, AuditModule, ServiceClientsModule, IdentityModule],
  controllers: [
    IntegraController,
    IntegraEdgeController,
    IntegraEdgeAdminController,
    IntegraPushController,
  ],
  providers: [
    IntegraArtemisService,
    IntegraSiteService,
    IntegraSyncService,
    IntegraMediaService,
    IntegraPortfolioService,
    IntegraEdgeService,
    IntegraPushService,
    IntegraAcsFanoutService,
    IntegraSpacesService,
  ],
  exports: [
    IntegraArtemisService,
    IntegraSiteService,
    IntegraSyncService,
    IntegraPortfolioService,
    IntegraEdgeService,
    IntegraPushService,
    IntegraAcsFanoutService,
    IntegraSpacesService,
  ],
})
export class IntegraModule {}
