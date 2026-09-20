import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ToolRequestsService } from './tool-requests.service';

@Injectable()
export class ToolRequestsCronService {
  constructor(private toolRequestsService: ToolRequestsService) {}

  /**
   * Se ejecuta cada día a las 8:00 AM
   * Verifica herramientas próximas a vencerse y envía notificaciones
   */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
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
  @Cron('30 8 * * *')
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
   * Se ejecuta cada hora
   * Verifica herramientas que vencieron hace más de 1 hora
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTools() {
    console.log('⏰ Verificando herramientas vencidas...');
    try {
      const overdueTools = await this.toolRequestsService.findByStatus('IN_USE');
      const now = new Date();
      
      for (const tool of overdueTools) {
        if (tool.expectedReturnDate < now) {
          await this.toolRequestsService.createNotification(
            tool.id,
            tool.usuarioId,
            'TOOL_EXPIRATION_DUE',
            `⚠️ URGENTE: La herramienta "${tool.toolName}" venció el ${tool.expectedReturnDate.toLocaleDateString()}. Por favor devuélvela inmediatamente.`
          );
        }
      }
    } catch (error) {
      console.error('❌ Error al verificar herramientas vencidas:', error);
    }
  }
}
