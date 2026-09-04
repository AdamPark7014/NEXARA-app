"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./integra.module.css";

type StreamMode = "mse" | "mjpeg" | "auto";

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
};

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
};

/** Muro: JPEG HTTP refrescado. No usa el decodificador H.264 del navegador. */
function SnapshotWallPlayer({
  src,
  showLiveBadge = true,
  compact = false,
  className,
  startDelayMs = 0,
  enabled = true,
}: ShellProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<"idle" | "queued" | "loading" | "live" | "error">(
    src && enabled ? "loading" : src ? "queued" : "idle",
  );

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
    const period = window.setInterval(() => {
      if (!cancelled) setTick((t) => t + 1);
    }, 1100);
    return () => {
      cancelled = true;
      window.clearTimeout(start);
      window.clearInterval(period);
    };
  }, [active, src, enabled, startDelayMs]);

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
            onLoad={() => setState("live")}
            onError={() => setState((s) => (s === "live" ? s : "error"))}
          />
        ) : null}
      </div>
      {showLiveBadge && state === "live" && (
        <span className={styles.playerLiveBadge}>
          <span className={styles.playerLiveDot} /> LIVE
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
}: ShellProps & { onLive?: (live: boolean) => void }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef<VideoStreamEl | null>(null);
  const [visible, setVisible] = useState(true);
  const [muted, setMuted] = useState(true);
  const [state, setState] = useState<"idle" | "queued" | "loading" | "live" | "error">(
    src ? (enabled ? "loading" : "queued") : "idle",
  );

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
    let kickTimers: number[] = [];
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
          kickTimers = [50, 200, 600, 1500, 3000].map((ms) => window.setTimeout(arm, ms));

          playWatch = window.setInterval(() => {
            if (cancelled) return;
            const v = hardenVideo(node);
            if (!v) return;
            if (v.paused || v.ended) kickPlay(node);
            if (v.readyState >= 2 && !v.paused) {
              setState("live");
              onLive?.(true);
            }
          }, 1200);
        })
        .catch(() => {
          if (!cancelled) setState("error");
        });
    }, Math.max(0, startDelayMs));

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (playWatch != null) window.clearInterval(playWatch);
      for (const t of kickTimers) window.clearTimeout(t);
      el?.remove();
      nodeRef.current = null;
      if (host) host.innerHTML = "";
    };
  }, [src, shouldPlay, startDelayMs, enabled, visible, audio]);

  // Un stream nuevo llega mudo otra vez: el gesto de abrir sonido no se hereda.
  useEffect(() => {
    setMuted(true);
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
          {!compact && <span>Conectando…</span>}
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

/** Cuánto se le da a MSE antes de dar ese mosaico por perdido. */
const MSE_GIVE_UP_MS = 7000;

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
    const t = window.setTimeout(
      () => setFallback(true),
      MSE_GIVE_UP_MS + (props.startDelayMs ?? 0),
    );
    return () => window.clearTimeout(t);
  }, [fallback, live, props.src, props.enabled, props.startDelayMs]);

  if (fallback) {
    const { audio: _audio, ...wall } = props;
    return <SnapshotWallPlayer {...wall} />;
  }
  return <MseFocusPlayer {...props} onLive={setLive} />;
}

export function IntegraLivePlayer({ mode = "mse", ...rest }: Props) {
  if (mode === "mjpeg") {
    const { audio: _audio, ...wall } = rest;
    return <SnapshotWallPlayer {...wall} />;
  }
  if (mode === "auto") return <AutoPlayer {...rest} />;
  return <MseFocusPlayer {...rest} />;
}
