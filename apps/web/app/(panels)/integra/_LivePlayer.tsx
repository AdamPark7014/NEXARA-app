"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./integra.module.css";

type Props = {
  /** URL HLS que devuelve la API. De ella se deriva el WebSocket. */
  src: string | null;
  showLiveBadge?: boolean;
  compact?: boolean;
  className?: string;
};

/**
 * Reproductor en vivo sobre **MSE por WebSocket**, no HLS.
 *
 * Por qué se cambió: con HLS el muro no arrancaba solo. Ni nueve mosaicos ni
 * uno: en Foco, con una sola cámara, el `play()` tampoco prosperaba y el
 * usuario tenía que pulsar el botón en cada cuadro. Se descartó el backend
 * midiendo —los 9 streams simultáneos entregan 8 de 8 playlists con segmentos,
 * y go2rtc conecta con la cámara en cuanto alguien pide— y se comprobó en el
 * navegador que el **mismo stream por MSE reproduce solo**. El problema era el
 * transporte, no el video.
 *
 * Se usa el componente `<video-stream>` del propio go2rtc en vez de
 * reimplementarlo: ya resuelve el arranque, la reconexión y el respaldo a otros
 * modos. Se sirve desde nuestro propio dominio (`/go2rtc/`), así que la CSP lo
 * admite con `script-src 'self'` — no hace falta abrirle hueco a ningún CDN,
 * que fue justo lo que dejó a hls.js sin cargar en producción.
 */

let loaderPromise: Promise<void> | null = null;

/** Carga una sola vez el módulo de go2rtc y espera a que registre el elemento. */
function loadVideoStream(base: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (customElements.get("video-stream")) return Promise.resolve();
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.type = "module";
    s.src = `${base}/video-stream.js`;
    s.onload = () => {
      // El módulo registra el custom element de forma asíncrona.
      void customElements.whenDefined("video-stream").then(() => resolve());
    };
    s.onerror = () => reject(new Error("No se pudo cargar el reproductor"));
    document.head.appendChild(s);
  });
  return loaderPromise;
}

/**
 * `https://host/go2rtc/api/stream.m3u8?src=NOMBRE` → base y nombre del stream.
 * La API ya devuelve la URL pública correcta, así que no hace falta que el
 * cliente conozca `GO2RTC_PUBLIC_URL` por su cuenta.
 */
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

export function IntegraLivePlayer({
  src,
  showLiveBadge = true,
  compact = false,
  className,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "loading" | "live" | "error">(
    src ? "loading" : "idle",
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !src) {
      setState(src ? "loading" : "idle");
      return;
    }

    const parsed = parseHls(src);
    if (!parsed) {
      setState("error");
      return;
    }

    let cancelled = false;
    let el: (HTMLElement & { mode?: string; src?: URL | string }) | null = null;
    setState("loading");

    void loadVideoStream(parsed.base)
      .then(() => {
        if (cancelled || !hostRef.current) return;
        const node = document.createElement("video-stream") as HTMLElement & {
          mode?: string;
          src?: URL | string;
          background?: boolean;
        };
        // `mse` es el que arranca solo y da baja latencia. El componente cae a
        // otros modos por su cuenta si el navegador no lo soporta.
        node.mode = "mse";
        node.background = false;
        node.style.width = "100%";
        node.style.height = "100%";
        node.style.display = "block";
        node.src = `${parsed.base}/api/ws?src=${encodeURIComponent(parsed.name)}`;
        hostRef.current.appendChild(node);
        el = node;
        setState("live");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
      // Quitarlo del DOM cierra su WebSocket: sin esto, cerrar un mosaico
      // dejaba la conexión viva contra el equipo.
      el?.remove();
      if (host) host.innerHTML = "";
    };
  }, [src]);

  return (
    <div className={`${styles.playerShell} ${className || ""}`} data-compact={compact ? "1" : undefined}>
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
