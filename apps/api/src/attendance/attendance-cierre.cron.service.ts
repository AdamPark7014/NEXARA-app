import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AttendanceService } from './attendance.service.js';
import { WORKDAY_TIMEZONE } from '../common/time/workday.js';
import { HORA_CIERRE_AUTOMATICO } from './asistencia-confiable.js';

/**
 * Se olvidó checar la salida.
 *
 * A las 23:30 de México toda jornada abierta del día recibe su salida:
 * `min(entrada + 9 h, 23:30)`, marcada como cierre automático y a revisión. Sin
 * esto, la jornada seguía abierta y al día siguiente la persona no podía checar
 * su entrada.
 *
 * Sin `timeZone` el cron usa la del proceso, que en el contenedor es UTC: la
 * tarea correría a las 17:30 de México.
 */
@Injectable()
export class AttendanceCierreCronService {
  private readonly logger = new Logger(AttendanceCierreCronService.name);

  constructor(private readonly attendance: AttendanceService) {}

  @Cron(`${HORA_CIERRE_AUTOMATICO.minuto} ${HORA_CIERRE_AUTOMATICO.hora} * * *`, {
    name: 'attendance-cierre-automatico',
    timeZone: WORKDAY_TIMEZONE,
  })
  async cerrarJornadasOlvidadas() {
    try {
      const { cerradas } = await this.attendance.cerrarJornadasOlvidadas();
      if (cerradas) this.logger.log(`Jornadas cerradas automáticamente: ${cerradas}`);
    } catch (error) {
      this.logger.error('Cierre automático de jornadas falló', error as Error);
    }
  }
}
