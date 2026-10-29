/**
 * Ubicación obligatoria para checar.
 *
 * Adam (28-10-2026): «fuerza a que se deba comenzar a tomar la ubicación, que la lea, y si no la
 * tienen prendida les marque errores: enciende tu ubicación». Antes la checada sin coordenadas se
 * guardaba y quedaba «Revisar: Sin ubicación», y el GPS de jornada nunca arrancaba.
 *
 * Solo se rechaza cuando el teléfono dice por qué no hubo coordenadas y es algo que la persona
 * arregla en un momento: la ubicación apagada o NEXARA sin permiso. Sin señal (adentro de un
 * edificio) o un error del GPS sí se registran y pasan a revisión, con el primer punto del GPS de
 * jornada como ubicación (`ubicacion-posterior.ts`). Una app vieja que no manda el motivo tampoco
 * se rechaza, ni una captura sin conexión: pasó hace rato y ya no se puede repetir.
 *
 * El 422 lo muestran las apps ya publicadas en su diálogo «No se pudo checar» con este texto.
 * No lleva «app NEXARA»: las apps leen esa frase como el rechazo de checar desde el navegador.
 */
import { MOTIVO_RECHAZO, type MotivoRechazo } from './asistencia-confiable.js';
import { estadoPorFalla } from './estado-ubicacion.js';

export const MENSAJE_UBICACION_APAGADA =
  'Enciende la ubicación de tu teléfono para checar: NEXARA registra dónde estás al checar tu entrada y tu salida.';

export const MENSAJE_SIN_PERMISO_UBICACION =
  'Dale permiso de ubicación a NEXARA para checar: en los ajustes del teléfono, Ubicación › Permitir mientras se usa la app, y vuelve a intentarlo.';

export function rechazoPorUbicacion(p: {
  coords: { latitude: number; longitude: number } | null;
  falla?: unknown;
  offline?: boolean | null;
}): { motivo: MotivoRechazo; mensaje: string } | null {
  if (p.coords || p.offline === true) return null;
  const estado = estadoPorFalla(p.falla);
  if (estado === 'APAGADA') return { motivo: MOTIVO_RECHAZO.ubicacionApagada, mensaje: MENSAJE_UBICACION_APAGADA };
  if (estado === 'SIN_PERMISO') {
    return { motivo: MOTIVO_RECHAZO.sinPermisoUbicacion, mensaje: MENSAJE_SIN_PERMISO_UBICACION };
  }
  return null;
}
