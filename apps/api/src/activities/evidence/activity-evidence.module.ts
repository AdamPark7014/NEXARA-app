import { Module } from '@nestjs/common';
import { ActivityEvidenceService } from './activity-evidence.service';
import { ActivityEvidenceFieldsService } from './activity-evidence-fields.service.js';
import { ActivityEvidenceZipService } from './activity-evidence-zip.service.js';
import { ActivityEvidenceController } from './activity-evidence.controller';
import { ActivityEvidenceFieldsController } from './activity-evidence-fields.controller.js';
import { CoreModule } from '../../common/core.module';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { ActivitiesModule } from '../activities.module.js';
import { NotificationsModule } from '../../notifications/notifications.module.js';
import { ActivityGeofenceModule } from '../geofence/activity-geofence.module.js';

@Module({
  imports: [CoreModule, PrismaModule, ActivitiesModule, NotificationsModule, ActivityGeofenceModule],
  controllers: [ActivityEvidenceController, ActivityEvidenceFieldsController],
  providers: [ActivityEvidenceService, ActivityEvidenceFieldsService, ActivityEvidenceZipService],
  exports: [ActivityEvidenceService, ActivityEvidenceFieldsService],
})
export class ActivityEvidenceModule {}
