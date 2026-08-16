import { Logger } from '@nestjs/common';

/**
 * Envoltura para tareas programadas.
 *
 * Si el cuerpo de un `@Cron` lanza, `@nestjs/schedule` no lo captura: acaba
 * como `unhandledRejection` en el arranque, sin decir **qué** tarea falló. Con
 * más de veinte tareas —recordatorios de facturas vencidas, escalado de SLA,
 * instantáneas de KPI, avisos de mantenimiento— eso deja al equipo sin saber
 * qué dejó de ejecutarse.
 *
 * Aquí el fallo queda atribuido a su tarea y con duración, y no se propaga:
 * que una tarea falle no debe impedir que se programe la siguiente ejecución.
 */
export async function runScheduledJob(
  name: string,
  logger: Logger,
  job: () => Promise<unknown>,
): Promise<void> {
  const startedAt = Date.now();
  try {
    await job();
    logger.debug(`Tarea "${name}" completada en ${Date.now() - startedAt} ms`);
  } catch (error) {
    logger.error(
      `Tarea programada "${name}" falló tras ${Date.now() - startedAt} ms: ` +
        (error instanceof Error ? error.message : String(error)),
      error instanceof Error ? error.stack : undefined,
    );
  }
}
