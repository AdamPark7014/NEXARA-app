import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceHybridService } from './attendance-hybrid.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { IntegraModule } from '../integra/integra.module';
import { ExcelModule } from '../common/excel.module.js';

@Module({
  imports: [PrismaModule, RealtimeModule, NotificationsModule, IntegraModule, ExcelModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceHybridService],
})
export class AttendanceModule {}
