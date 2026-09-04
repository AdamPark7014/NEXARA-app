"use client";

import { useCallback, useEffect, useState } from "react";
import { IgBtn } from "./_Console";
import { integraApi } from "./_lib";
import styles from "./integra.module.css";

/**
 * Mando de la domo.
 *
 * Se manda `momentary`, que lleva la parada dentro: la cámara se mueve el rato
 * pedido y se detiene sola. Con el modo continuo, si se cae la red entre el
 * «muévete» y el «para», la domo se queda girando contra el tope.
 *
 * Por eso el pad es a pulsaciones y no a arrastrar: cada clic es una orden
 * cerrada que el equipo sabe terminar por su cuenta.
 */

type Preset = { id: number; name: string };

const STEP = 45;
const STEP_MS = 420;

export function IntegraPtzPad({
  cameraId,
  canControl,
}: {
  cameraId: string;
  canControl: boolean;
}) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const send = useCallback(
    async (body: Record<string, unknown>) => {
      if (!canControl) {
        setError("Sin permiso para mover cámaras");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await integraApi(`integra/cameras/${encodeURIComponent(cameraId)}/ptz`, {
          method: "POST",
          body: JSON.stringify(body),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al mover");
      } finally {
        setBusy(false);
      }
    },
    [cameraId, canControl],
  );

  const move = (pan: number, tilt: number) =>
    void send({ pan, tilt, durationMs: STEP_MS });

  return (
    <div className={styles.ptzPad}>
      <div className={styles.ptzGrid}>
        <span />
        <IgBtn disabled={busy} onClick={() => move(0, STEP)} title="Arriba">↑</IgBtn>
        <span />
        <IgBtn disabled={busy} onClick={() => move(-STEP, 0)} title="Izquierda">←</IgBtn>
        <IgBtn disabled={busy} onClick={() => void send({ stop: true })} title="Parar">■</IgBtn>
        <IgBtn disabled={busy} onClick={() => move(STEP, 0)} title="Derecha">→</IgBtn>
        <span />
        <IgBtn disabled={busy} onClick={() => move(0, -STEP)} title="Abajo">↓</IgBtn>
        <span />
      </div>
      <div className={styles.ptzZoom}>
        <IgBtn disabled={busy} onClick={() => void send({ zoom: STEP, durationMs: STEP_MS })}>
          Zoom +
        </IgBtn>
        <IgBtn disabled={busy} onClick={() => void send({ zoom: -STEP, durationMs: STEP_MS })}>
          Zoom −
        </IgBtn>
      </div>
      {presets.length > 0 && (
        <label className={styles.ptzPresets}>
          <span>Ir a</span>
          <select
            defaultValue=""
            disabled={busy}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n > 0) void send({ preset: n });
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
    </div>
  );
}
