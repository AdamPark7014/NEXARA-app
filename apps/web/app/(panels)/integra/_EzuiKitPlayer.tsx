"use client";

import { useEffect, useRef, useState } from "react";

type StreamPayload = {
  appToken?: string;
  streamAreaDomain?: string;
  accessToken?: string;
  url?: string;
  [key: string]: unknown;
};

type Props = {
  stream: StreamPayload | null | undefined;
  cameraId?: string;
  height?: number;
};

/**
 * Player HCT vía EZUIKit CDN. Si el SDK o el token fallan, empty state claro.
 */
export function IntegraEzuiKitPlayer({ stream, cameraId, height = 280 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<{ stop?: () => void; destroy?: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !stream) return;

    let cancelled = false;
    setError(null);

    const run = async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          if ((window as any).EZUIKit) {
            resolve();
            return;
          }
          const existing = document.querySelector<HTMLScriptElement>("script[data-ezuikit]");
          if (existing) {
            existing.addEventListener("load", () => resolve());
            existing.addEventListener("error", () => reject(new Error("No se pudo cargar el player")));
            return;
          }
          const s = document.createElement("script");
          s.src = "https://open.ys7.com/sdk/js/2.0/ezuikit.js";
          s.dataset.ezuikit = "1";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("No se pudo cargar el player"));
          document.head.appendChild(s);
        });
        if (cancelled) return;

        const EZUIKit = (window as any).EZUIKit;
        if (!EZUIKit?.EZUIKitPlayer) {
          throw new Error("Player de video no disponible en este navegador");
        }

        const accessToken = String(
          stream.appToken || stream.accessToken || stream.token || "",
        );
        const url =
          stream.url != null
            ? String(stream.url)
            : cameraId
              ? `ezopen://open.ys7.com/${cameraId}/1.live`
              : "";
        if (!accessToken || !url) {
          throw new Error(
            "Token de stream incompleto — revisa la configuración del sitio",
          );
        }

        host.innerHTML = "";
        const id = `ezui-${Math.random().toString(36).slice(2)}`;
        host.id = id;
        playerRef.current = new EZUIKit.EZUIKitPlayer({
          id,
          accessToken,
          url,
          width: host.clientWidth || 480,
          height,
          template: "simple",
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error EZUIKit");
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
      try {
        playerRef.current?.stop?.();
        playerRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, [stream, cameraId, height]);

  if (!stream) {
    return (
      <div
        style={{
          height,
          display: "grid",
          placeItems: "center",
          background: "var(--surface-2, #0f172a)",
          color: "#94a3b8",
          borderRadius: 8,
          fontSize: 13,
        }}
      >
        Sin token de stream
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          height,
          display: "grid",
          placeItems: "center",
          background: "var(--surface-2, #0f172a)",
          color: "#fca5a5",
          borderRadius: 8,
          fontSize: 13,
          padding: 16,
          textAlign: "center",
        }}
      >
        {error}
        <br />
        <span style={{ color: "#94a3b8", fontSize: 12 }}>
          Revisa el dominio allowlist del player o la configuración del sitio.
        </span>
      </div>
    );
  }

  return <div ref={hostRef} style={{ width: "100%", height, borderRadius: 8, overflow: "hidden" }} />;
}
