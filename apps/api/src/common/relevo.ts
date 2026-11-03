import type { DynamicModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

/**
 * Las tareas programadas, salvo en el contenedor de relevo de un despliegue
 * (`deploy/reiniciar-sin-corte.sh`). El relevo convive unos segundos con el principal y estas tareas
 * no tienen candado: correrían dos veces (avisos, correos, cierres). Faltar un minuto no daña; repetirlo sí.
 */
export function tareasProgramadas(): DynamicModule[] {
  return process.env.NEXARA_RELEVO === '1' ? [] : [ScheduleModule.forRoot()];
}
