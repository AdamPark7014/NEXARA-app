"use client";

import { memo, useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import wall from "./_wall.module.css";

/**
 * Línea de tiempo de grabación.
 *
 * Lo que hay detrás, comprobado en `integra-media.service.ts`
 * (`playbackIsapi`): `POST integra/cameras/:id/playback` hace un
 * `ContentMgmt/search` contra el NVR y devuelve como mucho 40 coincidencias con
 * `startTime`, `endTime`, `name` y `size`. NO devuelve densidad de grabación,
 * ni mapa de movimiento, ni velocidad de reproducción — el DTO solo acepta
 * `beginTime`, `endTime` y `segmentIndex`.
 *
 * Así que esta línea pinta exactamente eso: las franjas que el grabador dice
 * tener, dentro del rango pedido. Los huecos son huecos de verdad, no una
 * estimación. Rascar re-pide el rango desde el instante marcado, que es el
 * único «seek» que el backend permite.
 */

export type PlaybackTimelineSegment = {
  startTime?: string | null;
  endTime?: string | null;
  name?: string | null;
};

type Props = {
  segments: PlaybackTimelineSegment[];
  activeIndex: number;
  /** Extremos del rango consultado, en ms epoch. */
  rangeStartMs: number;
  rangeEndMs: number;
  busy: boolean;
  onPickSegment: (index: number) => void;
  /** Rascar: repetir la búsqueda desde este instante hasta el fin del rango. */
  onSeek: (atMs: number) => void;
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function msOf(iso?: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function hhmm(ms: number): string {
  return new Date(ms).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function full(ms: number): string {
  return new Date(ms).toLocaleString("es-MX", { hour12: false });
}

export const PlaybackTimeline = memo(function PlaybackTimeline({
  segments,
  activeIndex,
  rangeStartMs,
  rangeEndMs,
  busy,
  onPickSegment,
  onSeek,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const [headMs, setHeadMs] = useState<number | null>(null);

  const span = Math.max(1, rangeEndMs - rangeStartMs);

  /** Franjas normalizadas a porcentaje del rango, recortadas a los extremos. */
  const bands = useMemo(() => {
    const out: Array<{ index: number; leftPct: number; widthPct: number; from: number; to: number }> = [];
    segments.forEach((seg, index) => {
      const from = msOf(seg.startTime);
      const to = msOf(seg.endTime);
      if (from == null || to == null || to <= from) return;
      const a = clamp(from, rangeStartMs, rangeEndMs);
      const b = clamp(to, rangeStartMs, rangeEndMs);
      if (b <= a) return;
      out.push({
        index,
        leftPct: ((a - rangeStartMs) / span) * 100,
        widthPct: Math.max(0.35, ((b - a) / span) * 100),
        from,
        to,
      });
    });
    return out;
  }, [segments, rangeStartMs, rangeEndMs, span]);

  /** Rótulos horarios: seis como mucho, redondeados a la hora si cabe. */
  const ticks = useMemo(() => {
    const count = 5;
    const out: Array<{ pct: number; label: string }> = [];
    for (let i = 0; i <= count; i += 1) {
      const at = rangeStartMs + (span * i) / count;
      out.push({ pct: (i / count) * 100, label: hhmm(at) });
    }
    return out;
  }, [rangeStartMs, span]);

  const recordedMs = useMemo(
    () => bands.reduce((acc, b) => acc + (Math.min(b.to, rangeEndMs) - Math.max(b.from, rangeStartMs)), 0),
    [bands, rangeStartMs, rangeEndMs],
  );

  const msFromClientX = useCallback(
    (clientX: number): number => {
      const el = trackRef.current;
      if (!el) return rangeStartMs;
      const r = el.getBoundingClientRect();
      const pct = r.width > 0 ? clamp((clientX - r.left) / r.width, 0, 1) : 0;
      return Math.round(rangeStartMs + pct * span);
    },
    [rangeStartMs, span],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (busy || bands.length === 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      draggingRef.current = true;
      setHeadMs(msFromClientX(e.clientX));
    },
    [busy, bands.length, msFromClientX],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      // Solo mueve la cabeza local; nada fuera de este componente se entera
      // hasta soltar, así que rascar no re-renderiza el muro ni el foco.
      setHeadMs(msFromClientX(e.clientX));
    },
    [msFromClientX],
  );

  const commit = useCallback(
    (at: number | null) => {
      draggingRef.current = false;
      if (at == null) return;
      onSeek(at);
    },
    [onSeek],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      const at = msFromClientX(e.clientX);
      setHeadMs(at);
      commit(at);
    },
    [commit, msFromClientX],
  );

  const activeBand = bands.find((b) => b.index === activeIndex) || null;
  const headPos = headMs ?? (activeBand ? Math.max(activeBand.from, rangeStartMs) : null);
  const headPct = headPos != null ? clamp(((headPos - rangeStartMs) / span) * 100, 0, 100) : null;

  return (
    <div className={wall.timeline}>
      <div className={wall.timelineHead}>
        <span>
          {full(rangeStartMs)} → {full(rangeEndMs)}
        </span>
        <span className={wall.timelineNow}>
          {headPos != null ? full(headPos) : "—"}
        </span>
      </div>

      <div
        ref={trackRef}
        className={wall.timelineTrack}
        data-empty={bands.length === 0 ? "1" : undefined}
        role="slider"
        tabIndex={0}
        aria-label="Línea de tiempo de grabación"
        aria-valuemin={rangeStartMs}
        aria-valuemax={rangeEndMs}
        aria-valuenow={headPos ?? rangeStartMs}
        aria-valuetext={headPos != null ? full(headPos) : "sin posición"}
        aria-disabled={bands.length === 0 || busy}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
        onKeyDown={(e) => {
          if (bands.length === 0 || busy) return;
          const base = headPos ?? rangeStartMs;
          const step = e.shiftKey ? 600_000 : 60_000;
          // Con la línea enfocada, las flechas rascan; no deben además mover
          // la selección del muro ni hacer scroll.
          if (["ArrowLeft", "ArrowRight", "Home", "End", "Enter"].includes(e.key)) {
            e.stopPropagation();
          }
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            setHeadMs(clamp(base - step, rangeStartMs, rangeEndMs));
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            setHeadMs(clamp(base + step, rangeStartMs, rangeEndMs));
          } else if (e.key === "Home") {
            e.preventDefault();
            setHeadMs(rangeStartMs);
          } else if (e.key === "End") {
            e.preventDefault();
            setHeadMs(rangeEndMs);
          } else if (e.key === "Enter") {
            e.preventDefault();
            onSeek(base);
          }
        }}
      >
        {bands.map((b) => (
          <button
            key={`${b.index}-${b.from}`}
            type="button"
            className={wall.timelineSeg}
            data-active={b.index === activeIndex ? "1" : undefined}
            style={{ left: `${b.leftPct}%`, width: `${b.widthPct}%` }}
            title={`Segmento ${b.index + 1}: ${full(b.from)} → ${full(b.to)}`}
            aria-label={`Reproducir segmento ${b.index + 1} de ${bands.length}, ${full(b.from)} a ${full(b.to)}`}
            disabled={busy}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onPickSegment(b.index);
            }}
          />
        ))}

        {bands.map((b) => (
          <span key={`mark-${b.index}-${b.from}`} className={wall.timelineMark} style={{ left: `${b.leftPct}%` }} />
        ))}

        {headPct != null && <span className={wall.timelineHead2} style={{ left: `${headPct}%` }} />}

        {bands.length === 0 && (
          <span className={wall.timelineEmpty}>
            {busy ? "Consultando el grabador…" : "El NVR no reporta grabación en este rango"}
          </span>
        )}

        <span className={wall.timelineTicks} aria-hidden="true">
          {ticks.map((t) => (
            <span key={t.pct} className={wall.timelineTick} style={{ left: `${t.pct}%` }}>
              {t.label}
            </span>
          ))}
        </span>
      </div>

      <div className={wall.timelineFoot}>
        <span>
          {bands.length} segmento{bands.length === 1 ? "" : "s"} ·{" "}
          {Math.round(recordedMs / 60000)} min grabados de{" "}
          {Math.round(span / 60000)} min del rango
        </span>
        <span>· Rasca o pulsa una franja para saltar ahí</span>
      </div>
    </div>
  );
});
