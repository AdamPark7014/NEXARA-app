import { Module } from '@nestjs/common';
import { ActivityEvidenceService } from './activity-evidence.service';
import { ActivityEvidenceController } from './activity-evidence.controller';
import { CoreModule } from '../common/core.module';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ActivitiesModule } from '../activities/activities.module.js';

@Module({
  imports: [CoreModule, PrismaModule, ActivitiesModule],
  controllers: [ActivityEvidenceController],
  providers: [ActivityEvidenceService],
  exports: [ActivityEvidenceService],
})
export class ActivityEvidenceModule {}
