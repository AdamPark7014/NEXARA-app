import { Logger } from '@nestjs/common';
import { errorCorto } from './error-corto.js';
import { latido } from './latido-tareas.js';

/**
 * Envoltura para tareas programadas. TODO `@Cron` del API pasa por aquí (lo exige la prueba guardiana
 * `tareas-catalogo.spec.ts`): lleva `name`, el cuerpo corre dentro de `runScheduledJob` y la tarea tiene fila en
 * `tareas-catalogo.ts`.
 *
 * Qué hace por cada tarea:
 *   - Atribuye el fallo a su tarea y con duración. `@nestjs/schedule` 4.1.2 SÍ atrapa las excepciones
 *     (`SchedulerRegistry.wrapFunctionInTryCatchBlocks`), pero las registra sin decir qué tarea fue; el valor de esta
 *     envoltura es el nombre, la duración y el registro.
 *   - No propaga el fallo: que una tarea falle no debe impedir que se programe la siguiente ejecución.
 *   - Salta la vuelta si la anterior sigue corriendo (lo que haría `waitForCompletion`, que la versión 4 no tiene).
 *   - Deja el latido (`latido-tareas.ts`): cuándo arrancó, cuánto tardó, si terminó bien, cuántas veces ha fallado
 *     seguidas, cuántas vueltas se saltaron. Registrar NUNCA puede romper una tarea: cada llamada va en su propio
 *     `try/catch` vacío. `PULSO_LATIDO=0` en el entorno lo apaga.
 *
 * Devuelve lo que devuelve el trabajo, o `undefined` si falló o se saltó (los llamadores que no lo necesitan lo
 * ignoran).
 */
/** Tareas que siguen corriendo en este proceso (por nombre). */
const enCurso = new Set<string>();

/** Para pruebas: ¿sigue corriendo esta tarea? */
export function tareaEnCurso(name: string): boolean {
  return enCurso.has(name);
}

export async function runScheduledJob<T>(
  name: string,
  logger: Logger,
  job: () => Promise<T>,
): Promise<T | undefined> {
  // Si la vuelta anterior no ha terminado, esta se salta (lo que haría `waitForCompletion`, que la
  // versión 4 de @nestjs/schedule no tiene). Así una corrida lenta de 1 o 5 min no se encima (18-11-2026).
  if (enCurso.has(name)) {
    logger.warn(`Tarea "${name}" sigue corriendo: se salta esta vuelta.`);
    try {
      latido.saltada(name);
    } catch {
      /* registrar nunca rompe la tarea */
    }
    return undefined;
  }
  enCurso.add(name);
  const startedAt = Date.now();
  try {
    latido.inicio(name, startedAt);
  } catch {
    /* registrar nunca rompe la tarea */
  }
  try {
    let resultado: T;
    try {
      resultado = await job();
    } catch (error) {
      const ms = Date.now() - startedAt;
      try {
        latido.fin(name, 'error', ms, errorCorto(error));
      } catch {
        /* registrar nunca rompe la tarea */
      }
      logger.error(
        `Tarea programada "${name}" falló tras ${ms} ms: ` + (error instanceof Error ? error.message : String(error)),
        error instanceof Error ? error.stack : undefined,
      );
      return undefined;
    }
    const ms = Date.now() - startedAt;
    try {
      latido.fin(name, 'ok', ms);
    } catch {
      /* registrar nunca rompe la tarea */
    }
    logger.debug(`Tarea "${name}" completada en ${ms} ms`);
    return resultado;
  } finally {
    enCurso.delete(name);
  }
}
