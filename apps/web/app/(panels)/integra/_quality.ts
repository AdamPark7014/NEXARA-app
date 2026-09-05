/**
 * Decisión de calidad de video: cuándo vale la pena pedir el canal principal,
 * qué hacer cuando ese canal no llega, y qué se le enseña al operador.
 *
 * Todo lo de aquí es lógica pura a propósito. Es exactamente el tipo de regla
 * que se rompe en silencio —nadie nota que dejó de pedirse alta calidad, o que
 * se pide para nueve mosaicos a la vez— así que vive fuera de los componentes
 * y tiene pruebas propias en `_quality.spec.ts`.
 *
 * ## Lo medido, que es de donde salen los números
 *
 * - El canal **secundario** de las cámaras de vigilancia entrega **640×360**;
 *   las terminales de puerta, 1280×720.
 * - El **principal** es 1920×1080 pero va en **H.265**, que MSE no decodifica.
 *   Pedirlo sin más daría un cuadro negro girando para siempre, que es peor que
 *   pixelado. El backend ya lo sabe (`mainStreamPlayable`) y degrada a `sub`
 *   diciendo el motivo en `note`.
 * - El RTT por Tailscale es de **87 ms** y un handshake RTSP nuevo tarda entre
 *   **0,7 y 2,5 s**. Ese, y no el ancho de banda, es el coste real de abrir una
 *   cámara: por eso el secundario del muro —que ya está caliente en go2rtc— no
 *   se suelta hasta que el principal está pintando.
 */

export type StreamQuality = "sub" | "main";

export type VideoSize = { width: number; height: number };

/**
 * Ancho real del canal secundario. Medido decodificando la cabecera SOF de los
 * JPEG que sirve go2rtc, no deducido de la ficha del equipo.
 */
export const SUB_WIDTH_PX = 640;

/**
 * A partir de cuántos píxeles de ancho del elemento se pide el canal principal.
 *
 * El número se justifica contra los 640 px del secundario, que es lo único que
 * importa aquí: el factor de ampliación es `ancho / 640`.
 *
 * - A 960 px (1,5×) la ampliación se nota poco y no compensa: el principal
 *   multiplica por nueve los píxeles a decodificar y abre una SEGUNDA sesión
 *   RTSP contra un NVR que corta a las pocas simultáneas.
 * - A 1280 px (2×) ya es la queja original —«se ve pixelada»— y a pantalla
 *   completa sobre 1920 son 3×, que es indefendible.
 *
 * 1100 px cae entre esos dos (1,72×): pide alta calidad justo antes de que la
 * ampliación se vuelva evidente, y no antes.
 *
 * Y hay una segunda razón para este valor exacto: sobre una pantalla de 1920
 * con el rail abierto el escenario del muro mide ~1550 px, así que una celda de
 * 2×2 son ~760 px y una de 3×3 ~500 px. Ninguna llega a 1100. **El muro no pide
 * principal por tamaño, no por una excepción escrita a mano** — y si mañana
 * alguien pone una celda enorme, la regla sigue siendo la misma.
 */
export const HD_MIN_ELEMENT_PX = 1100;

/**
 * Desde qué ancho la etiqueta dice «HD» en vez de «SD». 1280 es el primer
 * escalón real del parque: por debajo está el secundario de 640 y por encima el
 * principal de 1920; las terminales de puerta caen justo aquí.
 */
export const HD_LABEL_MIN_WIDTH = 1280;

/**
 * Cuánto se espera al primer fotograma del principal antes de rendirse.
 *
 * El handshake RTSP medido tarda entre 0,7 y 2,5 s, y un GOP de 1080p añade la
 * espera al keyframe. 8 s cubre el peor caso con margen ancho. Rendirse no
 * cuesta imagen —el secundario nunca se soltó— pero sí libera la segunda sesión
 * RTSP contra el NVR, que es el recurso escaso.
 */
export const HD_FIRST_FRAME_TIMEOUT_MS = 8_000;

/**
 * Cuánto sigue montado el secundario DESPUÉS de que el principal pinte.
 *
 * El intercambio en sí es atómico —React aplica opacidad y desmontaje en el
 * mismo commit— pero mantener el secundario un momento más deja una red por si
 * el principal se cae en el primer segundo, y el coste es medio segundo de dos
 * sesiones abiertas.
 */
export const SUB_RELEASE_AFTER_SWAP_MS = 600;

/* ────────────────────────────────────────────────────────────────────────
 * 1 · ¿Se pide alta calidad?
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Factor de ampliación del secundario para un elemento de este ancho.
 * 1 = píxel a píxel; 3 = cada píxel de la cámara ocupa tres en pantalla.
 */
export function subUpscale(elementWidthPx: number): number {
  if (!Number.isFinite(elementWidthPx) || elementWidthPx <= 0) return 0;
  return elementWidthPx / SUB_WIDTH_PX;
}

/**
 * La regla es por **tamaño en píxeles del elemento**, no por modo de vista.
 * Un mosaico de muro en 1×1 pequeño no pide principal, y un Foco en una ventana
 * estrecha tampoco: lo que decide es cuánto se va a ampliar el secundario.
 */
export function shouldRequestHd(elementWidthPx: number | null | undefined): boolean {
  if (typeof elementWidthPx !== "number" || !Number.isFinite(elementWidthPx)) return false;
  return elementWidthPx >= HD_MIN_ELEMENT_PX;
}

export type MotivoSinHd =
  | "codec"
  | "sin-canal"
  | "sin-respuesta"
  | "sin-fotograma"
  | "playback"
  | "proveedor"
  | "pequeno";

export type ObjetivoHd = {
  cameraId: string;
  /** Ancho medido del elemento que la está mostrando. */
  widthPx: number;
};

export type EntradaObjetivoHd = {
  mode: "wall" | "focus";
  /** Cámara que ocupa Foco, si la hay. */
  focusId: string | null;
  focusProvider?: string | null;
  /** Se está viendo grabación del NVR: eso ya es canal principal por otra vía. */
  playbackActive: boolean;
  /**
   * Ancho medido —en vivo— del escenario que está mostrando la cámara.
   *
   * Aquí es donde entra «o en pantalla completa» sin una regla aparte: el
   * escenario de Foco es el elemento que se amplía con `F`, así que al entrar
   * en pantalla completa este número pasa de ~1300 a 1920 él solo. Si mañana
   * alguien cambia el reparto de la pantalla, la decisión se ajusta sin tocar
   * una línea.
   */
  stageWidthPx: number | null;
};

/**
 * Qué cámara —**como máximo una**— tiene derecho a pedir el canal principal.
 *
 * Que devuelva un solo id no es cosmético: es lo que garantiza que nunca haya
 * dos sesiones RTSP de 1080p abiertas contra el mismo NVR, que corta a las
 * pocas simultáneas. Si mañana alguien quiere alta calidad en dos sitios a la
 * vez tendrá que cambiar esta firma, y al hacerlo verá el porqué.
 *
 * El muro no aparece por ninguna parte: no porque se le excluya a mano, sino
 * porque ninguna de sus celdas llega al umbral de ancho.
 */
export function elegirObjetivoHd(e: EntradaObjetivoHd): {
  objetivo: ObjetivoHd | null;
  motivo: MotivoSinHd | null;
} {
  if (e.mode !== "focus" || !e.focusId) return { objetivo: null, motivo: null };
  // El playback del NVR ya sale del canal principal por su propia URL; pedir
  // «main» encima abriría un stream que nadie va a mirar.
  if (e.playbackActive) return { objetivo: null, motivo: "playback" };
  // HCT no pasa por go2rtc: lo pinta el SDK de Ezviz y no acepta esta negociación.
  if (String(e.focusProvider ?? "").toUpperCase() === "HCT") {
    return { objetivo: null, motivo: "proveedor" };
  }
  if (!shouldRequestHd(e.stageWidthPx)) return { objetivo: null, motivo: "pequeno" };
  return { objetivo: { cameraId: e.focusId, widthPx: e.stageWidthPx as number }, motivo: null };
}

/* ────────────────────────────────────────────────────────────────────────
 * 2 · ¿La respuesta del backend sirve de algo?
 * ──────────────────────────────────────────────────────────────────────── */

/** Nombre del stream dentro de go2rtc, sacado de la URL HLS (`?src=`). */
export function go2rtcStreamName(hls: string | null | undefined): string | null {
  if (!hls) return null;
  const m = /[?&]src=([^&]+)/.exec(hls);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/**
 * ¿Son el mismo stream de go2rtc?
 *
 * Importa más de lo que parece. El canal principal se registra con su propio
 * nombre (`cam_X_hd`) justamente para no pisar el del muro. Si la respuesta a
 * `quality=main` trae el MISMO nombre que el secundario, es que ese extremo del
 * backend no atendió la petición: montar un segundo reproductor sobre el mismo
 * stream no daría un solo píxel más y la etiqueta «HD» sería mentira.
 */
export function sameGo2rtcStream(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = go2rtcStreamName(a);
  const nb = go2rtcStreamName(b);
  if (na && nb) return na === nb;
  return Boolean(a) && a === b;
}

/**
 * El backend degrada solo cuando el principal no se puede reproducir, y lo dice
 * en `note`. Esto lo saca para enseñárselo al operador tal cual.
 */
export function motivoDelBackend(note: string | null | undefined): string | null {
  if (!note) return null;
  const m = /alta calidad no disponible:\s*([^·]+)/i.exec(note);
  return m ? m[1].trim() : null;
}

export type RespuestaHd = {
  hls: string | null;
  note?: string | null;
  /** Nombre del stream en go2rtc, si la API lo devolvió. */
  streamName?: string | null;
};

export type VeredictoHd =
  | { usable: true; src: string; note: string | null }
  | { usable: false; motivo: MotivoSinHd; detalle: string | null };

/**
 * Qué hacer con lo que devolvió `quality=main`.
 *
 * Se desconfía a propósito: el veredicto no es «el backend dijo que sí», es
 * «me ha dado un stream distinto del que ya estoy viendo». Así, si el extremo
 * HTTP ignora el parámetro —hoy lo ignora: el controlador aún no lee
 * `?quality`— la interfaz se queda en el secundario y lo dice, en vez de
 * anunciar un HD que no existe.
 */
export function evaluarRespuestaHd(
  respuesta: RespuestaHd | null,
  sub: { hls: string | null; streamName?: string | null },
): VeredictoHd {
  if (!respuesta || !respuesta.hls) {
    return { usable: false, motivo: "sin-respuesta", detalle: null };
  }
  const delCodec = motivoDelBackend(respuesta.note);
  if (delCodec) return { usable: false, motivo: "codec", detalle: delCodec };

  const nombreHd = respuesta.streamName || go2rtcStreamName(respuesta.hls);
  const nombreSub = sub.streamName || go2rtcStreamName(sub.hls);
  const mismo =
    nombreHd && nombreSub ? nombreHd === nombreSub : sameGo2rtcStream(respuesta.hls, sub.hls);
  if (mismo) return { usable: false, motivo: "sin-canal", detalle: null };

  return { usable: true, src: respuesta.hls, note: respuesta.note ?? null };
}

/* ────────────────────────────────────────────────────────────────────────
 * 3 · El intercambio, sin corte visible
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Estado del relevo entre el secundario (caliente, ya pintando) y el principal.
 *
 * La invariante que sostiene todo esto —y que las pruebas comprueban en cada
 * transición— es **`subMontado || hdVisible`**: nunca puede haber un instante
 * sin nada pintando. Ese hueco es justo lo que se veía antes al abrir Foco.
 */
export type EstadoRelevo = {
  /** El `<video-stream>` del secundario sigue en el DOM. */
  subMontado: boolean;
  /** El `<video-stream>` del principal está en el DOM (pidiendo o pintando). */
  hdMontado: boolean;
  /** El principal es el que se ve. */
  hdVisible: boolean;
  /** Por qué no hay principal, cuando no lo hay. */
  motivo: MotivoSinHd | null;
};

export const RELEVO_INICIAL: EstadoRelevo = {
  subMontado: true,
  hdMontado: false,
  hdVisible: false,
  motivo: null,
};

export type EventoRelevo =
  /** Cambió la cámara o la fuente: se vuelve a empezar desde el secundario. */
  | { t: "reinicio" }
  /** La página ya tiene una fuente de alta calidad distinta que ofrecer. */
  | { t: "hd-ofrecido" }
  /** La página retira la oferta (se salió de Foco, o no había canal). */
  | { t: "hd-retirado"; motivo: MotivoSinHd | null }
  /** El principal entregó su primer fotograma con dimensiones reales. */
  | { t: "hd-fotograma" }
  /** Pasó el tiempo de gracia: ya se puede soltar el secundario. */
  | { t: "sub-liberado" }
  /** El principal no pintó a tiempo. */
  | { t: "hd-timeout" }
  /** El principal falló. */
  | { t: "hd-error" };

export function reducirRelevo(estado: EstadoRelevo, ev: EventoRelevo): EstadoRelevo {
  switch (ev.t) {
    case "reinicio":
      return RELEVO_INICIAL;

    case "hd-ofrecido":
      // El secundario NO se toca. Sigue pintando mientras el otro negocia.
      if (estado.hdMontado) return estado;
      return { ...estado, subMontado: true, hdMontado: true, hdVisible: false, motivo: null };

    case "hd-retirado":
      // Volver al secundario siempre es seguro: nunca se desmontó salvo que el
      // principal ya estuviera pintando, y en ese caso hay que remontarlo.
      if (estado.subMontado && !estado.hdMontado && estado.motivo === ev.motivo) return estado;
      return { subMontado: true, hdMontado: false, hdVisible: false, motivo: ev.motivo };

    case "hd-fotograma":
      if (!estado.hdMontado) return estado;
      // Idempotente a propósito: las dimensiones del `<video>` pueden llegar
      // varias veces y devolver un objeto nuevo cada vez repintaría en bucle.
      if (estado.hdVisible && estado.motivo === null) return estado;
      // Aquí es donde se cambia. El secundario sigue montado un momento más.
      return { ...estado, hdVisible: true, motivo: null };

    case "sub-liberado":
      // Soltar el secundario solo se permite si hay principal pintando.
      if (!estado.hdVisible || !estado.subMontado) return estado;
      return { ...estado, subMontado: false };

    case "hd-timeout":
    case "hd-error": {
      // Si ya estaba pintando, un error tardío no puede dejar el cuadro en
      // negro: se recupera el secundario antes de soltar el principal.
      const motivo: MotivoSinHd = ev.t === "hd-timeout" ? "sin-fotograma" : "sin-respuesta";
      if (estado.subMontado && !estado.hdMontado && estado.motivo === motivo) return estado;
      return { subMontado: true, hdMontado: false, hdVisible: false, motivo };
    }

    default:
      return estado;
  }
}

/** La invariante del relevo, expuesta para poder afirmarla en las pruebas. */
export function relevoPintaAlgo(estado: EstadoRelevo): boolean {
  return estado.subMontado || (estado.hdMontado && estado.hdVisible);
}

/* ────────────────────────────────────────────────────────────────────────
 * 4 · Qué se le enseña al operador
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Etiqueta de calidad a partir de las dimensiones REALES del `<video>`.
 *
 * Se leen de `videoWidth`/`videoHeight`, no de lo que dijo el backend: si el
 * servidor promete principal y entrega secundario, el operador ve 640×360, que
 * es la verdad.
 */
export function etiquetaCalidad(size: VideoSize | null | undefined): string | null {
  if (!size) return null;
  const { width, height } = size;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const alta = width >= HD_LABEL_MIN_WIDTH;
  return `${alta ? "HD" : "SD"} ${Math.round(width)}×${Math.round(height)}`;
}

/** Texto para el operador cuando no hay alta calidad. */
export function textoSinHd(motivo: MotivoSinHd | null, detalle?: string | null): string | null {
  switch (motivo) {
    case "codec":
      return detalle
        ? `Alta calidad no disponible: ${detalle}`
        : "Alta calidad no disponible: el principal va en H.265, que el navegador no decodifica";
    case "sin-canal":
      return "Alta calidad no disponible: el servidor no ofrece un canal distinto para esta cámara";
    case "sin-respuesta":
      return "Alta calidad no disponible: el canal principal no respondió";
    case "sin-fotograma":
      return "Alta calidad no disponible: el canal principal no dio imagen a tiempo";
    case "playback":
      return "Grabación del NVR: ya sale del canal principal";
    case "proveedor":
      return null;
    case "pequeno":
      return null;
    default:
      return null;
  }
}

/**
 * La misma explicación, del largo que cabe en el indicador del cuadro. El texto
 * largo va en la nota técnica; aquí solo tiene que responder «¿por qué esta se
 * ve peor que la otra?» de un vistazo.
 */
export function textoCortoSinHd(motivo: MotivoSinHd | null, detalle?: string | null): string | null {
  switch (motivo) {
    case "codec":
      return detalle || "el principal va en H.265";
    case "sin-canal":
      return "sin canal HD";
    case "sin-respuesta":
      return "HD no respondió";
    case "sin-fotograma":
      return "HD sin imagen";
    default:
      return null;
  }
}
