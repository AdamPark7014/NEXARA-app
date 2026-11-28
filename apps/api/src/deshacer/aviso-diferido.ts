import { Logger } from '@nestjs/common';
import { AVISO_DIFERIDO_MS } from './deshacer-reglas.js';

const logger = new Logger('AvisoDiferido');

/**
 * Cuánto se esperan los avisos a otras personas tras un alta que se puede deshacer.
 * `DESHACER_AVISO_MS` lo cambia (0 = enseguida); en pruebas es 0 para no cambiar lo que ya se prueba.
 */
export function esperaAvisoMs(): number {
  const crudo = process.env.DESHACER_AVISO_MS;
  if (crudo != null && crudo.trim() !== '') {
    const n = Number(crudo);
    return Number.isFinite(n) && n >= 0 ? n : AVISO_DIFERIDO_MS;
  }
  return process.env.NODE_ENV === 'test' ? 0 : AVISO_DIFERIDO_MS;
}

/**
 * Manda `avisar` pasado el plazo para deshacer, solo si `sigueVigente()` (no se deshizo).
 * Con espera 0 lo manda ya, sin preguntar (mismo comportamiento de antes).
 *
 * Si el proceso se reinicia en esos segundos el aviso se pierde; el alta no. Es el mismo riesgo que
 * un push que falla, y la persona la ve igual en su pizarra.
 */
export async function avisarSiNoSeDeshizo(
  nombre: string,
  sigueVigente: () => Promise<boolean>,
  avisar: () => Promise<unknown> | unknown,
  esperaMs: number = esperaAvisoMs(),
): Promise<void> {
  if (esperaMs <= 0) {
    await avisar();
    return;
  }
  const t = setTimeout(() => {
    void (async () => {
      try {
        if (await sigueVigente()) await avisar();
      } catch (e) {
        logger.warn(`${nombre}: no se pudo mandar el aviso diferido (${(e as Error)?.message ?? e})`);
      }
    })();
  }, esperaMs);
  (t as { unref?: () => void }).unref?.();
}
