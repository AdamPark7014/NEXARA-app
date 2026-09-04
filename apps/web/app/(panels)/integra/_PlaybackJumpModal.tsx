"use client";

import { useEffect, useState } from "react";
import { IgBtn, IgError } from "./_Console";
import { IntegraLivePlayer } from "./_LivePlayer";
import { integraApi, toDatetimeLocalValue } from "./_lib";

type Props = {
  open: boolean;
  cameraId: string;
  atIso: string;
  onClose: () => void;
};

/** Reproduce ±30s alrededor del evento vía playback NVR/Artemis (MSE). */
export function PlaybackJumpModal({ open, cameraId, atIso, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !cameraId || !atIso) return;
    let cancelled = false;
    const run = async () => {
      setBusy(true);
      setError(null);
      setUrl(null);
      try {
        const at = new Date(atIso);
        if (Number.isNaN(at.getTime())) throw new Error("Timestamp inválido");
        const begin = new Date(at.getTime() - 30_000);
        const end = new Date(at.getTime() + 30_000);
        const data = await integraApi<{ url?: string; hls?: string | null; note?: string }>(
          `integra/cameras/${encodeURIComponent(cameraId)}/playback`,
          {
            method: "POST",
            body: JSON.stringify({
              beginTime: begin.toISOString(),
              endTime: end.toISOString(),
            }),
          },
        );
        if (cancelled) return;
        const play = data.hls || data.url || null;
        if (!play) throw new Error(data.note || "Sin grabación en ese momento");
        setUrl(play);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Playback");
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [open, cameraId, atIso]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 85,
        background: "color-mix(in srgb, #0b1524 50%, transparent)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--surface, #fff)",
          borderRadius: 14,
          padding: 16,
          width: "min(720px, 100%)",
          display: "grid",
          gap: 10,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: 14 }}>
            Playback ±30s · {cameraId}
          </strong>
          <IgBtn onClick={onClose}>Cerrar</IgBtn>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)" }}>
          {atIso ? new Date(atIso).toLocaleString("es-MX", { hour12: false }) : "—"}
          {" · "}
          {toDatetimeLocalValue(new Date(atIso))}
        </p>
        <IgError>{error}</IgError>
        {busy && <p style={{ fontSize: 13 }}>Cargando…</p>}
        {!busy && url && <IntegraLivePlayer src={url} mode="mse" />}
        {!busy && !url && !error && (
          <p style={{ fontSize: 13 }}>No hay cámara ligada a este evento.</p>
        )}
      </div>
    </div>
  );
}
