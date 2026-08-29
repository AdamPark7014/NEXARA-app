import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { IntegraController } from './integra.controller';
import { IntegraArtemisService } from './integra-artemis.service';
import { IntegraSiteService } from './integra-site.service';
import { IntegraSyncService } from './integra-sync.service';
import { IntegraMediaService } from './integra-media.service';

@Module({
  imports: [ConfigModule, PrismaModule, AuditModule],
  controllers: [IntegraController],
  providers: [
    IntegraArtemisService,
    IntegraSiteService,
    IntegraSyncService,
    IntegraMediaService,
  ],
  exports: [IntegraArtemisService, IntegraSiteService, IntegraSyncService],
})
export class IntegraModule {}
