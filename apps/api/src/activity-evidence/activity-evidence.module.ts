import { Module } from '@nestjs/common';
import { ActivityEvidenceService } from './activity-evidence.service';
import { ActivityEvidenceController } from './activity-evidence.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [ActivityEvidenceController],
  providers: [ActivityEvidenceService, PrismaService],
  exports: [ActivityEvidenceService],
})
export class ActivityEvidenceModule {}
