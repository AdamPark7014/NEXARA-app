import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { NotificationsModule } from '../../notifications/notifications.module.js';
import { ActivityGeofenceService } from './activity-geofence.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [ActivityGeofenceService],
  exports: [ActivityGeofenceService],
})
export class ActivityGeofenceModule {}
