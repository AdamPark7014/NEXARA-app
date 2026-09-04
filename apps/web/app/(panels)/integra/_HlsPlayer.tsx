"use client";

import type HlsType from "hls.js";
import { useEffect, useRef, useState } from "react";
import styles from "./integra.module.css";

type Props = {
  src: string | null;
  poster?: string;
  muted?: boolean;
  autoPlay?: boolean;
  showLiveBadge?: boolean;
  compact?: boolean;
  className?: string;
};

type Phase = "idle" | "loading" | "playing" | "paused" | "error";

/**
 * Player HTML5 + HLS.js.
 *
 * No tratar el `error` nativo del <video> como fatal cuando HLS.js maneja el
 * media: dispara en el attach y dejaba la UI en «No se pudo reproducir».
 */
export function IntegraHlsPlayer({
  src,
  poster,
  muted = true,
  autoPlay = true,
  showLiveBadge = true,
  compact = false,
  className,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>(src ? "loading" : "idle");
  const [isMuted, setIsMuted] = useState(muted);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    setIsMuted(muted);
  }, [muted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) {
      setPhase(src ? "loading" : "idle");
      return;
    }

    // Tipo real del paquete. Antes era una forma estructural a mano porque
    // `Hls` llegaba como global sin tipos desde el CDN.
    let hls: HlsType | null = null;
    let usingHls = false;
    let cancelled = false;
    setPhase("loading");
    setErrMsg(null);

    const tryPlay = () => {
      if (cancelled || !autoPlay) return;
      video.muted = true;
      const p = video.play();
      if (p && typeof p.then === "function") {
        void p
          .then(() => {
            if (!cancelled) setPhase("playing");
          })
          .catch(() => {
            if (!cancelled) setPhase("paused");
          });
      }
    };

    const onPlaying = () => {
      if (!cancelled) setPhase("playing");
    };
    const onPause = () => {
      if (!cancelled && !video.ended) {
        setPhase((p) => (p === "loading" ? p : "paused"));
      }
    };
    const onWaiting = () => {
      if (!cancelled && !video.paused) setPhase("loading");
    };
    const onNativeError = () => {
      // Con HLS.js el error nativo es ruido; él recupera o emite fatal propio.
      if (cancelled || usingHls) return;
      setPhase("error");
      setErrMsg("No se pudo reproducir el stream");
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("error", onNativeError);

    const attach = async () => {
      const canNative = Boolean(video.canPlayType("application/vnd.apple.mpegurl"));
      if (canNative) {
        video.src = src;
        video.addEventListener("loadedmetadata", tryPlay, { once: true });
        return;
      }

      // hls.js va **empaquetado**, no desde un CDN.
      //
      // Antes se inyectaba un <script> a jsdelivr y en producción no cargaba
      // nunca: la CSP del sitio permite scripts de Google Maps, Brevo y Stripe,
      // pero no jsdelivr. El navegador lo bloqueaba en silencio, el player caía
      // al modo nativo —que sólo Safari tiene— y Chrome mostraba «No se pudo
      // reproducir el stream» aunque go2rtc estuviera sirviendo el HLS
      // perfectamente.
      //
      // Importarlo también quita una dependencia de internet en una consola de
      // seguridad: si el sitio del cliente no alcanza el CDN, el video seguía
      // sin verse. El `import()` lo deja en su propio chunk, así que sólo lo
      // descarga quien abre el video.
      const Hls = (await import("hls.js")).default;

      if (cancelled) return;
      if (!Hls?.isSupported()) {
        video.src = src;
        video.addEventListener("loadedmetadata", tryPlay, { once: true });
        return;
      }

      usingHls = true;
      const instance = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        fragLoadingMaxRetry: 6,
        manifestLoadingMaxRetry: 4,
        levelLoadingMaxRetry: 4,
      });
      instance.loadSource(src);
      instance.attachMedia(video);
      instance.on?.(Hls.Events.MANIFEST_PARSED, tryPlay);
      instance.on?.(
        Hls.Events.ERROR,
        (_evt: unknown, data: { fatal?: boolean; type?: string }) => {
          if (cancelled || !data?.fatal) return;
          if (data.type === Hls.ErrorTypes?.NETWORK_ERROR) {
            instance.startLoad?.();
            setPhase("loading");
            return;
          }
          if (data.type === Hls.ErrorTypes?.MEDIA_ERROR) {
            instance.recoverMediaError?.();
            setPhase("loading");
            return;
          }
          setPhase("error");
          setErrMsg("Stream interrumpido");
        },
      );
      hls = instance;
    };

    void attach().catch(() => {
      if (cancelled || !video) return;
      usingHls = false;
      video.src = src;
      video.addEventListener("loadedmetadata", tryPlay, { once: true });
    });

    return () => {
      cancelled = true;
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("error", onNativeError);
      try {
        hls?.destroy();
      } catch {
        /* ignore */
      }
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        /* ignore */
      }
    };
  }, [src, autoPlay, retryTick]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.muted = isMuted;
  }, [isMuted]);

  if (!src) {
    return (
      <div className={`${styles.playerShell} ${className ?? ""}`}>
        <div className={styles.playerEmpty}>Sin stream disponible</div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.playerShell} ${compact ? styles.playerCompact : ""} ${className ?? ""}`}
      data-phase={phase}
    >
      <video
        ref={videoRef}
        controls={!compact}
        playsInline
        muted={isMuted}
        autoPlay={autoPlay}
        poster={poster}
        className={styles.playerVideo}
      />
      {showLiveBadge && phase === "playing" && (
        <span className={styles.playerLiveBadge} data-compact={compact ? "1" : undefined} aria-live="polite">
          <span className={styles.playerLiveDot} />
          {compact ? "LIVE" : "EN VIVO"}
        </span>
      )}
      {phase === "loading" && (
        <div className={styles.playerOverlay} aria-busy="true">
          <div className={styles.playerSpinner} />
          {!compact && <span>Conectando…</span>}
        </div>
      )}
      {phase === "paused" && (
        <button
          type="button"
          className={styles.playerPlayCue}
          onClick={(e) => {
            e.stopPropagation();
            const v = videoRef.current;
            if (!v) return;
            void v.play().then(() => setPhase("playing")).catch(() => undefined);
          }}
          aria-label="Reproducir"
        >
          <span className={styles.playerPlayIcon} />
        </button>
      )}
      {phase === "error" && (
        <div className={styles.playerOverlay} data-tone="error">
          <span>{errMsg || "Error"}</span>
          <button
            type="button"
            className={styles.segBtn}
            style={{ pointerEvents: "auto", marginTop: 8 }}
            onClick={() => {
              setErrMsg(null);
              setPhase("loading");
              setRetryTick((n) => n + 1);
            }}
          >
            Reintentar
          </button>
        </div>
      )}
      {!compact && (
        <button
          type="button"
          className={styles.playerMuteBtn}
          onClick={() => setIsMuted((m) => !m)}
          aria-label={isMuted ? "Activar sonido" : "Silenciar"}
          title={isMuted ? "Activar sonido" : "Silenciar"}
        >
          {isMuted ? "🔇" : "🔊"}
        </button>
      )}
    </div>
  );
}
