import { sinActividades } from '../common/platform-accounts.js';
import { candadoEncendido, exentoTemporal, MENSAJE_JORNADA_NO_ABIERTA } from './candado-jornada.js';

/**
 * Estado del candado «sin entrada no se trabaja» para que web y apps abran la barrera
 * al entrar (no solo tras un 409). Puro: la consulta de BD vive en el controlador.
 */
export type EstadoJornadaCandado = {
  debeChecar: boolean;
  jornadaAbierta: boolean;
  pideBarrera: boolean;
  webCheckinAbierta: boolean;
  webCheckinHasta: string | null;
  mensaje: string | null;
};

/** Arma la respuesta de `GET attendance/estado-jornada`. */
export function armarEstadoJornada(input: {
  usuario: { id?: number | null; email?: string | null; roleKey?: string | null } | null | undefined;
  jornadaAbierta: boolean;
  webCheckin: { abierta: boolean; hasta: Date | string | null };
  env?: NodeJS.ProcessEnv;
}): EstadoJornadaCandado {
  const { usuario, jornadaAbierta, webCheckin, env } = input;
  // Quien no checa (dirección / RH via sinActividades) o está exento / candado apagado.
  const debeChecar =
    Boolean(usuario?.id) &&
    !sinActividades(usuario) &&
    !exentoTemporal(usuario?.id, env) &&
    candadoEncendido(env);
  const pideBarrera = debeChecar && !jornadaAbierta;
  const hasta = webCheckin.hasta;
  const webCheckinHasta =
    hasta instanceof Date
      ? hasta.toISOString()
      : typeof hasta === 'string' && hasta.trim()
        ? hasta
        : null;

  return {
    debeChecar,
    jornadaAbierta,
    pideBarrera,
    webCheckinAbierta: webCheckin.abierta === true,
    webCheckinHasta,
    mensaje: pideBarrera ? MENSAJE_JORNADA_NO_ABIERTA : null,
  };
}
