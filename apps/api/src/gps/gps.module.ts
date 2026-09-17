import { Module } from '@nestjs/common';
import { GpsService } from './gps.service.js';
import { GpsController } from './gps.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ActivityGeofenceModule } from '../activities/geofence/activity-geofence.module.js';

@Module({
  imports: [PrismaModule, AuthModule, ActivityGeofenceModule],
  controllers: [GpsController],
  providers: [GpsService],
  exports: [GpsService],
})
export class GpsModule {}
