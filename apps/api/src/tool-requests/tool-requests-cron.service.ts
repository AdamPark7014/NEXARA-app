import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WORKDAY_TIMEZONE } from '../common/time/workday.js';
import { runScheduledJob } from '../common/cron/run-scheduled-job.js';
import { ToolRequestsService } from './tool-requests.service';

@Injectable()
export class ToolRequestsCronService {
  private readonly logger = new Logger(ToolRequestsCronService.name);

  constructor(private toolRequestsService: ToolRequestsService) {}

  /**
   * Se ejecuta cada día a las 8:00 AM
   * Verifica herramientas próximas a vencerse y envía notificaciones
   */
  @Cron(CronExpression.EVERY_DAY_AT_8AM, { name: 'herramientas-por-vencer', timeZone: WORKDAY_TIMEZONE })
  async checkExpiringToolsDaily() {
    await runScheduledJob('herramientas-por-vencer', this.logger, async () => {
      const count = await this.toolRequestsService.checkExpiringTools();
      this.logger.log(`Herramientas próximas a vencer procesadas: ${count}`);
    });
  }

  /**
   * Revisión periódica de kits: cada mañana avisa de los que ya tocaban.
   *
   * Media hora después del aviso de vencimientos para no soltar dos notificaciones de
   * herramientas en el mismo minuto a la misma gente.
   */
  @Cron('30 8 * * *', { name: 'kits-por-inspeccionar', timeZone: WORKDAY_TIMEZONE })
  async avisarKitsPorInspeccionar() {
    await runScheduledJob('kits-por-inspeccionar', this.logger, async () => {
      const total = await this.toolRequestsService.avisarKitsPorInspeccionarTodasLasEmpresas();
      if (total > 0) {
        this.logger.log(`Kits con revisión vencida: ${total}`);
      }
    });
  }

  /**
   * Cada mañana, un aviso por préstamo cuyo día de devolución ya pasó. Corría cada hora y
   * repetía el mismo aviso; ahora es uno al día (el servicio además no repite si ya avisó hoy).
   */
  @Cron('0 9 * * *', { name: 'herramientas-vencidas', timeZone: WORKDAY_TIMEZONE })
  async checkOverdueTools() {
    await runScheduledJob('herramientas-vencidas', this.logger, async () => {
      const total = await this.toolRequestsService.avisarPrestamosVencidos();
      if (total > 0) this.logger.log(`Préstamos de herramienta vencidos avisados: ${total}`);
    });
  }
}
