"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./integra.module.css";

type Props = {
  /** URL HLS que devuelve la API. De ella se deriva el WebSocket. */
  src: string | null;
  showLiveBadge?: boolean;
  compact?: boolean;
  className?: string;
  /**
   * Retraso antes de abrir el WebSocket. En el muro cada mosaico entra con
   * turno propio para no saturar el decodificador del navegador.
   */
  startDelayMs?: number;
  /**
   * Si es false, no se abre el stream (cupo de vivos / en cola). El mosaico
   * sigue montado y muestra “En cola”.
   */
  enabled?: boolean;
};

/**
 * Reproductor en vivo sobre **MSE por WebSocket**, no HLS.
 *
 * go2rtc `<video-stream>` por defecto pide audio y deja `controls=true`.
 * En un muro eso provoca el botón play grande: Chrome bloquea autoplay con
 * audio y el decodificador se satura con 9 MSE a la vez. Aquí forzamos
 * `media=video`, `muted` y sin controles, y reintentamos `play()`.
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

/** Silencia y quita controles del `<video>` interno (go2rtc los crea con controls). */
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

export function IntegraLivePlayer({
  src,
  showLiveBadge = true,
  compact = false,
  className,
  startDelayMs = 0,
  enabled = true,
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
          // Solo video: con audio Chrome bloquea autoplay y aparece el play azul.
          node.mode = "mse";
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
            kickPlay(node);
          };

          // connectedCallback crea el <video> de forma síncrona; reforzamos
          // muted/controls en varios ticks porque MSE tarda en tener frames.
          arm();
          kickTimers = [50, 200, 600, 1500, 3000].map((ms) =>
            window.setTimeout(arm, ms),
          );

          playWatch = window.setInterval(() => {
            if (cancelled) return;
            const v = hardenVideo(node);
            if (!v) return;
            if (v.paused || v.ended) {
              kickPlay(node);
              return;
            }
            if (v.readyState >= 2 && !v.paused) {
              setState("live");
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
      if (host) host.innerHTML = "";
    };
  }, [src, shouldPlay, startDelayMs, enabled, visible]);

  return (
    <div
      ref={shellRef}
      className={`${styles.playerShell} ${className || ""}`}
      data-compact={compact ? "1" : undefined}
      data-state={state}
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
