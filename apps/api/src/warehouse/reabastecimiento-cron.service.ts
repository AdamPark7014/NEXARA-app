import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WORKDAY_TIMEZONE } from '../common/time/workday.js';
import { runScheduledJob } from '../common/cron/run-scheduled-job.js';
import { ReabastecimientoService } from './reabastecimiento.service.js';

/**
 * Recálculo nocturno de mínimos y máximos por consumo.
 *
 * De madrugada: a esa hora ya cerraron las salidas del día y nadie está capturando, así
 * que el promedio sale con el día completo y el `UPDATE` masivo no pelea con el almacén.
 * El botón «Recalcular» de la pantalla hace lo mismo a mano cuando alguien acaba de
 * cambiar el lead time de un proveedor y no quiere esperar a mañana.
 */
@Injectable()
export class ReabastecimientoCronService {
  private readonly logger = new Logger(ReabastecimientoCronService.name);

  constructor(private readonly reabastecimiento: ReabastecimientoService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'reabastecimiento-diario', timeZone: WORKDAY_TIMEZONE })
  async recalcularDiario() {
    await runScheduledJob('reabastecimiento-diario', this.logger, async () => {
      const res = await this.reabastecimiento.recalcularTodasLasEmpresas();
      this.logger.log(
        `Reabastecimiento: ${res.empresas} empresas, ${res.faltantes} renglones por comprar`,
      );
    });
  }
}
