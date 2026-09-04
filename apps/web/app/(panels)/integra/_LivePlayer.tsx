"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./integra.module.css";

type StreamMode = "mse" | "mjpeg";

type Props = {
  /** URL HLS que devuelve la API. De ella se deriva el WebSocket. */
  src: string | null;
  showLiveBadge?: boolean;
  compact?: boolean;
  className?: string;
  /**
   * Retraso antes de abrir el WebSocket. En el muro cada mosaico entra con
   * turno propio para no saturar el navegador.
   */
  startDelayMs?: number;
  /**
   * Si es false, no se abre el stream. El mosaico muestra “En cola”.
   */
  enabled?: boolean;
  /**
   * `mjpeg` = mosaicos del muro (ligero, se ven todos).
   * `mse` = Foco / calidad (decodificador H.264; pocos a la vez).
   */
  mode?: StreamMode;
};

/**
 * Reproductor go2rtc `<video-stream>`.
 *
 * En el muro usamos MJPEG: JPEG por WebSocket, sin decodificador H.264 por
 * mosaico — así se ven 9–16 cámaras sin el tope de 4 MSE ni el play azul.
 * En Foco usamos MSE (mejor latencia/calidad).
 */

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
  visibilityThreshold?: number;
  visibilityCheck?: boolean;
  video?: HTMLVideoElement;
  play?: () => void;
};

function hardenVideo(node: VideoStreamEl) {
  const v = node.video || node.querySelector("video");
  if (!v) return null;
  v.muted = true;
  v.defaultMuted = true;
  v.setAttribute("muted", "");
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

function isShowing(node: VideoStreamEl, mode: StreamMode): boolean {
  const v = hardenVideo(node);
  if (!v) return false;
  if (mode === "mjpeg") {
    // MJPEG pinta en `poster`; basta con que haya imagen.
    return Boolean(v.poster && v.poster.length > 32);
  }
  return v.readyState >= 2 && !v.paused;
}

export function IntegraLivePlayer({
  src,
  showLiveBadge = true,
  compact = false,
  className,
  startDelayMs = 0,
  enabled = true,
  mode = "mse",
}: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
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
          node.mode = mode;
          node.media = "video";
          node.background = false;
          node.visibilityCheck = false;
          node.style.width = "100%";
          node.style.height = "100%";
          node.style.display = "block";
          node.src = `${parsed.base}/api/ws?src=${encodeURIComponent(parsed.name)}`;
          hostRef.current.appendChild(node);
          el = node;

          const arm = () => {
            if (cancelled) return;
            hardenVideo(node);
            if (mode === "mse") kickPlay(node);
          };

          arm();
          kickTimers = [50, 200, 600, 1500, 3000].map((ms) =>
            window.setTimeout(arm, ms),
          );

          playWatch = window.setInterval(() => {
            if (cancelled) return;
            if (mode === "mse") {
              const v = hardenVideo(node);
              if (v && (v.paused || v.ended)) kickPlay(node);
            } else {
              hardenVideo(node);
            }
            if (isShowing(node, mode)) setState("live");
          }, mode === "mjpeg" ? 800 : 1200);
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
      if (host) host.innerHTML = "";
    };
  }, [src, shouldPlay, startDelayMs, enabled, visible, mode]);

  return (
    <div
      ref={shellRef}
      className={`${styles.playerShell} ${className || ""}`}
      data-compact={compact ? "1" : undefined}
      data-state={state}
      data-mode={mode}
    >
      <div ref={hostRef} className={styles.playerVideo} />
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
