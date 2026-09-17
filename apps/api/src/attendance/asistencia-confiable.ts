/**
 * Asistencia no manipulable — reglas puras (contrato del viernes 18-09, sección A).
 *
 * De estos registros sale la nómina, así que ninguna de estas decisiones puede
 * depender de lo que diga el teléfono: la hora la pone el servidor, la
 * ubicación simulada se rechaza y lo que no se puede comprobar se marca para
 * que una persona lo revise.
 *
 * Aquí sólo hay funciones puras: se prueban sin base de datos y las usan tanto
 * `AttendanceService.register` como la tarea de cierre automático.
 */

import { workDayAtClock, WORKDAY_TIMEZONE } from '../common/time/workday.js';
import { isCeoEquivalentEmail } from '../common/platform-accounts.js';

/** Estado de una checada: OK, PENDIENTE (sin conexión) o REVISAR (algo no cuadra). */
export type ValidacionChecada = 'OK' | 'PENDIENTE' | 'REVISAR';

/** Textos exactos del contrato: los clientes (Android/iOS/web) los muestran tal cual. */
export const MOTIVO_VALIDACION = {
  sinConexion: 'Registrada sin conexión',
  horaTelefono: 'La hora del teléfono no coincidía',
  ubicacionImprecisa: 'Ubicación imprecisa',
  sinUbicacion: 'Sin ubicación',
  cierreAutomatico: 'Sin salida registrada: cierre automático',
} as const;

/** 422 cuando el teléfono reporta ubicación simulada. */
export const MENSAJE_UBICACION_SIMULADA =
  'Detectamos una ubicación simulada. Desactiva cualquier app de GPS falso para checar.';

/** Una captura sin conexión puede llegar hasta 12 h tarde. */
export const VENTANA_OFFLINE_ATRAS_MS = 12 * 60 * 60 * 1000;
/** Y como mucho 2 min adelantada (relojes que van un poco por delante). */
export const VENTANA_OFFLINE_ADELANTE_MS = 2 * 60 * 1000;
/** Con conexión, más de 5 min de diferencia con el servidor es sospechoso. */
export const DESFASE_MAXIMO_MS = 5 * 60 * 1000;
/** Precisión peor que esto no sirve para decir dónde estuvo alguien. */
export const PRECISION_MAXIMA_M = 200;
/** Radio de los sitios permitidos. */
export const RADIO_SITIO_M = 300;
/** Jornada máxima que asume el cierre automático. */
export const JORNADA_MAXIMA_H = 9;
/** Hora (México) a la que corre el cierre automático y tope de la salida inventada. */
export const HORA_CIERRE_AUTOMATICO = { hora: 23, minuto: 30 } as const;

/** Un sitio donde es legítimo checar. */
export type SitioPermitido = {
  nombre: string;
  latitude: number;
  longitude: number;
  /** Radio propio; por omisión `RADIO_SITIO_M`. */
  radioM?: number;
};

/**
 * Oficina de NEXARA (Puebla). Configurable por entorno mientras `company_profile`
 * no tenga columnas de coordenadas: `ATTENDANCE_OFFICE_LAT` / `_LNG` / `_RADIO_M`.
 */
export function sitioOficina(env: NodeJS.ProcessEnv = process.env): SitioPermitido {
  const num = (valor: string | undefined, porOmision: number) => {
    const n = Number(valor);
    return Number.isFinite(n) && valor?.trim() ? n : porOmision;
  };
  return {
    nombre: env.ATTENDANCE_OFFICE_NAME?.trim() || 'Oficina',
    latitude: num(env.ATTENDANCE_OFFICE_LAT, 19.074),
    longitude: num(env.ATTENDANCE_OFFICE_LNG, -98.278),
    radioM: num(env.ATTENDANCE_OFFICE_RADIO_M, RADIO_SITIO_M),
  };
}

/** Metros entre dos puntos (haversine); suficiente para radios de cientos de metros. */
export function distanciaMetros(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6_371_000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** REVISAR manda sobre PENDIENTE, y PENDIENTE sobre OK. */
export function combinarValidacion(a: ValidacionChecada, b: ValidacionChecada): ValidacionChecada {
  const peso = { OK: 0, PENDIENTE: 1, REVISAR: 2 } as const;
  return peso[a] >= peso[b] ? a : b;
}

export type HoraChecada = {
  /** La hora que se guarda en `timestamp`. */
  at: Date;
  /** Hora del teléfono al capturar, informativa (`clientCapturedAt`). */
  clientCapturedAt: Date | null;
  offline: boolean;
  validacion: ValidacionChecada;
  motivo: string | null;
};

/**
 * Qué hora se guarda.
 *
 * La regla es «manda el servidor». La única excepción es la captura sin
 * conexión, que por definición ocurrió antes de llegar: se respeta su hora si
 * cae dentro de la ventana razonable, y aun así queda PENDIENTE para que
 * alguien la mire. Un teléfono con la hora corrida (el truco más fácil para
 * fabricar una entrada puntual) se guarda con la hora del servidor y REVISAR.
 */
export function resolverHoraChecada(params: {
  ahora: Date;
  capturedAt?: string | Date | null;
  offline?: boolean | null;
}): HoraChecada {
  const ahora = params.ahora;
  const offline = params.offline === true;
  const capturada = normalizarFecha(params.capturedAt);
  const base: HoraChecada = {
    at: ahora,
    clientCapturedAt: capturada,
    offline,
    validacion: 'OK',
    motivo: null,
  };

  if (offline) {
    if (!capturada) {
      // Se capturó sin conexión pero no dijo cuándo: hora del servidor y a revisión suave.
      return { ...base, validacion: 'PENDIENTE', motivo: MOTIVO_VALIDACION.sinConexion };
    }
    const desfase = capturada.getTime() - ahora.getTime();
    const dentroDeVentana =
      desfase <= VENTANA_OFFLINE_ADELANTE_MS && desfase >= -VENTANA_OFFLINE_ATRAS_MS;
    if (dentroDeVentana) {
      return {
        ...base,
        at: capturada,
        validacion: 'PENDIENTE',
        motivo: MOTIVO_VALIDACION.sinConexion,
      };
    }
    // Fuera de ventana: una captura «de ayer por la madrugada» no se acepta a ciegas.
    return { ...base, validacion: 'REVISAR', motivo: MOTIVO_VALIDACION.horaTelefono };
  }

  if (capturada && Math.abs(capturada.getTime() - ahora.getTime()) > DESFASE_MAXIMO_MS) {
    return { ...base, validacion: 'REVISAR', motivo: MOTIVO_VALIDACION.horaTelefono };
  }

  return base;
}

export type UbicacionChecada = {
  validacion: ValidacionChecada;
  motivo: string | null;
  fueraDeSitio: boolean;
  distanciaSitioM: number | null;
  sitioNombre: string | null;
};

/**
 * Qué se puede afirmar de dónde se checó.
 *
 * Nada de esto rechaza el fichaje: la app que la gente ya tiene instalada manda
 * (0,0) cuando se niega el permiso, y un 400 dejaría a media plantilla sin
 * poder checar. Se acepta y se marca lo que de verdad hubo.
 */
export function evaluarUbicacion(params: {
  coords?: { latitude: number; longitude: number } | null;
  accuracyM?: number | null;
  sitios: SitioPermitido[];
}): UbicacionChecada {
  const { coords, sitios } = params;
  if (!coords) {
    return {
      validacion: 'REVISAR',
      motivo: MOTIVO_VALIDACION.sinUbicacion,
      fueraDeSitio: false,
      distanciaSitioM: null,
      sitioNombre: null,
    };
  }

  const accuracyM =
    typeof params.accuracyM === 'number' && Number.isFinite(params.accuracyM)
      ? params.accuracyM
      : null;
  const imprecisa = accuracyM != null && accuracyM > PRECISION_MAXIMA_M;

  let cercano: { sitio: SitioPermitido; distancia: number } | null = null;
  let dentro = false;
  for (const sitio of sitios) {
    const distancia = distanciaMetros(coords, sitio);
    if (!cercano || distancia < cercano.distancia) cercano = { sitio, distancia };
    if (distancia <= (sitio.radioM ?? RADIO_SITIO_M)) dentro = true;
  }

  return {
    validacion: imprecisa ? 'REVISAR' : 'OK',
    motivo: imprecisa ? MOTIVO_VALIDACION.ubicacionImprecisa : null,
    // Sin sitios conocidos no se puede afirmar que estuvo fuera de ninguno.
    fueraDeSitio: cercano ? !dentro : false,
    distanciaSitioM: cercano ? Math.round(cercano.distancia) : null,
    sitioNombre: cercano ? cercano.sitio.nombre : null,
  };
}

/**
 * Salida que se inventa cuando alguien olvidó checarla: `min(entrada + 9 h, 23:30)`
 * del día de la entrada, en hora de México.
 */
export function horaCierreAutomatico(entrada: Date, tz = WORKDAY_TIMEZONE): Date {
  const tope = workDayAtClock(
    entrada,
    HORA_CIERRE_AUTOMATICO.hora,
    HORA_CIERRE_AUTOMATICO.minuto,
    tz,
  );
  const maxJornada = new Date(entrada.getTime() + JORNADA_MAXIMA_H * 60 * 60 * 1000);
  const elegida = maxJornada.getTime() < tope.getTime() ? maxJornada : tope;
  // Una entrada posterior al tope (checada muy noche) no puede cerrar antes de empezar.
  return elegida.getTime() > entrada.getTime() ? elegida : new Date(entrada.getTime());
}

/**
 * GPS en vivo (mapa del equipo, trayectorias, recorrido de la geocerca): sólo
 * dirección. Un coordinador ve las checadas de su gente —con su punto y su
 * distancia al sitio—, no su telemetría minuto a minuto.
 */
export function puedeVerGpsDireccion(user?: { email?: string | null } | null): boolean {
  return isCeoEquivalentEmail(user?.email);
}

/** El motivo de una corrección de hora es obligatorio y tiene que decir algo (≥ 10). */
export function motivoCorreccionValido(motivo?: string | null): boolean {
  return (motivo ?? '').trim().length >= 10;
}

function normalizarFecha(valor?: string | Date | null): Date | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}
