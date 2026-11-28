/**
 * Textos de los rechazos por «ya estaba registrado» en checadas y comida. Dicen que no hace falta repetir.
 *
 * CUIDADO con los textos de checada: las apps publicadas deciden qué diálogo mostrar leyendo palabras del
 * mensaje (Android `AttendanceCheckIn.kt`, iOS `ChecadaRechazo.swift`) y la web compara el texto de fin de semana
 * por igualdad exacta. Por eso:
 *  - los dos textos de checada conservan el texto de antes como PREFIJO y solo agregan una frase;
 *  - ningún texto nuevo puede contener las frases de `FRASES_QUE_LAS_APPS_LEEN` (hay prueba que lo vigila);
 *  - el texto de fin de semana (`guardias/guardias-reglas.ts`) no se toca.
 * El código HTTP de cada rechazo no cambia; se agrega un `code` estable.
 */

export const CODIGOS_CHECADA = {
  CHECADA_ENTRADA_YA_REGISTRADA: 'CHECADA_ENTRADA_YA_REGISTRADA',
  CHECADA_SALIDA_YA_REGISTRADA: 'CHECADA_SALIDA_YA_REGISTRADA',
  COMIDA_YA_COMPLETADA: 'COMIDA_YA_COMPLETADA',
  COMIDA_REGRESO_YA_REGISTRADO: 'COMIDA_REGRESO_YA_REGISTRADO',
  COMIDA_SIN_SALIDA: 'COMIDA_SIN_SALIDA',
} as const;

export type CodigoChecada = (typeof CODIGOS_CHECADA)[keyof typeof CODIGOS_CHECADA];
export type RechazoChecada = { message: string; code: CodigoChecada };

/** Palabras que las apps buscan dentro del mensaje para elegir pantalla. Ningún texto de aquí debe contenerlas. */
export const FRASES_QUE_LAS_APPS_LEEN = [
  'ubicación simulada',
  'ubicacion simulada',
  'ubicación vieja',
  'ubicacion vieja',
  'distancia imposible',
  'app nexara',
  'fin de semana',
  'guardia',
  'no se labora',
  'enciende la ubicación',
  'enciende la ubicacion',
  'permiso de ubicación a nexara',
  'permiso de ubicacion a nexara',
  'simulada',
  'gps falso',
] as const;

const NO_REPETIR = 'No necesitas checar otra vez.';

export const MENSAJE_ENTRADA_YA_REGISTRADA = `Ya existe una entrada registrada para hoy. ${NO_REPETIR}`;
export const MENSAJE_SALIDA_YA_REGISTRADA = `Ya existe una salida registrada para hoy. ${NO_REPETIR}`;

export const MENSAJE_COMIDA_YA_COMPLETADA = 'Hoy ya completaste tu comida. No necesitas registrarla otra vez.';
export const MENSAJE_COMIDA_REGRESO_YA_REGISTRADO =
  'Tu regreso de la comida ya quedó registrado. No necesitas hacerlo otra vez.';
export const MENSAJE_COMIDA_SIN_SALIDA =
  'Todavía no registras tu salida a comer. Primero registra la salida y después tu regreso.';

export function rechazoEntradaYaRegistrada(): RechazoChecada {
  return { message: MENSAJE_ENTRADA_YA_REGISTRADA, code: CODIGOS_CHECADA.CHECADA_ENTRADA_YA_REGISTRADA };
}

export function rechazoSalidaYaRegistrada(): RechazoChecada {
  return { message: MENSAJE_SALIDA_YA_REGISTRADA, code: CODIGOS_CHECADA.CHECADA_SALIDA_YA_REGISTRADA };
}

export function rechazoComidaYaCompletada(): RechazoChecada {
  return { message: MENSAJE_COMIDA_YA_COMPLETADA, code: CODIGOS_CHECADA.COMIDA_YA_COMPLETADA };
}

export function rechazoComidaRegresoYaRegistrado(): RechazoChecada {
  return { message: MENSAJE_COMIDA_REGRESO_YA_REGISTRADO, code: CODIGOS_CHECADA.COMIDA_REGRESO_YA_REGISTRADO };
}

export function rechazoComidaSinSalida(): RechazoChecada {
  return { message: MENSAJE_COMIDA_SIN_SALIDA, code: CODIGOS_CHECADA.COMIDA_SIN_SALIDA };
}
