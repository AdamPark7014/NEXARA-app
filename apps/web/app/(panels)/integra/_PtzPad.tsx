"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import StopIcon from "@mui/icons-material/Stop";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import { IgBtn } from "./_Console";
import { integraApi } from "./_lib";
import styles from "./integra.module.css";
import wall from "./_wall.module.css";

/**
 * Mando de la domo — hold-to-move en modo continuo.
 *
 * Una sola orden `continuous` al pulsar (velocidad alta) y `stop` al soltar.
 * Antes se reenviaba `momentary` cada ~280 ms y cada RTT Tailscale se sumaba
 * al retardo percibido.
 *
 * Sobre las posiciones guardadas: la API expone `GET …/ptz/presets` (listar) y
 * `POST …/ptz {preset}` (ir a). NO hay endpoint para CREAR ni renombrar una
 * posición — `PtzMoveDto` solo admite pan/tilt/zoom/durationMs/continuous/
 * preset/stop, y `integra-media.service.ts` no llama a ningún `ptzSetPreset`.
 * Por eso aquí se listan y se va a ellas, pero no se ofrece «guardar aquí»:
 * sería un botón que no puede funcionar.
 */

type Preset = { id: number; name: string };

/** -100..100. Velocidad del hold; el operador la ajusta y se recuerda. */
const DEFAULT_SPEED = 92;
const SPEED_KEY = "nexara_integra_ptz_speed";

function readSpeed(): number {
  if (typeof window === "undefined") return DEFAULT_SPEED;
  const n = Number(window.localStorage.getItem(SPEED_KEY));
  return Number.isFinite(n) && n >= 10 && n <= 100 ? Math.round(n) : DEFAULT_SPEED;
}

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
  const [speed, setSpeed] = useState<number>(DEFAULT_SPEED);
  const [presetsState, setPresetsState] = useState<"loading" | "ok" | "none" | "error">("loading");
  const axesRef = useRef<{ pan: number; tilt: number; zoom: number } | null>(null);
  const cameraIdRef = useRef(cameraId);
  cameraIdRef.current = cameraId;
  const seqRef = useRef(0);
  /** Tecla que mantiene el movimiento; evita reenviar en cada autorrepetición. */
  const heldKeyRef = useRef<string | null>(null);

  // La velocidad se lee tras montar: en SSR no hay `localStorage` y leerla en
  // el inicializador desincroniza la hidratación.
  useEffect(() => {
    setSpeed(readSpeed());
  }, []);

  useEffect(() => {
    let stop = false;
    setPresets([]);
    setPresetsState("loading");
    void integraApi<{ items: Preset[] }>(
      `integra/cameras/${encodeURIComponent(cameraId)}/ptz/presets`,
    )
      .then((r) => {
        if (stop) return;
        const items = r.items || [];
        setPresets(items);
        setPresetsState(items.length ? "ok" : "none");
      })
      .catch(() => {
        // Una domo sin posiciones guardadas no es un fallo, pero tampoco es lo
        // mismo que no poder preguntar: se distingue en pantalla.
        if (!stop) setPresetsState("error");
      });
    return () => {
      stop = true;
    };
  }, [cameraId]);

  const post = useCallback(async (body: Record<string, unknown>) => {
    await integraApi(`integra/cameras/${encodeURIComponent(cameraIdRef.current)}/ptz`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }, []);

  const stopHold = useCallback(() => {
    const wasHolding = axesRef.current != null;
    axesRef.current = null;
    setHolding(false);
    if (!wasHolding) return;
    const seq = ++seqRef.current;
    void post({ stop: true }).catch(() => {
      if (seq === seqRef.current) setError("No se pudo parar la domo");
    });
  }, [post]);

  const startHold = useCallback(
    (pan: number, tilt: number, zoom: number) => {
      if (!canControl) {
        setError("Sin permiso para mover cámaras");
        return;
      }
      setError(null);
      axesRef.current = { pan, tilt, zoom };
      setHolding(true);
      const seq = ++seqRef.current;
      // Fire-and-forget: no esperar el PUT para sentir el hold.
      void post({ pan, tilt, zoom, continuous: true }).catch((e) => {
        if (seq !== seqRef.current) return;
        setError(e instanceof Error ? e.message : "Error al mover");
        axesRef.current = null;
        setHolding(false);
      });
    },
    [canControl, post],
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

  /**
   * Mando por teclado con el pad enfocado. Mismo contrato que el ratón: una
   * orden `continuous` al bajar la tecla y `stop` al soltarla, y la
   * autorrepetición del sistema (`e.repeat`) se ignora para no inundar la domo.
   */
  const KEY_AXES: Record<string, [number, number, number]> = {
    ArrowUp: [0, 1, 0],
    ArrowDown: [0, -1, 0],
    ArrowLeft: [-1, 0, 0],
    ArrowRight: [1, 0, 0],
    "+": [0, 0, 1],
    "=": [0, 0, 1],
    "-": [0, 0, -1],
    _: [0, 0, -1],
  };

  const onPadKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" || e.key === " " || e.key === "Spacebar") {
      if (heldKeyRef.current) {
        e.preventDefault();
        e.stopPropagation();
        heldKeyRef.current = null;
        stopHold();
      }
      return;
    }
    const axes = KEY_AXES[e.key];
    if (!axes) return;
    // Se atrapa aquí para que las flechas no muevan además la selección del
    // muro ni hagan scroll de la página.
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat || heldKeyRef.current === e.key) return;
    heldKeyRef.current = e.key;
    startHold(axes[0] * speed, axes[1] * speed, axes[2] * speed);
  };

  const onPadKeyUp = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (heldKeyRef.current !== e.key) return;
    e.preventDefault();
    e.stopPropagation();
    heldKeyRef.current = null;
    stopHold();
  };

  return (
    <div
      className={`${styles.ptzPad} ${wall.ptzFocusRing}`}
      data-holding={holding ? "1" : undefined}
      data-chrome="top"
      role="group"
      aria-label="Mando PTZ"
      tabIndex={canControl ? 0 : -1}
      onKeyDown={onPadKeyDown}
      onKeyUp={onPadKeyUp}
      onBlur={() => {
        if (heldKeyRef.current) {
          heldKeyRef.current = null;
          stopHold();
        }
      }}
    >
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
          title="Arriba (↑)"
          aria-label="Mover arriba"
          {...bindHold(0, speed, 0)}
        >
          <ArrowUpwardIcon sx={{ fontSize: 17 }} />
        </button>
        <span />
        <button
          type="button"
          className={styles.ptzKey}
          disabled={!canControl || busy}
          title="Izquierda (←)"
          aria-label="Mover a la izquierda"
          {...bindHold(-speed, 0, 0)}
        >
          <ArrowBackIcon sx={{ fontSize: 17 }} />
        </button>
        <button
          type="button"
          className={styles.ptzKey}
          data-stop="1"
          disabled={!canControl || busy}
          title="Parar / Home"
          aria-label="Parar la domo"
          onClick={() => void sendOnce({ stop: true })}
        >
          <StopIcon sx={{ fontSize: 17 }} />
        </button>
        <button
          type="button"
          className={styles.ptzKey}
          disabled={!canControl || busy}
          title="Derecha (→)"
          aria-label="Mover a la derecha"
          {...bindHold(speed, 0, 0)}
        >
          <ArrowForwardIcon sx={{ fontSize: 17 }} />
        </button>
        <span />
        <button
          type="button"
          className={styles.ptzKey}
          disabled={!canControl || busy}
          title="Abajo (↓)"
          aria-label="Mover abajo"
          {...bindHold(0, -speed, 0)}
        >
          <ArrowDownwardIcon sx={{ fontSize: 17 }} />
        </button>
        <span />
      </div>
      <div className={styles.ptzZoom}>
        <button
          type="button"
          className={styles.ptzKey}
          disabled={!canControl || busy}
          title="Zoom + (tecla +)"
          aria-label="Acercar"
          {...bindHold(0, 0, speed)}
        >
          <ZoomInIcon sx={{ fontSize: 16 }} /> Zoom +
        </button>
        <button
          type="button"
          className={styles.ptzKey}
          disabled={!canControl || busy}
          title="Zoom − (tecla −)"
          aria-label="Alejar"
          {...bindHold(0, 0, -speed)}
        >
          <ZoomOutIcon sx={{ fontSize: 16 }} /> Zoom −
        </button>
      </div>
      <div className={wall.ptzSpeed}>
        <label className={wall.ptzSpeedRow} htmlFor="ptz-speed">
          <span>Velocidad</span>
          <input
            id="ptz-speed"
            type="range"
            min={10}
            max={100}
            step={2}
            value={speed}
            disabled={!canControl}
            onChange={(e) => {
              const n = Number(e.target.value);
              setSpeed(n);
              try {
                window.localStorage.setItem(SPEED_KEY, String(n));
              } catch {
                /* sin persistencia, pero el mando sigue */
              }
            }}
          />
          <span className={wall.ptzSpeedVal}>{speed}%</span>
        </label>
        <p className={wall.ptzKeyHint}>
          Con el mando enfocado: flechas para mover, + y − para el zoom, Esc para
          parar. Se aplica esta velocidad.
        </p>
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
                {p.name || `Preset ${p.id}`}
              </option>
            ))}
          </select>
        </label>
      )}
      {presetsState === "none" && (
        <p className={styles.ptzHint}>
          Esta domo no tiene posiciones memorizadas. Se graban en el propio
          equipo o el NVR: la API de la consola solo sabe listarlas e ir a
          ellas, no crearlas.
        </p>
      )}
      {presetsState === "error" && (
        <p className={styles.ptzHint} data-tone="error">
          No se pudieron leer las posiciones memorizadas de esta domo.
        </p>
      )}
      {!canControl && (
        <p className={styles.ptzHint}>Modo consulta: esta cuenta no puede mover la cámara.</p>
      )}
      {error && (
        <p className={styles.ptzHint} data-tone="error">
          {error}
        </p>
      )}
      {canControl && (
        <IgBtn disabled={busy || holding} onClick={() => void sendOnce({ stop: true })}>
          Stop
        </IgBtn>
      )}
    </div>
  );
}
