"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import styles from "./integra.module.css";
import q from "./_quality.module.css";
import {
  HD_FIRST_FRAME_TIMEOUT_MS,
  RELEVO_INICIAL,
  SUB_RELEASE_AFTER_SWAP_MS,
  etiquetaCalidad,
  reducirRelevo,
  textoCortoSinHd,
  textoSinHd,
  type MotivoSinHd,
  type VideoSize,
} from "./_quality";

type StreamMode = "mse" | "mjpeg" | "auto";

/**
 * Oferta de alta calidad para ESTE cuadro, ya negociada por la página.
 *
 * La página decide a quién le toca —como máximo una cámara— y habla con la API;
 * el reproductor solo se encarga de que el cambio no se vea. Si `src` es `null`
 * no hay principal que valga y `motivo` dice por qué, que es lo que se le
 * enseña al operador.
 */
export type HdOffer = {
  /** Fuente HLS del canal principal, distinta de la del secundario. */
  src: string | null;
  /** Se está pidiendo ahora mismo. */
  pidiendo: boolean;
  /** Por qué no hay alta calidad, cuando no la hay. */
  motivo: MotivoSinHd | null;
  /** Detalle del backend, p. ej. «el principal va en H.265». */
  detalle: string | null;
};

type Props = {
  /** URL HLS que devuelve la API. De ella se deriva WS / frame.jpeg. */
  src: string | null;
  showLiveBadge?: boolean;
  compact?: boolean;
  className?: string;
  startDelayMs?: number;
  enabled?: boolean;
  /**
   * `mse` = video de verdad por WebSocket. `mjpeg` = snapshots HTTP
   * `frame.jpeg` — el `mode=mjpeg` del `<video-stream>` no entrega frames con
   * estos RTSP, por eso son snapshots y no su modo nativo.
   *
   * `auto` es lo que usa el muro: intenta MSE y, si ese mosaico no da imagen a
   * tiempo, cae a snapshots él solo. Antes el muro entero iba a un JPEG por
   * segundo para que no se quedara ninguno colgado; así solo paga ese precio
   * el que de verdad falla.
   */
  mode?: StreamMode;
  /**
   * Reproducir con sonido. Solo Foco: el muro va mudo por definición y el
   * navegador bloquea el autoplay de cualquier cosa que suene.
   */
  audio?: boolean;
  /**
   * El mosaico le cuenta al muro en qué estado va. El muro lo usa para el
   * control de admisión: mientras haya cuadros conectando no deja entrar más,
   * y en cuanto uno llega a `live` admite al siguiente de la cola.
   */
  onStateChange?: (state: PlayerState) => void;
  /**
   * Oferta de alta calidad. Con ella el cuadro pasa a mejora progresiva:
   * arranca con el secundario —que ya está caliente— y sube al principal sin
   * corte cuando ese entrega imagen. Sin ella se comporta exactamente como
   * antes, que es lo que hace el muro.
   */
  hd?: HdOffer | null;
};

/**
 * `offscreen` no es un estado del stream, es del cuadro: está fuera del
 * viewport y su `IntersectionObserver` no lo deja arrancar. Se reporta aparte
 * de `queued` porque el control de admisión del muro necesita distinguirlos —un
 * cuadro invisible no debe ocupar turno de conexión, y antes lo ocupaba—.
 */
export type PlayerState =
  | "idle"
  | "queued"
  | "offscreen"
  | "loading"
  | "live"
  | "snapshot"
  | "error";

/**
 * Espera mínima entre fotogramas del respaldo, ya recibido el anterior. Es un
 * suelo, no un periodo: si el servidor tarda más, el ritmo lo marca él.
 */
const SNAPSHOT_MIN_GAP_MS = 900;

let loaderPromise: Promise<void> | null = null;

function loadVideoStream(base: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (customElements.get("video-stream")) return Promise.resolve();
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.type = "module";
    s.src = `${base}/video-stream.js`;
    s.onload = () => {
      void customElements.whenDefined("video-stream").then(() => resolve());
    };
    s.onerror = () => reject(new Error("No se pudo cargar el reproductor"));
    document.head.appendChild(s);
  });
  return loaderPromise;
}

/** Precarga el custom element antes de abrir el primer mosaico (quita ~200–400 ms). */
export function preloadGo2rtcPlayer(hlsOrBase?: string | null): void {
  if (typeof window === "undefined") return;
  let base = "/go2rtc";
  if (hlsOrBase) {
    try {
      const u = new URL(hlsOrBase, window.location.origin);
      const b = u.pathname.replace(/\/api\/stream\.m3u8$/, "");
      if (b !== u.pathname) base = `${u.origin}${b}`;
      else if (/^https?:\/\//.test(hlsOrBase)) base = hlsOrBase.replace(/\/$/, "");
    } catch {
      /* default */
    }
  }
  void loadVideoStream(base).catch(() => undefined);
}

function parseHls(src: string): { base: string; name: string } | null {
  try {
    const u = new URL(src, window.location.origin);
    const name = u.searchParams.get("src");
    if (!name) return null;
    const base = u.pathname.replace(/\/api\/stream\.m3u8$/, "");
    if (base === u.pathname) return null;
    return { base: `${u.origin}${base}`, name };
  } catch {
    return null;
  }
}

type VideoStreamEl = HTMLElement & {
  mode?: string;
  media?: string;
  src?: URL | string;
  background?: boolean;
  visibilityCheck?: boolean;
  video?: HTMLVideoElement;
  play?: () => void;
};

function hardenVideo(node: VideoStreamEl, unmuted = false) {
  const v = node.video || node.querySelector("video");
  if (!v) return null;
  // Arranca siempre mudo: con sonido el navegador rechaza el play() y el
  // cuadro se queda negro. El sonido se abre después, ya reproduciendo.
  if (!unmuted) {
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute("muted", "");
  }
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.controls = false;
  v.removeAttribute("controls");
  v.autoplay = true;
  return v;
}

function kickPlay(node: VideoStreamEl) {
  const v = hardenVideo(node);
  if (!v) return;
  if (typeof node.play === "function") {
    node.play();
    return;
  }
  void v.play().catch(() => {
    v.muted = true;
    void v.play().catch(() => undefined);
  });
}

type ShellProps = {
  src: string | null;
  showLiveBadge?: boolean;
  compact?: boolean;
  className?: string;
  startDelayMs?: number;
  enabled?: boolean;
  audio?: boolean;
  onStateChange?: (state: PlayerState) => void;
};

/**
 * Avisa al muro del estado sin re-disparar el efecto cuando el padre pasa una
 * función nueva en cada render: la referencia se guarda en un ref y solo se
 * notifica cuando el estado cambia de verdad.
 */
function useReportState(state: PlayerState, report?: (s: PlayerState) => void) {
  const ref = useRef(report);
  ref.current = report;
  useEffect(() => {
    ref.current?.(state);
  }, [state]);
}

/** Muro: JPEG HTTP refrescado. No usa el decodificador H.264 del navegador. */
function SnapshotWallPlayer({
  src,
  showLiveBadge = true,
  compact = false,
  className,
  startDelayMs = 0,
  enabled = true,
  onStateChange,
}: ShellProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<"idle" | "queued" | "loading" | "live" | "error">(
    src && enabled ? "loading" : src ? "queued" : "idle",
  );

  // Hacia fuera esto NO es «live»: es un JPEG por segundo. Llamarlo live es lo
  // que hacía que un respaldo a 0,9 fps se leyera como «el video se traba».
  // Y si el cuadro está fuera de pantalla se dice, para que no ocupe turno de
  // conexión en el muro esperando algo que no va a pasar.
  useReportState(!visible ? "offscreen" : state === "live" ? "snapshot" : state, onStateChange);

  const parsed = src ? parseHls(src) : null;

  useEffect(() => {
    const el = shellRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setVisible(Boolean(entry?.isIntersecting && (entry.intersectionRatio ?? 0) > 0.05));
      },
      { threshold: [0, 0.05, 0.2] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const active = Boolean(src && enabled && visible && parsed);

  /**
   * Autorregulado: el siguiente fotograma no se pide hasta que ha llegado el
   * anterior. Antes era un `setInterval` fijo de 1100 ms contra un servidor que
   * tarda entre 0,8 y 2,5 s en servir cada JPEG —cada uno abre su propia sesión
   * RTSP y espera keyframe—, así que se pedía más rápido de lo que se podía
   * entregar y cada petición abortada dejaba un `broken pipe`: 2 254 en una
   * sola sesión de producción. Encadenar las peticiones hace imposible
   * adelantar al servidor, y el muro va tan rápido como el servidor dé.
   */
  const nextRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      setState(src ? "queued" : "idle");
      return;
    }
    setState("loading");
    let cancelled = false;
    const start = window.setTimeout(() => {
      if (!cancelled) setTick((t) => t + 1);
    }, Math.max(0, startDelayMs));
    return () => {
      cancelled = true;
      window.clearTimeout(start);
      if (nextRef.current != null) {
        window.clearTimeout(nextRef.current);
        nextRef.current = null;
      }
    };
  }, [active, src, enabled, startDelayMs]);

  const scheduleNext = () => {
    if (!active) return;
    if (nextRef.current != null) window.clearTimeout(nextRef.current);
    nextRef.current = window.setTimeout(() => setTick((t) => t + 1), SNAPSHOT_MIN_GAP_MS);
  };

  const frameUrl =
    active && parsed
      ? `${parsed.base}/api/frame.jpeg?src=${encodeURIComponent(parsed.name)}&t=${tick}`
      : null;

  return (
    <div
      ref={shellRef}
      className={`${styles.playerShell} ${className || ""}`}
      data-compact={compact ? "1" : undefined}
      data-state={state}
      data-mode="mjpeg"
    >
      <div className={styles.playerVideo}>
        {frameUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={frameUrl}
            alt=""
            className={styles.wallSnapImg}
            onLoad={() => {
              setState("live");
              scheduleNext();
            }}
            onError={() => {
              setState((s) => (s === "live" ? s : "error"));
              scheduleNext();
            }}
          />
        ) : null}
      </div>
      {showLiveBadge && state === "live" && (
        <span
          className={styles.playerLiveBadge}
          data-tone="snapshot"
          title="Este cuadro no consiguió video en vivo y va por imágenes, ~1 por segundo."
        >
          RESPALDO · 1 img/s
        </span>
      )}
      {state === "loading" && (
        <div className={styles.playerOverlay}>
          <span className={styles.playerSpinner} />
        </div>
      )}
      {state === "queued" && (
        <div className={styles.playerOverlay} data-tone="queued">
          <span>{!enabled ? "En cola" : "En espera"}</span>
        </div>
      )}
      {state === "error" && (
        <div className={styles.playerOverlay} data-tone="error">
          <span>Sin video</span>
        </div>
      )}
      {state === "idle" && (
        <div className={styles.playerOverlay}>
          <span>Selecciona una cámara</span>
        </div>
      )}
    </div>
  );
}

function MseFocusPlayer({
  src,
  showLiveBadge = true,
  compact = false,
  className,
  startDelayMs = 0,
  enabled = true,
  audio = false,
  onLive,
  onSize,
  onStateChange,
}: ShellProps & {
  /**
   * Primer fotograma pintado. El segundo argumento trae las dimensiones reales
   * del `<video>`, que es lo único honesto para decir si esto es SD o HD.
   */
  onLive?: (live: boolean, size?: VideoSize | null) => void;
  /** Las dimensiones cambiaron (o llegaron tarde). */
  onSize?: (size: VideoSize) => void;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef<VideoStreamEl | null>(null);
  const [visible, setVisible] = useState(true);
  const [muted, setMuted] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"idle" | "queued" | "loading" | "live" | "error">(
    src ? (enabled ? "loading" : "queued") : "idle",
  );

  useReportState(!visible ? "offscreen" : state, onStateChange);

  // Las dimensiones reales del `<video>` viajan por un ref para no meter otra
  // dependencia en el efecto de montaje, que es el que no hay que despertar.
  const onLiveRef = useRef(onLive);
  onLiveRef.current = onLive;
  const onSizeRef = useRef(onSize);
  onSizeRef.current = onSize;

  // El turno de arranque solo se lee al montar. Si fuera dependencia del efecto,
  // quitar un mosaico del muro reindexaría el turno de todos los siguientes y
  // les tiraría el WebSocket a la vez — la tormenta de reconexión.
  const startDelayRef = useRef(startDelayMs);
  startDelayRef.current = startDelayMs;

  useEffect(() => {
    const el = shellRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setVisible(Boolean(entry?.isIntersecting && (entry.intersectionRatio ?? 0) > 0.05));
      },
      { threshold: [0, 0.05, 0.2] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const shouldPlay = Boolean(src && enabled && visible);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    if (!src) {
      setState("idle");
      host.innerHTML = "";
      return;
    }
    if (!enabled || !visible) {
      setState("queued");
      host.innerHTML = "";
      return;
    }

    const parsed = parseHls(src);
    if (!parsed) {
      setState("error");
      return;
    }

    let cancelled = false;
    let el: VideoStreamEl | null = null;
    let playWatch: number | null = null;
    let stuckTimer: number | null = null;
    let kickTimers: number[] = [];
    let sawLive = false;
    let lastW = 0;
    let lastH = 0;
    setState("loading");

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      void loadVideoStream(parsed.base)
        .then(() => {
          if (cancelled || !hostRef.current) return;
          const node = document.createElement("video-stream") as VideoStreamEl;
          node.mode = "mse";
          // Pedir la pista de audio solo cuando la hay: si se declara y el
          // stream no la trae, el componente espera por ella y no pinta nada.
          node.media = audio ? "video,audio" : "video";
          node.background = false;
          node.visibilityCheck = false;
          node.style.width = "100%";
          node.style.height = "100%";
          node.style.display = "block";
          hostRef.current.appendChild(node);
          node.src = `${parsed.base}/api/ws?src=${encodeURIComponent(parsed.name)}`;
          el = node;
          nodeRef.current = node;

          const arm = () => {
            if (cancelled) return;
            hardenVideo(node);
            kickPlay(node);
          };
          arm();
          // PTZ / go2rtc: patadas densas al abrir WS (primer frame lo antes posible).
          kickTimers = [0, 16, 50, 100, 200, 400, 800, 1600].map((ms) =>
            window.setTimeout(arm, ms),
          );

          // Antes esto corría cada 180 ms y reescribía muted/playsinline/
          // controls/autoplay en cada vuelta: con 9 mosaicos eran 50 mutaciones
          // de DOM por segundo sobre elementos <video> activos. Ya reproduciendo
          // no hay nada que endurecer, así que el vigilante se relaja.
          playWatch = window.setInterval(() => {
            if (cancelled) return;
            const v = sawLive ? node.video || node.querySelector("video") : hardenVideo(node);
            if (!v) return;
            if (v.paused || v.ended) kickPlay(node);
            if (v.readyState >= 2 && !v.paused) {
              const size =
                v.videoWidth > 0 && v.videoHeight > 0
                  ? { width: v.videoWidth, height: v.videoHeight }
                  : null;
              if (!sawLive) {
                sawLive = true;
                setState("live");
                onLiveRef.current?.(true, size);
              }
              // Las dimensiones pueden llegar un ciclo más tarde que el primer
              // fotograma. Se vigilan igual porque de ellas sale la etiqueta de
              // calidad, y una etiqueta que miente es peor que ninguna.
              if (size && (size.width !== lastW || size.height !== lastH)) {
                lastW = size.width;
                lastH = size.height;
                onSizeRef.current?.(size);
              }
            }
          }, 500);

          // Si se queda en «Conectando…», remonta el <video-stream> una vez.
          stuckTimer = window.setTimeout(() => {
            if (cancelled || sawLive || attempt >= 1) return;
            setAttempt((n) => n + 1);
          }, MSE_RETRY_MS);
        })
        .catch(() => {
          if (!cancelled) setState("error");
        });
    }, Math.max(0, startDelayRef.current));

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (playWatch != null) window.clearInterval(playWatch);
      if (stuckTimer != null) window.clearTimeout(stuckTimer);
      for (const t of kickTimers) window.clearTimeout(t);
      el?.remove();
      nodeRef.current = null;
      if (host) host.innerHTML = "";
    };
  }, [src, shouldPlay, enabled, visible, audio, attempt]);

  // Un stream nuevo llega mudo otra vez: el gesto de abrir sonido no se hereda.
  useEffect(() => {
    setMuted(true);
    setAttempt(0);
  }, [src, audio]);

  const toggleSound = () => {
    const node = nodeRef.current;
    const v = node?.video || node?.querySelector("video");
    if (!v) return;
    const next = !v.muted;
    v.muted = next;
    if (!next) {
      v.removeAttribute("muted");
      v.volume = 1;
      void v.play().catch(() => undefined);
    }
    setMuted(next);
  };

  return (
    <div
      ref={shellRef}
      className={`${styles.playerShell} ${className || ""}`}
      data-compact={compact ? "1" : undefined}
      data-state={state}
      data-mode="mse"
    >
      <div ref={hostRef} className={styles.playerVideo} />
      {audio && state === "live" && (
        <button
          type="button"
          className={styles.playerSound}
          onClick={toggleSound}
          title={muted ? "Activar sonido" : "Silenciar"}
          aria-label={muted ? "Activar sonido" : "Silenciar"}
        >
          {muted ? "🔇 Sonido" : "🔊"}
        </button>
      )}
      {showLiveBadge && state === "live" && (
        <span className={styles.playerLiveBadge}>
          <span className={styles.playerLiveDot} /> LIVE
        </span>
      )}
      {state === "loading" && (
        <div className={styles.playerOverlay}>
          <span className={styles.playerSpinner} />
          {!compact && <span>{attempt > 0 ? "Reintentando stream…" : "Conectando…"}</span>}
        </div>
      )}
      {state === "queued" && (
        <div className={styles.playerOverlay} data-tone="queued">
          <span>{!enabled ? "En cola" : "En espera"}</span>
        </div>
      )}
      {state === "error" && (
        <div className={styles.playerOverlay} data-tone="error">
          <span>Sin video</span>
        </div>
      )}
      {state === "idle" && (
        <div className={styles.playerOverlay}>
          <span>Selecciona una cámara</span>
        </div>
      )}
    </div>
  );
}

/**
 * Un solo remontaje del `<video-stream>` si no llegó imagen. Tiene que caber
 * holgadamente antes de `MSE_GIVE_UP_MS`: antes eran 2600 y 4500, así que el
 * reintento y la rendición se pisaban y cada celda abría dos WebSockets y un
 * flujo de imágenes en menos de cinco segundos.
 */
const MSE_RETRY_MS = 3200;

/** Cuánto se le da a MSE —contando el reintento— antes de pasar a respaldo. */
const MSE_GIVE_UP_MS = 11_000;

/**
 * El respaldo por imágenes ya no es una condena. Cada tanto se vuelve a probar
 * MSE: si la cámara se cayó un momento o el NVR estaba sin sesiones libres, el
 * cuadro se recupera solo en vez de quedarse a 1 fps el resto de la sesión.
 */
const SNAPSHOT_RECHECK_MS = 45_000;

function AutoPlayer(props: ShellProps) {
  const [fallback, setFallback] = useState(false);
  const [live, setLive] = useState(false);

  // Cada cámara tiene su propia suerte: al cambiar de stream se vuelve a
  // intentar MSE en vez de arrastrar el respaldo del anterior.
  useEffect(() => {
    setFallback(false);
    setLive(false);
  }, [props.src]);

  useEffect(() => {
    if (fallback || live || !props.src || !props.enabled) return;
    const t = window.setTimeout(() => setFallback(true), MSE_GIVE_UP_MS);
    return () => window.clearTimeout(t);
  }, [fallback, live, props.src, props.enabled]);

  // Reintento periódico desde el respaldo.
  useEffect(() => {
    if (!fallback || !props.src || !props.enabled) return;
    const t = window.setTimeout(() => setFallback(false), SNAPSHOT_RECHECK_MS);
    return () => window.clearTimeout(t);
  }, [fallback, props.src, props.enabled]);

  if (fallback) {
    const { audio: _audio, ...wall } = props;
    return <SnapshotWallPlayer {...wall} />;
  }
  return <MseFocusPlayer {...props} onLive={setLive} />;
}

/**
 * Mejora progresiva de calidad, que es lo que quita a la vez la espera y el
 * pixelado al abrir una cámara.
 *
 * Antes, abrir Foco cerraba el stream del muro y abría otro: se pagaba el
 * handshake RTSP entero —0,7 a 2,5 s con RTT de 87 ms— y durante ese rato el
 * cuadro estaba en negro. Aquí no se cierra nada:
 *
 * 1. Se arranca con **el mismo stream del muro**, que ya está caliente en
 *    go2rtc. Primer fotograma inmediato, sin handshake nuevo.
 * 2. En paralelo, y en su propia capa invisible, se monta el canal principal.
 * 3. Cuando el principal entrega su primer fotograma se cambia de capa. React
 *    aplica opacidad y desmontaje en el mismo commit, así que no hay parpadeo.
 * 4. Si el principal no llega nunca —H.265, error, timeout— se retira él y el
 *    secundario sigue donde estaba. **Nunca se queda peor que antes.**
 *
 * La regla que sostiene el punto 4 está en `reducirRelevo`, con pruebas: el
 * `<video-stream>` del secundario no se desmonta hasta que el principal está
 * pintando de verdad.
 */
function ProgressiveQualityPlayer({ hd, ...base }: ShellProps & { hd: HdOffer }) {
  const [relevo, despachar] = useReducer(reducirRelevo, RELEVO_INICIAL);
  const [subSize, setSubSize] = useState<VideoSize | null>(null);
  const [hdSize, setHdSize] = useState<VideoSize | null>(null);

  const hdSrc = hd.src;
  const baseSrc = base.src;

  // Cambiar de cámara reinicia el relevo entero: la suerte de una no se hereda.
  useEffect(() => {
    despachar({ t: "reinicio" });
    setSubSize(null);
    setHdSize(null);
  }, [baseSrc]);

  // La página ofrece o retira el principal. `baseSrc` va en las dependencias
  // porque el reinicio de arriba corre en el mismo commit y hay que volver a
  // ofrecer lo que siga vigente.
  useEffect(() => {
    if (hdSrc) despachar({ t: "hd-ofrecido" });
    else despachar({ t: "hd-retirado", motivo: hd.motivo });
  }, [hdSrc, hd.motivo, baseSrc]);

  // Rendición por tiempo. No cuesta imagen —el secundario nunca se soltó— pero
  // libera la segunda sesión RTSP contra el NVR, que es el recurso escaso.
  useEffect(() => {
    if (!hdSrc || !relevo.hdMontado || relevo.hdVisible) return;
    const t = window.setTimeout(() => despachar({ t: "hd-timeout" }), HD_FIRST_FRAME_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [hdSrc, relevo.hdMontado, relevo.hdVisible]);

  // Ya cambiada la capa, el secundario aguanta un momento más como red y luego
  // se suelta: dos sesiones abiertas para siempre sí serían un problema.
  useEffect(() => {
    if (!relevo.hdVisible || !relevo.subMontado) return;
    const t = window.setTimeout(() => despachar({ t: "sub-liberado" }), SUB_RELEASE_AFTER_SWAP_MS);
    return () => window.clearTimeout(t);
  }, [relevo.hdVisible, relevo.subMontado]);

  const alta = relevo.hdVisible;
  const size = alta ? hdSize ?? subSize : subSize;
  const etiqueta = etiquetaCalidad(size);
  const subiendo = Boolean(hd.pidiendo || (relevo.hdMontado && !relevo.hdVisible));
  const motivoCorto = alta ? null : textoCortoSinHd(relevo.motivo, hd.detalle);
  const motivoLargo = alta ? null : textoSinHd(relevo.motivo, hd.detalle);

  const marcarHd = (s?: VideoSize | null) => {
    if (!s || s.width <= 0) return;
    setHdSize(s);
    despachar({ t: "hd-fotograma" });
  };

  return (
    <div className={q.pila} data-compact={base.compact ? "1" : undefined}>
      {relevo.subMontado && (
        <div className={q.capa} data-flujo="1">
          <MseFocusPlayer
            {...base}
            onStateChange={alta ? undefined : base.onStateChange}
            onLive={(_live, s) => {
              if (s) setSubSize(s);
            }}
            onSize={setSubSize}
          />
        </div>
      )}
      {relevo.hdMontado && hdSrc && (
        <div
          className={q.capa}
          data-flujo={relevo.subMontado ? undefined : "1"}
          data-encima="1"
          data-oculta={alta ? undefined : "1"}
        >
          <MseFocusPlayer
            {...base}
            src={hdSrc}
            // Mientras negocia por detrás no debe anunciar nada: el badge que
            // se ve es el de la capa que está pintando.
            showLiveBadge={alta ? base.showLiveBadge : false}
            onStateChange={(st) => {
              if (st === "error") despachar({ t: "hd-error" });
              if (alta) base.onStateChange?.(st);
            }}
            onLive={(_live, s) => marcarHd(s)}
            onSize={marcarHd}
          />
        </div>
      )}
      {etiqueta && (
        <span
          className={q.chip}
          data-alta={alta ? "1" : undefined}
          data-subiendo={subiendo ? "1" : undefined}
          data-compact={base.compact ? "1" : undefined}
          aria-label={motivoLargo ? `${etiqueta}. ${motivoLargo}` : etiqueta}
        >
          <span className={q.punto} />
          {etiqueta}
          {motivoCorto && <span className={q.motivoChip}>· {motivoCorto}</span>}
        </span>
      )}
    </div>
  );
}

export function IntegraLivePlayer({ mode = "mse", hd, ...rest }: Props) {
  if (mode === "mjpeg") {
    const { audio: _audio, ...wall } = rest;
    return <SnapshotWallPlayer {...wall} />;
  }
  // Con oferta de alta calidad el cuadro pasa a mejora progresiva. Sin ella —el
  // caso del muro— el camino es exactamente el de antes, byte por byte.
  if (hd) return <ProgressiveQualityPlayer {...rest} hd={hd} />;
  if (mode === "auto") return <AutoPlayer {...rest} />;
  return <MseFocusPlayer {...rest} />;
}
