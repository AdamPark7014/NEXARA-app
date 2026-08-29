"use client";

import { useEffect, useRef } from "react";

type Props = {
  src: string | null;
  poster?: string;
};

/**
 * Player HTML5 + HLS.js (CDN). Safari usa HLS nativo.
 */
export function IntegraHlsPlayer({ src, poster }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let hls: { destroy: () => void } | null = null;
    let cancelled = false;

    const attach = async () => {
      const canNative = video.canPlayType("application/vnd.apple.mpegurl");
      if (canNative) {
        video.src = src;
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>("script[data-hlsjs]");
        if (existing && (window as any).Hls) {
          resolve();
          return;
        }
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";
        s.dataset.hlsjs = "1";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("No se pudo cargar HLS.js"));
        document.head.appendChild(s);
      });

      if (cancelled) return;
      const Hls = (window as any).Hls;
      if (!Hls?.isSupported()) {
        video.src = src;
        return;
      }
      const instance = new Hls({ enableWorker: true, lowLatencyMode: true });
      instance.loadSource(src);
      instance.attachMedia(video);
      hls = instance;
    };

    void attach().catch(() => {
      if (video) video.src = src;
    });

    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [src]);

  if (!src) {
    return (
      <div
        style={{
          aspectRatio: "16/9",
          background: "var(--surface-2, #0f172a)",
          color: "#94a3b8",
          display: "grid",
          placeItems: "center",
          fontSize: 13,
          borderRadius: 8,
        }}
      >
        Sin stream HLS
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      controls
      playsInline
      poster={poster}
      style={{
        width: "100%",
        aspectRatio: "16/9",
        background: "#0f172a",
        borderRadius: 8,
      }}
    />
  );
}
