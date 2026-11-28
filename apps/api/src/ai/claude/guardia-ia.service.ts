import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ClaudeService } from './claude.service.js';

/**
 * La vuelta de la sonda de la IA: cada minuto le pregunta a `ClaudeService` si toca sondear la puerta (en caída, al
 * llegar su próximo intento; en `ok`, cada 30 min) y, 45 s después de arrancar, hace una primera vuelta para no esperar
 * a que alguien use la IA y enterarse de una llave muerta.
 *
 * Va con `setInterval` y `unref`, NO con `@Cron`: así no depende del catálogo de tareas programadas ni de
 * `ScheduleModule`, y un timer sin referencia nunca retiene el proceso. Corre solo donde corren los crons: no en el
 * contenedor de relevo de un despliegue (`NEXARA_RELEVO=1`) ni en pruebas (`NODE_ENV=test`). En el relevo solo opera el
 * permiso de sonda pasivo de `pedirPaso()`, y es lo esperado.
 *
 * Nunca lanza: una falla aquí se anota y se sigue.
 */
@Injectable()
export class GuardiaIaService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('GuardiaIA');
  static readonly VUELTA_MS = 60_000;
  static readonly ARRANQUE_MS = 45_000;

  private reloj?: ReturnType<typeof setInterval>;
  private arranque?: ReturnType<typeof setTimeout>;
  private enCurso = false;

  constructor(private readonly claude: ClaudeService) {}

  /** ¿Este proceso debe correr la vuelta? (No en pruebas ni en el contenedor de relevo.) */
  static debeCorrer(): boolean {
    return process.env.NODE_ENV !== 'test' && process.env.NEXARA_RELEVO !== '1';
  }

  onApplicationBootstrap(): void {
    try {
      if (!GuardiaIaService.debeCorrer()) return;
      this.arranque = setTimeout(() => void this.vuelta(), GuardiaIaService.ARRANQUE_MS);
      this.arranque.unref?.();
      this.reloj = setInterval(() => void this.vuelta(), GuardiaIaService.VUELTA_MS);
      this.reloj.unref?.();
    } catch (error) {
      this.logger.warn(`No se pudo programar la sonda de la IA: ${String((error as Error)?.message ?? error)}`);
    }
  }

  onModuleDestroy(): void {
    if (this.arranque) clearTimeout(this.arranque);
    if (this.reloj) clearInterval(this.reloj);
    this.arranque = undefined;
    this.reloj = undefined;
  }

  /** Una vuelta. Si la anterior sigue en curso (una sonda lenta) se salta. Devuelve `true` si mandó una sonda. */
  async vuelta(): Promise<boolean> {
    if (this.enCurso) return false;
    this.enCurso = true;
    try {
      return await this.claude.sondearSiToca();
    } catch (error) {
      this.logger.warn(`La vuelta de la sonda de la IA falló: ${String((error as Error)?.message ?? error)}`);
      return false;
    } finally {
      this.enCurso = false;
    }
  }
}
