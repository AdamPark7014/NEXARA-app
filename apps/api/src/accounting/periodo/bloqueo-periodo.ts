export type ModoBloqueoPeriodo = 'abierto' | 'suave' | 'duro';

export type DecisionBloqueo = {
  permitido: boolean;
  motivo?: string;
};

/**
 * Normaliza una cadena bruta en un modo de bloqueo válido.
 * Mapea valores comunes (soft, hard, open) a los modos internos, aceptando versiones en español (suave, duro, abierto).
 * Maneja el caso de un periodo cerrado (`isClosed`) donde se fuerza el bloqueo duro si no hay valor explícito.
 */
export function normalizarModoBloqueo(
  raw: string | null | undefined,
  isClosed = false
): ModoBloqueoPeriodo {
  if (typeof raw === 'string') {
    const normalizedRaw = raw.toLowerCase().trim();

    // Prioridad: reconocer inclusivamente los términos en español e inglés.
    // Orden lógico de detección basado en la instrucción: suave/soft, duro/hard, abierto/open.
    if (normalizedRaw.includes('suave') || normalizedRaw.includes('soft')) return 'suave';
    if (normalizedRaw.includes('duro') || normalizedRaw.includes('hard')) return 'duro';
    if (normalizedRaw.includes('abierto') || normalizedRaw.includes('open')) return 'abierto';
  }

  // Si el periodo está cerrado y no hay valor de modo proporcionado, asumimos bloqueo duro.
  if (isClosed && !raw) {
    return 'duro';
  }

  // Por defecto si no es ni suave ni duro ni abierto explicitamente (y no forzado por cierre)
  return 'abierto';
}

/**
 * Determina si un actor puede escribir en el periodo basado en su modo de bloqueo.
 * En modo 'suave', solo la contadora tiene permisos.
 */
export function puedeEscribirEnPeriodo(
  modo: ModoBloqueoPeriodo,
  actor: { esContadora: boolean }
): DecisionBloqueo {
  switch (modo) {
    case 'abierto':
      return { permitido: true };

    case 'suave':
      if (actor.esContadora) {
        return { permitido: true };
      }
      return {
        permitido: false,
        motivo: 'Periodo en bloqueo suave: solo la contadora puede mover',
      };

    case 'duro':
      return {
        permitido: false,
        motivo: 'Periodo en bloqueo duro: nadie puede mover',
      };

    default:
      return { permitido: true };
  }
}