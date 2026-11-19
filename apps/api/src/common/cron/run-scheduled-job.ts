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
/** Tareas que siguen corriendo en este proceso (por nombre). */
const enCurso = new Set<string>();

/** Para pruebas: ¿sigue corriendo esta tarea? */
export function tareaEnCurso(name: string): boolean {
  return enCurso.has(name);
}

export async function runScheduledJob(
  name: string,
  logger: Logger,
  job: () => Promise<unknown>,
): Promise<void> {
  // Si la vuelta anterior no ha terminado, esta se salta (lo que haría `waitForCompletion`, que la
  // versión 4 de @nestjs/schedule no tiene). Así una corrida lenta de 1 o 5 min no se encima (18-11-2026).
  if (enCurso.has(name)) {
    logger.warn(`Tarea "${name}" sigue corriendo: se salta esta vuelta.`);
    return;
  }
  enCurso.add(name);
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
  } finally {
    enCurso.delete(name);
  }
}
