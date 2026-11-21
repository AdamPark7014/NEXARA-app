import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WORKDAY_TIMEZONE } from '../common/time/workday.js';
import { ToolRequestsService } from './tool-requests.service';

@Injectable()
export class ToolRequestsCronService {
  constructor(private toolRequestsService: ToolRequestsService) {}

  /**
   * Se ejecuta cada día a las 8:00 AM
   * Verifica herramientas próximas a vencerse y envía notificaciones
   */
  @Cron(CronExpression.EVERY_DAY_AT_8AM, { timeZone: WORKDAY_TIMEZONE })
  async checkExpiringToolsDaily() {
    console.log('🔔 Iniciando verificación diaria de herramientas próximas a vencer...');
    try {
      const count = await this.toolRequestsService.checkExpiringTools();
      console.log(`✅ Se procesaron ${count} herramientas próximas a vencer`);
    } catch (error) {
      console.error('❌ Error en verificación de herramientas:', error);
    }
  }

  /**
   * Revisión periódica de kits: cada mañana avisa de los que ya tocaban.
   *
   * Media hora después del aviso de vencimientos para no soltar dos notificaciones de
   * herramientas en el mismo minuto a la misma gente.
   */
  @Cron('30 8 * * *', { timeZone: WORKDAY_TIMEZONE })
  async avisarKitsPorInspeccionar() {
    try {
      const total = await this.toolRequestsService.avisarKitsPorInspeccionarTodasLasEmpresas();
      if (total > 0) {
        console.log(`🧰 ${total} kits con revisión vencida`);
      }
    } catch (error) {
      console.error('❌ Error al avisar revisiones de kit:', error);
    }
  }

  /**
   * Cada mañana, un aviso por préstamo cuyo día de devolución ya pasó. Corría cada hora y
   * repetía el mismo aviso; ahora es uno al día (el servicio además no repite si ya avisó hoy).
   */
  @Cron('0 9 * * *', { timeZone: WORKDAY_TIMEZONE })
  async checkOverdueTools() {
    try {
      const total = await this.toolRequestsService.avisarPrestamosVencidos();
      if (total > 0) console.log(`⏰ ${total} préstamos de herramienta vencidos avisados`);
    } catch (error) {
      console.error('❌ Error al verificar herramientas vencidas:', error);
    }
  }
}
