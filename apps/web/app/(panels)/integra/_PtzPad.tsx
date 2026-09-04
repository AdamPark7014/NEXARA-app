"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { IgBtn } from "./_Console";
import { integraApi } from "./_lib";
import styles from "./integra.module.css";

/**
 * Mando de la domo — hold-to-move.
 *
 * Cada ráfaga es `momentary` (la parada va dentro). Mientras se mantiene el
 * dedo se reenvía; al soltar —o al salir de la pestaña— se manda `stop` para
 * que la domo no quede atrapada si la última ráfaga no llegó a caducar.
 */

type Preset = { id: number; name: string };

const HOLD_MS = 320;
const HOLD_SPEED = 55;

export function IntegraPtzPad({
  cameraId,
  canControl,
}: {
  cameraId: string;
  canControl: boolean;
}) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [busy, setBusy] = useState(false);
  const [holding, setHolding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const holdTimer = useRef<number | null>(null);
  const axesRef = useRef<{ pan: number; tilt: number; zoom: number } | null>(null);
  const cameraIdRef = useRef(cameraId);
  cameraIdRef.current = cameraId;

  useEffect(() => {
    let stop = false;
    setPresets([]);
    void integraApi<{ items: Preset[] }>(
      `integra/cameras/${encodeURIComponent(cameraId)}/ptz/presets`,
    )
      .then((r) => {
        if (!stop) setPresets(r.items || []);
      })
      .catch(() => {
        // Una domo sin posiciones guardadas no es un fallo.
      });
    return () => {
      stop = true;
    };
  }, [cameraId]);

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      await integraApi(`integra/cameras/${encodeURIComponent(cameraIdRef.current)}/ptz`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    [],
  );

  const stopHold = useCallback(() => {
    if (holdTimer.current != null) {
      window.clearInterval(holdTimer.current);
      holdTimer.current = null;
    }
    const wasHolding = axesRef.current != null;
    axesRef.current = null;
    setHolding(false);
    if (!wasHolding) return;
    void post({ stop: true }).catch(() => undefined);
  }, [post]);

  const burst = useCallback(async () => {
    const ax = axesRef.current;
    if (!ax) return;
    try {
      await post({
        pan: ax.pan,
        tilt: ax.tilt,
        zoom: ax.zoom,
        durationMs: HOLD_MS,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al mover");
      stopHold();
    }
  }, [post, stopHold]);

  const startHold = useCallback(
    (pan: number, tilt: number, zoom: number) => {
      if (!canControl) {
        setError("Sin permiso para mover cámaras");
        return;
      }
      stopHold();
      setError(null);
      axesRef.current = { pan, tilt, zoom };
      setHolding(true);
      void burst();
      holdTimer.current = window.setInterval(() => void burst(), HOLD_MS - 40);
    },
    [burst, canControl, stopHold],
  );

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") stopHold();
    };
    const onBlur = () => stopHold();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      stopHold();
    };
  }, [stopHold]);

  useEffect(() => {
    stopHold();
  }, [cameraId, stopHold]);

  const sendOnce = useCallback(
    async (body: Record<string, unknown>) => {
      if (!canControl) {
        setError("Sin permiso para mover cámaras");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await post(body);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al mover");
      } finally {
        setBusy(false);
      }
    },
    [canControl, post],
  );

  const bindHold = (pan: number, tilt: number, zoom: number) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      startHold(pan, tilt, zoom);
    },
    onPointerUp: () => stopHold(),
    onPointerCancel: () => stopHold(),
    onLostPointerCapture: () => stopHold(),
  });

  return (
    <div className={styles.ptzPad} data-holding={holding ? "1" : undefined}>
      <header className={styles.ptzHud}>
        <strong>PTZ</strong>
        <span>{holding ? "moviendo…" : "mantener para mover"}</span>
      </header>
      <div className={styles.ptzGrid}>
        <span />
        <button
          type="button"
          className={styles.ptzKey}
          disabled={!canControl || busy}
          title="Arriba"
          {...bindHold(0, HOLD_SPEED, 0)}
        >
          ↑
        </button>
        <span />
        <button
          type="button"
          className={styles.ptzKey}
          disabled={!canControl || busy}
          title="Izquierda"
          {...bindHold(-HOLD_SPEED, 0, 0)}
        >
          ←
        </button>
        <button
          type="button"
          className={styles.ptzKey}
          data-stop="1"
          disabled={!canControl || busy}
          title="Parar / Home"
          onClick={() => void sendOnce({ stop: true })}
        >
          ■
        </button>
        <button
          type="button"
          className={styles.ptzKey}
          disabled={!canControl || busy}
          title="Derecha"
          {...bindHold(HOLD_SPEED, 0, 0)}
        >
          →
        </button>
        <span />
        <button
          type="button"
          className={styles.ptzKey}
          disabled={!canControl || busy}
          title="Abajo"
          {...bindHold(0, -HOLD_SPEED, 0)}
        >
          ↓
        </button>
        <span />
      </div>
      <div className={styles.ptzZoom}>
        <button
          type="button"
          className={styles.ptzKey}
          disabled={!canControl || busy}
          title="Zoom +"
          {...bindHold(0, 0, HOLD_SPEED)}
        >
          Zoom +
        </button>
        <button
          type="button"
          className={styles.ptzKey}
          disabled={!canControl || busy}
          title="Zoom −"
          {...bindHold(0, 0, -HOLD_SPEED)}
        >
          Zoom −
        </button>
      </div>
      {presets.length > 0 && (
        <label className={styles.ptzPresets}>
          <span>Ir a</span>
          <select
            defaultValue=""
            disabled={busy || holding || !canControl}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n > 0) void sendOnce({ preset: n });
              e.target.value = "";
            }}
          >
            <option value="">Posición guardada…</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {!canControl && (
        <p className={styles.ptzHint}>Modo consulta: esta cuenta no puede mover la cámara.</p>
      )}
      {error && <p className={styles.ptzHint} data-tone="error">{error}</p>}
      {canControl && (
        <IgBtn disabled={busy || holding} onClick={() => void sendOnce({ stop: true })}>
          Stop
        </IgBtn>
      )}
    </div>
  );
}
