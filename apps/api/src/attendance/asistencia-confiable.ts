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
import { detectDeviceDetails } from '../common/device-detector.js';

/** Estado de una checada: OK, PENDIENTE (sin conexión) o REVISAR (algo no cuadra). */
export type ValidacionChecada = 'OK' | 'PENDIENTE' | 'REVISAR';

/** Textos exactos del contrato: los clientes (Android/iOS/web) los muestran tal cual. */
export const MOTIVO_VALIDACION = {
  sinConexion: 'Registrada sin conexión',
  horaTelefono: 'La hora del teléfono no coincidía',
  ubicacionImprecisa: 'Ubicación imprecisa',
  sinUbicacion: 'Sin ubicación',
  cierreAutomatico: 'Sin salida registrada: cierre automático',
  ubicacionVieja: 'La ubicación no era del momento',
  coordenadaRepetida: 'La misma coordenada exacta otra vez',
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

// ─────────────────────────────────────────────────────────────────────────────
// De dónde vino la checada
// ─────────────────────────────────────────────────────────────────────────────

/** Desde dónde se registró: las dos apps, o un navegador. */
export type OrigenChecada = 'ANDROID' | 'IOS' | 'WEB';

/**
 * Origen a partir de lo que manda el cliente.
 *
 * Las dos apps se identifican igual (`X-Device-Browser: NEXARA App` y un
 * `User-Agent` que empieza por `NexaraApp/`), así que basta con mirar el
 * sistema. Cualquier otra cosa es un navegador, y desde el navegador ya no se
 * checa: la ubicación de una pestaña no se puede comprobar.
 */
export function origenChecada(userAgent?: string | null, headers?: Record<string, unknown>): OrigenChecada {
  const detalle = detectDeviceDetails(userAgent, headers as never);
  if (!detalle.isApp) return 'WEB';
  const so = `${detalle.os} ${userAgent ?? ''}`.toLowerCase();
  if (/ios|iphone|ipad|ipod/.test(so)) return 'IOS';
  if (/android/.test(so)) return 'ANDROID';
  // App NEXARA de un sistema que no reconocemos: es app, no navegador.
  return 'ANDROID';
}

// ─────────────────────────────────────────────────────────────────────────────
// Intentos rechazados
// ─────────────────────────────────────────────────────────────────────────────

/** Claves de `AttendanceRejection.motivo`. Cortas y estables: la UI las traduce. */
export const MOTIVO_RECHAZO = {
  ubicacionSimulada: 'MOCK_LOCATION',
  desdeNavegador: 'ORIGEN_WEB',
  viajeImposible: 'VIAJE_IMPOSIBLE',
  ubicacionVieja: 'UBICACION_VIEJA',
} as const;

export type MotivoRechazo = (typeof MOTIVO_RECHAZO)[keyof typeof MOTIVO_RECHAZO];

/** Cómo se lee cada motivo en la web y en las apps. */
export const ETIQUETA_MOTIVO_RECHAZO: Record<string, string> = {
  MOCK_LOCATION: 'Ubicación simulada',
  ORIGEN_WEB: 'Intento desde el navegador',
  VIAJE_IMPOSIBLE: 'Viaje imposible entre checadas',
  UBICACION_VIEJA: 'Ubicación guardada, no del momento',
};

/**
 * 422 cuando alguien intenta checar desde la web.
 *
 * Decisión del dueño: nadie checa desde el navegador. Una pestaña puede decir
 * que está donde quiera —la API de geolocalización se falsea con dos líneas en
 * la consola— y de estos registros sale la nómina.
 */
export const MENSAJE_SOLO_APP =
  'Las checadas se registran solo desde la app NEXARA en tu teléfono. Abre la app para checar.';

/** 422 cuando el punto de esta checada está imposiblemente lejos del anterior. */
export const MENSAJE_VIAJE_IMPOSIBLE =
  'Tu ubicación no coincide con tu checada anterior: es una distancia imposible en ese tiempo. Avisa a tu jefe.';

/** 422 cuando el teléfono mandó una posición guardada en vez de medir una nueva. */
export const MENSAJE_UBICACION_VIEJA =
  'Tu teléfono mandó una ubicación vieja. Sal al aire libre unos segundos y vuelve a intentarlo.';

// ─────────────────────────────────────────────────────────────────────────────
// Comprobaciones del servidor que no necesitan hardware nuevo
// ─────────────────────────────────────────────────────────────────────────────

/** Nadie llega a su siguiente checada a más de esto. Un vuelo tampoco. */
export const VELOCIDAD_IMPOSIBLE_KMH = 300;
/** Por debajo de un kilómetro manda el ruido del GPS, no el movimiento. */
export const VIAJE_MINIMO_M = 1_000;
/** Y hace falta medio minuto para que dividir distancia entre tiempo signifique algo. */
export const VIAJE_MINIMO_MS = 30_000;
/** Una posición de hace más de esto ya no dice dónde estás: se marca para revisión. */
export const FIX_VIEJO_REVISAR_MS = 5 * 60 * 1000;
/** Y de hace más de esto no se acepta: es una posición guardada, no una medida. */
export const FIX_VIEJO_RECHAZO_MS = 30 * 60 * 1000;
/** Dos puntos a menos de esto son «el mismo punto» para un GPS. */
export const REPETIDA_TOLERANCIA_M = 1;
/** Cuántas checadas seguidas con el punto calcado hacen falta para sospechar. */
export const REPETIDAS_PARA_SOSPECHAR = 3;

export type PuntoChecada = { latitude: number; longitude: number; at: Date };

export type ViajeImposible = {
  imposible: boolean;
  /** Velocidad implícita entre las dos checadas, km/h. null si no se pudo calcular. */
  velocidadKmh: number | null;
  distanciaM: number | null;
};

/**
 * ¿La distancia entre esta checada y la anterior es imposible en ese tiempo?
 *
 * Es la comprobación más barata que hay contra un GPS falso que el teléfono no
 * delató: aunque cada punto por separado sea creíble, la pareja no lo es. Se
 * exige un kilómetro y medio minuto antes de opinar, porque a distancias cortas
 * el error del GPS produce velocidades absurdas sin que nadie se haya movido.
 */
export function viajeImposible(
  anterior: PuntoChecada | null | undefined,
  actual: PuntoChecada,
  limiteKmh = VELOCIDAD_IMPOSIBLE_KMH,
): ViajeImposible {
  const vacio: ViajeImposible = { imposible: false, velocidadKmh: null, distanciaM: null };
  if (!anterior) return vacio;
  const ms = actual.at.getTime() - anterior.at.getTime();
  if (!Number.isFinite(ms) || ms < VIAJE_MINIMO_MS) return vacio;
  const distanciaM = distanciaMetros(anterior, actual);
  if (distanciaM < VIAJE_MINIMO_M) return { ...vacio, distanciaM: Math.round(distanciaM) };
  const velocidadKmh = distanciaM / 1000 / (ms / 3_600_000);
  return {
    imposible: velocidadKmh > limiteKmh,
    velocidadKmh: Math.round(velocidadKmh),
    distanciaM: Math.round(distanciaM),
  };
}

/** Qué hacer con la antigüedad del punto que reportó el teléfono. */
export type EdadDelPunto = { veredicto: 'ok' | 'revisar' | 'rechazar'; edadMs: number | null };

/**
 * Antigüedad de la medición, no de la petición.
 *
 * El teléfono la calcula con su reloj monótono (`elapsedRealtime` en Android,
 * la diferencia contra `location.timestamp` en iOS), así que cambiar la hora
 * del sistema no la altera. Una posición de hace media hora es la última que el
 * teléfono guardó, no dónde está su dueño.
 */
export function edadDelPunto(fixAgeMs?: number | null): EdadDelPunto {
  if (typeof fixAgeMs !== 'number' || !Number.isFinite(fixAgeMs) || fixAgeMs < 0) {
    return { veredicto: 'ok', edadMs: null };
  }
  if (fixAgeMs >= FIX_VIEJO_RECHAZO_MS) return { veredicto: 'rechazar', edadMs: Math.round(fixAgeMs) };
  if (fixAgeMs >= FIX_VIEJO_REVISAR_MS) return { veredicto: 'revisar', edadMs: Math.round(fixAgeMs) };
  return { veredicto: 'ok', edadMs: Math.round(fixAgeMs) };
}

/**
 * ¿Las últimas checadas cayeron en el mismo punto exacto?
 *
 * Un GPS real nunca repite: entre dos medidas en el mismo escritorio siempre
 * hay metros de diferencia. Una coordenada calcada varias veces seguidas es una
 * posición fija puesta a mano. No se rechaza —un teléfono con el GPS averiado
 * puede clavarse— pero se marca y sus jefes se enteran.
 */
export function coordenadaRepetida(
  actual: { latitude: number; longitude: number } | null | undefined,
  anteriores: Array<{ latitude: number; longitude: number }>,
  minimo = REPETIDAS_PARA_SOSPECHAR,
): boolean {
  if (!actual) return false;
  // `minimo` cuenta la de ahora: con 3 hacen falta 2 anteriores idénticas.
  const necesarias = Math.max(0, minimo - 1);
  if (necesarias === 0) return true;
  if (anteriores.length < necesarias) return false;
  return anteriores
    .slice(0, necesarias)
    .every((p) => distanciaMetros(actual, p) <= REPETIDA_TOLERANCIA_M);
}

function normalizarFecha(valor?: string | Date | null): Date | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}
