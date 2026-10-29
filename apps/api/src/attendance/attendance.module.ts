import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { EstadoUbicacionController } from './estado-ubicacion.controller.js';
import { AttendanceService } from './attendance.service';
import { AttendanceHybridService } from './attendance-hybrid.service';
import { AttendanceJustificationsService } from './attendance-justifications.service';
import { AttendanceCierreCronService } from './attendance-cierre.cron.service.js';
import { RecordatorioEntradaService } from './recordatorio-entrada.service.js';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DevicesModule } from '../devices/devices.module.js';
import { IntegraModule } from '../integra/integra.module';
import { ExcelModule } from '../common/excel.module.js';

@Module({
  imports: [PrismaModule, RealtimeModule, NotificationsModule, DevicesModule, IntegraModule, ExcelModule],
  // Antes que AttendanceController: su ruta fija no debe caer en una con parámetro.
  controllers: [EstadoUbicacionController, AttendanceController],
  providers: [
    AttendanceService,
    AttendanceHybridService,
    AttendanceJustificationsService,
    AttendanceCierreCronService,
    RecordatorioEntradaService,
  ],
  // El GPS de jornada completa con su primer punto la entrada que llegó sin ubicación.
  exports: [AttendanceService],
})
export class AttendanceModule {}
