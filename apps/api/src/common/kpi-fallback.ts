import { Logger } from '@nestjs/common';

/**
 * Valor de reserva para un indicador que no se pudo calcular.
 *
 * Los tableros usaban `.catch(() => 0)` para no caerse si una consulta falla.
 * El problema es que un KPI roto se ve **exactamente igual** que uno sin datos:
 * un cero. Así estuvo el panel de dirección contando cero tickets completados
 * durante mucho tiempo —la consulta filtraba por un estado que nadie escribe—
 * sin que nada lo delatara.
 *
 * Esto conserva la resiliencia (el tablero sigue pintando) pero deja rastro:
 * si un indicador aparece en el log, es que falló, no que valga cero.
 */
const logger = new Logger('KPI');

export function kpiFallback<T>(label: string, fallback: T): (error: unknown) => T {
  return (error: unknown): T => {
    const detail = error instanceof Error ? error.message : String(error);
    logger.warn(`Indicador "${label}" no se pudo calcular; se muestra el valor de reserva. ${detail}`);
    return fallback;
  };
}
