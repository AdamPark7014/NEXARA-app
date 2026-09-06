/**
 * Alta calidad en Foco: cuándo se sirve el principal, cuándo se transcodifica y
 * cuándo hay que decir que no.
 *
 * Todo lo de aquí es lógica pura a propósito. Es la clase de regla que se rompe
 * en silencio —nadie nota que dejó de transcodificarse, o que se transcodifican
 * trece a la vez y el servidor se cae— así que vive fuera del servicio de Nest
 * y tiene pruebas propias en `integra-media.hd.spec.ts`.
 *
 * ## Lo medido, que es de donde salen los números
 *
 * - Canal **101** de las 13 cámaras de vigilancia: **1920×1080 H.265 VBR
 *   ≤2048 kbps**. MSE no decodifica H.265: servirlo tal cual da cuadro negro.
 * - Canal **102**: 640×360 H.264. Es lo que alimenta el muro, y es lo que se
 *   veía pixelado al abrir una cámara a pantalla completa.
 * - Las 4 terminales de puerta (`.160`–`.163`) tienen el 101 en **H.264
 *   1280×720**: esas NO se transcodifican nunca, se sirven tal cual.
 * - Servidor: **4 vCPU AMD EPYC**, carga 0,65, 11 GB libres.
 *
 * ## Por qué el tope es UNO
 *
 * Transcodificar 1080p con la plantilla `h264` de go2rtc (libx264 `superfast` +
 * `zerolatency`, ver `hdTranscodeSource`) cuesta del orden de medio núcleo por
 * cámara entre decodificar H.265 y reencodear H.264. Una de cuatro vCPU es
 * asumible; trece a la vez son más núcleos de los que hay y tumban la API junto
 * con el muro. Foco muestra **una sola cámara**, así que una ranura basta —y el
 * tope está aquí, en código, no en la confianza de que el front pida una sola.
 */

/**
 * Calidad pedida para un stream.
 *
 * `sub` es el secundario (medido en Oficinas: **640×360**) y `main` el
 * principal (1920×1080 en las DS-2CD2123G2 del parque, nueve veces más píxeles).
 *
 * La regla es asimétrica a propósito. En un mosaico de 3×3 sobre una pantalla
 * de 1920 cada celda mide unos 600 px, así que el secundario ya la llena: subir
 * ahí a principal no añadiría un solo píxel visible y multiplicaría por nueve el
 * ancho de banda, la CPU de decodificación y —lo que de verdad escuece— las
 * sesiones RTSP contra un NVR que corta a las pocas simultáneas. Solo sube de
 * calidad lo que se está mirando grande, que es como máximo una.
 */
export type StreamQuality = 'sub' | 'main';

/**
 * ¿Puede el navegador reproducir el canal principal de esta cámara **tal cual**,
 * sin pasarlo por ffmpeg?
 *
 * Medido en Oficinas: las 13 cámaras de vigilancia tienen el principal a
 * 1920×1080 pero en **H.265**, que MSE no decodifica. Pedirlo sin más daría un
 * cuadro negro girando para siempre.
 *
 * Ante un códec desconocido se responde que SÍ, a propósito: el espejo puede no
 * haberlo guardado todavía, y en ese caso vale más intentarlo y que el
 * reproductor caiga a respaldo que gastar la única ranura de transcodificación
 * en una cámara que probablemente no la necesita.
 */
export function mainStreamPlayable(codec?: string | null): boolean {
  const c = String(codec ?? '')
    .toUpperCase()
    .replace(/[.\s_-]/g, '');
  if (!c) return true;
  return !(c === 'H265' || c === 'HEVC' || c === 'MPEGH' || c.startsWith('H265'));
}

/**
 * Cómo se acabó sirviendo la petición de alta calidad.
 *
 * - `nativo`: el principal ya va en H.264 y se pasa tal cual (terminales).
 * - `transcodificado`: el principal va en H.265 y ffmpeg lo pasa a H.264.
 * - `secundario`: no hay alta calidad, y la razón se cuenta en la nota.
 */
export type ModoHd = 'nativo' | 'transcodificado' | 'secundario';

/**
 * La única ranura de transcodificación del servidor, mientras está ocupada.
 *
 * Se identifica por **cámara**, no por nombre de stream: encender el micrófono
 * cambia el nombre (`cam_X_hd` → `cam_X_hd_a`) pero sigue siendo la misma
 * cámara y no debe contar como una segunda transcodificación.
 */
export type RanuraHd = {
  cameraIndexCode: string;
  /** Nombre del stream dentro de go2rtc — lo que hay que borrar al liberar. */
  streamName: string;
  /** Última vez que se supo que alguien la quería (ms epoch). */
  pedidoEn: number;
};

/**
 * Margen antes de plantearse siquiera liberar la ranura.
 *
 * Cubre el hueco real entre que la API registra el stream y que el reproductor
 * del navegador se engancha —el handshake RTSP medido tarda entre 0,7 y 2,5 s,
 * más la espera al keyframe de un GOP de 1080p— y sobre todo cubre el ir y
 * venir del operador: salir de Foco, mirar otra cámara y volver no debe costar
 * un arranque de ffmpeg nuevo. Un minuto es holgado para las dos cosas y sigue
 * siendo corto comparado con lo que dura un turno de vigilancia.
 */
export const HD_GRACIA_MS = 60_000;

/**
 * Fuente go2rtc que transcodifica el principal H.265 a H.264 para MSE.
 *
 * **La cadena no está inventada.** go2rtc documenta la sintaxis `ffmpeg:` en su
 * README (sección «Source: FFmpeg»): `ffmpeg:<input>#video=h264` transcodifica
 * el video a H.264 y descarta el audio; `#audio=aac` añade la pista de audio en
 * AAC. Es exactamente el mismo mecanismo que ya usa `audioSourceFor()` para el
 * audio G.711, que lleva meses en producción.
 *
 * `h264` no es una cadena libre sino una **plantilla con nombre** de go2rtc. La
 * de la imagen `alexxit/go2rtc:1.9.7` que corre en el compose es, literalmente:
 *
 * ```
 * -c:v libx264 -g 50 -profile:v high -level:v 4.1 -preset:v superfast \
 *   -tune:v zerolatency -pix_fmt:v yuv420p
 * ```
 *
 * `superfast` + `zerolatency` es justo lo que hace viable esto en CPU: sin
 * lookahead ni B-frames, un 1080p entra en medio núcleo largo. Y `profile high
 * / level 4.1 / yuv420p` es el perfil que MSE sí decodifica.
 *
 * No se toca la resolución: el objetivo es 1080p de verdad, así que nada de
 * `#width`/`#height`. go2rtc trae ffmpeg en la propia imagen.
 */
export function hdTranscodeSource(rtsp: string, conAudio: boolean): string {
  return conAudio ? `ffmpeg:${rtsp}#video=h264#audio=aac` : `ffmpeg:${rtsp}#video=h264`;
}

/** Datos con los que se decide el modo de alta calidad. */
export type EntradaModoHd = {
  quality: StreamQuality;
  /** Códec del canal PRINCIPAL, tal como lo guardó el sync. */
  codec?: string | null;
  /**
   * ¿Existe un canal principal **distinto** del que ya se está sirviendo?
   *
   * Las terminales de puerta publican un solo perfil: pedirles otro da 404, así
   * que ahí no hay nada que transcodificar aunque el códec no fuera reproducible.
   */
  hayPrincipal: boolean;
  /** ¿Se consiguió la única ranura de transcodificación del servidor? */
  cupo: boolean;
};

/**
 * ¿Esta petición necesita quemar la ranura de transcodificación?
 *
 * Se pregunta ANTES de pelear por la ranura para no reservarla a una cámara que
 * no la necesita —las terminales van en H.264 y se sirven tal cual—.
 */
export function requiereTranscodificacion(
  e: Pick<EntradaModoHd, 'quality' | 'codec' | 'hayPrincipal'>,
): boolean {
  return e.quality === 'main' && e.hayPrincipal && !mainStreamPlayable(e.codec);
}

/**
 * Qué se acaba sirviendo, y por qué cuando la respuesta es «el secundario».
 *
 * La `razon` es texto para el operador: viaja en `note` y el front la pinta tal
 * cual. Nunca lleva `·`, que es el separador con el que el front trocea la nota.
 */
export function elegirModoHd(e: EntradaModoHd): { modo: ModoHd; razon: string | null } {
  // El muro no negocia nada: pide `sub` y se le da `sub`, sin nota.
  if (e.quality !== 'main') return { modo: 'secundario', razon: null };

  // El principal ya es reproducible: se pasa tal cual, gratis. Es el caso de
  // las cuatro terminales de puerta, H.264 1280×720.
  if (mainStreamPlayable(e.codec)) return { modo: 'nativo', razon: null };

  const codec = String(e.codec ?? '').trim() || 'H.265';

  // Un solo perfil publicado: no hay principal aparte que reencodear.
  if (!e.hayPrincipal) {
    return { modo: 'secundario', razon: `el equipo publica un solo perfil y va en ${codec}` };
  }

  // Aquí está el tope duro. Trece transcodificaciones de 1080p a la vez no
  // caben en cuatro vCPU: la segunda cámara se queda en el secundario y se le
  // dice por qué, en vez de tumbar el servidor y perder también el muro.
  if (!e.cupo) {
    return {
      modo: 'secundario',
      razon: `el principal va en ${codec} y ya hay otra cámara transcodificando (solo cabe una a la vez)`,
    };
  }

  return { modo: 'transcodificado', razon: null };
}

/** Petición concreta que quiere la ranura. */
export type SolicitudHd = { cameraIndexCode: string; streamName: string };

/**
 * Reparte la única ranura de transcodificación.
 *
 * Devuelve la ranura resultante en vez de mutar nada: el estado vive en el
 * servicio y aquí solo se decide, que es lo que se puede probar sin levantar
 * Nest ni go2rtc.
 *
 * `liberar` es el nombre de un stream que el llamante debe borrar de go2rtc —
 * pasa cuando la misma cámara vuelve a pedir con otro nombre porque le
 * encendieron el micrófono: sin borrarlo quedaría un ffmpeg huérfano, que es
 * justo el goteo que el tope pretende evitar.
 */
export function reservarRanuraHd(
  ranura: RanuraHd | null,
  solicitud: SolicitudHd,
  ahora: number,
): { concedida: boolean; ranura: RanuraHd | null; liberar: string | null } {
  if (!ranura) {
    return { concedida: true, ranura: { ...solicitud, pedidoEn: ahora }, liberar: null };
  }

  // La misma cámara insistiendo no es una segunda transcodificación: se renueva.
  if (ranura.cameraIndexCode === solicitud.cameraIndexCode) {
    const liberar = ranura.streamName === solicitud.streamName ? null : ranura.streamName;
    return { concedida: true, ranura: { ...solicitud, pedidoEn: ahora }, liberar };
  }

  // Otra cámara la tiene y sigue viva. No se la quitamos: el operador que está
  // mirando se quedaría sin imagen para que otro la gane, y al siguiente clic
  // se la robaría de vuelta. Se responde con el secundario y una nota.
  return { concedida: false, ranura, liberar: null };
}

/** ¿La ranura es demasiado reciente como para tocarla? */
export function dentroDelMargenHd(
  ranura: RanuraHd,
  ahora: number,
  graciaMs: number = HD_GRACIA_MS,
): boolean {
  return ahora - ranura.pedidoEn < graciaMs;
}

/**
 * Qué hacer con la ranura ocupada.
 *
 * - `nada`: no hay ranura.
 * - `esperar`: es reciente, o no se pudo preguntar a go2rtc. No se corta.
 * - `renovar`: alguien la está mirando; se refresca el reloj para que un turno
 *   largo de vigilancia no acabe cortándose solo.
 * - `liberar`: nadie la consume desde hace más del margen. Fuera el ffmpeg.
 *
 * `consumidores === null` significa «no se pudo preguntar» (go2rtc caído, red
 * cortada). Ahí se espera a propósito: cortar por un fallo de consulta dejaría
 * al operador sin imagen justo cuando algo va mal.
 */
export type VeredictoRanuraHd = 'nada' | 'esperar' | 'renovar' | 'liberar';

export function decidirLiberacionHd(
  ranura: RanuraHd | null,
  ahora: number,
  consumidores: number | null,
  graciaMs: number = HD_GRACIA_MS,
): VeredictoRanuraHd {
  if (!ranura) return 'nada';
  if (dentroDelMargenHd(ranura, ahora, graciaMs)) return 'esperar';
  if (consumidores === null) return 'esperar';
  if (consumidores > 0) return 'renovar';
  return 'liberar';
}

/**
 * La nota que ve el operador, y que el front trocea.
 *
 * **Contrato con el front, que no se puede romper.** `_quality.ts` busca en la
 * nota la expresión `alta calidad no disponible: <razón>`; si la encuentra, da
 * la negociación por fallida y se queda en el secundario. Por eso:
 *
 * - `transcodificado` y `nativo` NO pueden contener esa expresión —si la
 *   llevaran, el front tiraría a la basura el 1080p que acabamos de montar—.
 * - `secundario` SÍ debe llevarla: es como la razón exacta llega a la interfaz
 *   en vez de un texto genérico.
 */
export function notaHd(modo: ModoHd, razon?: string | null): string | null {
  switch (modo) {
    case 'nativo':
      return 'HD nativo: el principal ya va en H.264 y se sirve sin transcodificar';
    case 'transcodificado':
      return 'HD transcodificado en el servidor: H.265 a H.264 1080p, una cámara a la vez';
    case 'secundario':
      return razon ? `alta calidad no disponible: ${razon}` : null;
  }
}
