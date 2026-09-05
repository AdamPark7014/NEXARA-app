/**
 * Clasificación de los códigos `major`/`minor` del control de acceso Hikvision.
 *
 * ORIGEN. Tabla oficial del Apéndice C del `API_Developer Guide_V1.8.0`
 * (`HIKVISION-apps/docs/API-DOCS/`), **contrastada contra 47.343 eventos reales**
 * de la instalación de Oficinas entre 2026-06-07 y 2026-09-05. Donde el dato y
 * la documentación podían discrepar, se comprobó el dato. No discreparon.
 *
 * POR QUÉ EXISTE ESTE MÓDULO. Estas constantes vivían **copiadas en tres
 * sitios** (`integra-push.service.ts`, `acs-ops-bridge.match.ts`,
 * `integra-spaces.service.ts`), y las tres copias estaban mal de la misma forma.
 * Una sola fuente, y con pruebas.
 *
 * LO QUE ESTABA MAL, y cómo se demostró:
 *
 * El equipo numera sus propios eventos con `serialNo` consecutivo. En Acceso
 * General, el 2026-09-05:
 *
 *   13863 · minor 75 · CONCEDIDO a Joan Sebastián  · 02:48:39
 *   13864 · minor 21 ·                              · 02:48:39  (mismo segundo)
 *   13865 · minor 22 ·                              · 02:48:44  (+5 s, el relé)
 *
 * El 21 y el 22 son **consecuencia** de una concesión. Una denegación no puede
 * serlo. `21` es la puerta abriéndose y `22` la puerta volviendo a cerrarse
 * cinco segundos después. El código los contaba como acceso denegado.
 *
 * Igual con `23`→`24`: encabezan la cadena 23→21→24→22 en seriales seguidos, y
 * hay 10.445 y 10.444 de ellos — pares de pulsar y soltar el botón de salida.
 *
 * Y `76` no era «salida concedida»: **48 de 48 traen `FaceRect` y 0 de 48 traen
 * persona**. El equipo vio una cara, la encuadró y no la reconoció. Va en
 * ráfagas de reintento (4, 4, 4, 5, 11, 13 segundos) y siete de esos 48 van
 * seguidos, en menos de dos minutos y en el mismo equipo, de un `75` CON nombre
 * — el reintento que por fin funciona. Pica a las 10:00 y **no ocurre ni una
 * sola vez después de las 18:00**: un evento de salida que nunca pasa a la hora
 * de salir.
 *
 * EL DAÑO QUE CAUSABA. El KPI de denegados contaba 44.634 eventos, el **94,3 %
 * de todo el control de acceso de la instalación**. Denegaciones reales en tres
 * meses: **una**. Cada concesión legítima fabricaba dos denegados falsos (21+22)
 * y cada pulsación del botón de salida, cuatro.
 */

/** `major = 5` es «Device Event» — el tráfico normal de un terminal ACS. */
export const ACS_MAJOR_DEVICE = 5;

/**
 * Qué es cada evento. Deliberadamente más granular que «concedido/denegado»:
 * meter el estado de la puerta y el botón de salida en el mismo cubo que una
 * denegación fue justo el error original.
 */
export type AcsKind =
  /** Alguien se identificó y se le dejó pasar. */
  | 'granted'
  /** Alguien se identificó y NO se le dejó pasar. Esto sí es una denegación. */
  | 'denied'
  /** El equipo no reconoció la credencial presentada (rostro, huella, clave). */
  | 'auth_failed'
  /** La puerta se abrió o se cerró. Consecuencia, no decisión. */
  | 'door_state'
  /** Alguien pulsó o soltó el botón de salida. No hay credencial que juzgar. */
  | 'exit_button'
  /** La puerta se forzó o quedó abierta demasiado tiempo. Incidente real. */
  | 'door_alarm'
  /** Relés y salidas de alarma del propio equipo. */
  | 'device_state'
  /** No está en la tabla. Se guarda tal cual en vez de fingir que se entiende. */
  | 'unknown';

type AcsCode = {
  kind: AcsKind;
  label: string;
  /**
   * `observed` = visto en los datos de producción y verificado.
   * `documented` = está en el Apéndice C pero no se ha observado ni una vez en
   * tres meses, así que la clasificación es de fe en la documentación.
   */
  evidence: 'observed' | 'documented';
};

export const ACS_CODES: Readonly<Record<number, AcsCode>> = Object.freeze({
  // — Concesiones. Las únicas dos que el código anterior ya tenía bien.
  1: { kind: 'granted', label: 'Acceso concedido · tarjeta', evidence: 'observed' },
  75: { kind: 'granted', label: 'Acceso concedido · rostro', evidence: 'observed' },

  // — Denegaciones de verdad. TODAS caían antes en `unknown_minor` y se
  //   descartaban enteras, así que la instalación jamás registró una denegación
  //   real mientras el KPI marcaba 44.634.
  6: { kind: 'denied', label: 'Sin permiso para esta puerta', evidence: 'documented' },
  7: { kind: 'denied', label: 'Fuera de su horario', evidence: 'documented' },
  8: { kind: 'denied', label: 'Credencial caducada', evidence: 'documented' },
  9: { kind: 'denied', label: 'Tarjeta no registrada', evidence: 'documented' },
  10: { kind: 'denied', label: 'Antipassback: no registró su entrada', evidence: 'documented' },
  113: { kind: 'denied', label: 'Persona en lista negra', evidence: 'documented' },
  148: { kind: 'denied', label: 'Demasiados intentos de clave', evidence: 'documented' },
  152: { kind: 'denied', label: 'Número de empleado inexistente', evidence: 'documented' },
  155: { kind: 'denied', label: 'Tipo de autenticación no admitido', evidence: 'documented' },

  // — Fallos de reconocimiento. No son denegación (no se juzgó a nadie: no se
  //   supo quién era) ni concesión. Merecen su propia categoría porque un
  //   repunte aquí significa un lector sucio o mal calibrado, no un intruso.
  76: { kind: 'auth_failed', label: 'No reconoció el rostro', evidence: 'observed' },
  80: { kind: 'auth_failed', label: 'Fallo de reconocimiento facial', evidence: 'documented' },
  104: { kind: 'auth_failed', label: 'Sospecha de rostro falso', evidence: 'observed' },

  // — Estado de la puerta. Consecuencia de una concesión o del botón.
  21: { kind: 'door_state', label: 'Puerta desbloqueada', evidence: 'observed' },
  22: { kind: 'door_state', label: 'Puerta bloqueada', evidence: 'observed' },

  // — Botón de salida. Sin credencial: `currentVerifyMode: "invalid"`.
  23: { kind: 'exit_button', label: 'Botón de salida pulsado', evidence: 'observed' },
  24: { kind: 'exit_button', label: 'Botón de salida soltado', evidence: 'observed' },

  // — Incidentes de puerta. Cero eventos en tres meses, así que la
  //   clasificación viene de la documentación y no de la observación. Son
  //   valiosos —puerta forzada es una alarma de seguridad de primer orden— pero
  //   conviene confirmarlos en campo antes de fiarse de ellos.
  27: { kind: 'door_alarm', label: 'Puerta forzada', evidence: 'documented' },
  28: { kind: 'door_alarm', label: 'Puerta abierta demasiado tiempo', evidence: 'documented' },

  // — Relés del equipo.
  29: { kind: 'device_state', label: 'Salida de alarma activada', evidence: 'documented' },
  31: { kind: 'device_state', label: 'Salida de alarma iniciada', evidence: 'observed' },
  32: { kind: 'device_state', label: 'Salida de alarma detenida', evidence: 'observed' },
});

/**
 * `minor 39` aparece 29 veces con la misma firma que el `76`: ráfaga de
 * reintentos y después un `75` con nombre. Trae `verifyNo` y `cardReaderNo` y
 * nunca persona. **No está confirmado en el Apéndice C**, así que se deja
 * fuera de la tabla a propósito: se comporta como fallo de autenticación, pero
 * clasificarlo sin respaldo sería repetir el error que este módulo corrige.
 */
export const ACS_MINOR_SOSPECHOSO_FALLO_AUTH = 39;

export function classifyAcsMinor(
  major: number | null | undefined,
  minor: number | null | undefined,
): AcsCode {
  if (major !== ACS_MAJOR_DEVICE || minor == null) {
    return { kind: 'unknown', label: `Evento ${major ?? '?'}.${minor ?? '?'}`, evidence: 'documented' };
  }
  return (
    ACS_CODES[minor] ?? {
      kind: 'unknown',
      label: `Autenticación ${minor}`,
      evidence: 'documented',
    }
  );
}

/** ¿Cuenta para el KPI de accesos concedidos y para presencia? */
export function isAcsGranted(major: number | null, minor: number | null): boolean {
  return classifyAcsMinor(major, minor).kind === 'granted';
}

/**
 * ¿Es una denegación de verdad? Ojo: un fallo de reconocimiento (`auth_failed`)
 * **no** lo es. Nadie fue rechazado; el equipo no supo quién era. Mezclarlos
 * convierte un lector sucio en una alarma de seguridad.
 */
export function isAcsDenied(major: number | null, minor: number | null): boolean {
  return classifyAcsMinor(major, minor).kind === 'denied';
}

/** Incidentes de puerta que merecen alarma por sí solos. */
export function isAcsDoorAlarm(major: number | null, minor: number | null): boolean {
  return classifyAcsMinor(major, minor).kind === 'door_alarm';
}

/**
 * Ruido de funcionamiento normal: la puerta abriéndose, el botón de salida, los
 * relés. Es el **94,3 %** del tráfico ACS de la instalación, y es exactamente lo
 * que inflaba el KPI de denegados.
 */
export function isAcsOperationalNoise(major: number | null, minor: number | null): boolean {
  const k = classifyAcsMinor(major, minor).kind;
  return k === 'door_state' || k === 'exit_button' || k === 'device_state';
}

/** Etiqueta legible para la interfaz. */
export function acsCodeLabel(major: number | null, minor: number | null): string {
  return classifyAcsMinor(major, minor).label;
}
