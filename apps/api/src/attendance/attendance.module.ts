import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { EstadoUbicacionController } from './estado-ubicacion.controller.js';
import { AttendanceService } from './attendance.service';
import { AttendanceHybridService } from './attendance-hybrid.service';
import { AttendanceJustificationsService } from './attendance-justifications.service';
import { AttendanceCierreCronService } from './attendance-cierre.cron.service.js';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { IntegraModule } from '../integra/integra.module';
import { ExcelModule } from '../common/excel.module.js';

@Module({
  imports: [PrismaModule, RealtimeModule, NotificationsModule, IntegraModule, ExcelModule],
  // Antes que AttendanceController: su ruta fija no debe caer en una con parámetro.
  controllers: [EstadoUbicacionController, AttendanceController],
  providers: [
    AttendanceService,
    AttendanceHybridService,
    AttendanceJustificationsService,
    AttendanceCierreCronService,
  ],
})
export class AttendanceModule {}
