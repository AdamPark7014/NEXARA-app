import { Module } from '@nestjs/common';
import { GpsService } from './gps.service.js';
import { GpsController } from './gps.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ActivityGeofenceModule } from '../activities/geofence/activity-geofence.module.js';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { DevicesModule } from '../devices/devices.module.js';
import { GpsLatidoCronService } from './gps-latido.cron.service.js';

@Module({
  imports: [PrismaModule, AuthModule, ActivityGeofenceModule, AttendanceModule, DevicesModule],
  controllers: [GpsController],
  providers: [GpsService, GpsLatidoCronService],
  exports: [GpsService],
})
export class GpsModule {}
