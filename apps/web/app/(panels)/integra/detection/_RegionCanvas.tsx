"use client";

/**
 * El fotograma de la cámara con las regiones de detección encima.
 *
 * Es la pieza que faltaba: la detección se configuraba a ciegas —región =
 * fotograma entero, sensibilidad al máximo— porque nunca ha habido dónde
 * verla. Aquí el operador ve la escena real y dibuja sobre ella.
 *
 * De dónde sale la imagen: del mismo sitio que el respaldo del reproductor.
 * `_LivePlayer.tsx` deriva `…/api/frame.jpeg?src=<nombre>` del HLS que da la
 * API (`parseHls`), y esa derivación es la que se repite aquí —a propósito, en
 * diez líneas y con este comentario— para no acoplar esta pantalla a un
 * archivo que otro agente está tocando. La ruta es la suya; no se inventa.
 *
 * Las regiones se identifican por su posición en el array porque así las
 * guarda el servidor: `NormalizedRegion[]`, sin ids.
 */

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import {
  addPointAfter,
  centroid,
  movePoint,
  polygonPoints,
  removePoint,
  toNormalized,
} from "./_regionGeometry";
import { MAX_POINTS, MIN_POINTS, type DetectionRegion } from "./_tuningApi";
import css from "./_tuning.module.css";

/**
 * Espera mínima entre fotogramas, ya recibido el anterior. Igual que en el
 * respaldo del reproductor: cada JPEG abre su sesión RTSP y espera keyframe,
 * así que pedirlos por reloj fijo solo genera peticiones abortadas.
 */
const FRAME_MIN_GAP_MS = 1200;

/** Paso del teclado sobre un vértice (0..1). Con Mayús, cinco veces más. */
const KEY_STEP = 0.005;

type Parsed = { base: string; name: string };

/** Misma derivación que `parseHls` en `_LivePlayer.tsx`. */
export function parseHlsSrc(src: string): Parsed | null {
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

type Drag = { region: number; point: number; pointerId: number };

export function RegionCanvas({
  hls,
  regions,
  activeIndex,
  onChange,
  onActivate,
  disabled = false,
  emptyHint,
}: {
  /** HLS que devolvió `POST integra/cameras/:id/stream`. Sin él no hay cuadro. */
  hls: string | null;
  regions: DetectionRegion[];
  activeIndex: number | null;
  onChange: (regions: DetectionRegion[]) => void;
  onActivate: (index: number) => void;
  /** El servidor no admite cambios: se ve la escena, no se edita. */
  disabled?: boolean;
  /** Qué decir cuando no hay cuadro que enseñar. */
  emptyHint?: string;
}) {
  const parsed = hls ? parseHlsSrc(hls) : null;
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const nextRef = useRef<number | null>(null);
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  /**
   * Proporción real del cuadro. Hasta conocerla se usa 16:9; en cuanto llega
   * el primer fotograma la caja se ajusta a la imagen y las coordenadas 0..1
   * del operador coinciden con las que se guardan.
   */
  const [aspect, setAspect] = useState<number | null>(null);

  useEffect(() => {
    // Cambió la cámara: fuera el estado del cuadro anterior.
    setFailed(false);
    setAspect(null);
    setTick((t) => t + 1);
    return () => {
      if (nextRef.current != null) window.clearTimeout(nextRef.current);
      nextRef.current = null;
    };
  }, [hls]);

  const scheduleNext = () => {
    if (paused || !parsed) return;
    if (nextRef.current != null) window.clearTimeout(nextRef.current);
    nextRef.current = window.setTimeout(() => {
      nextRef.current = null;
      setTick((t) => t + 1);
    }, FRAME_MIN_GAP_MS);
  };

  const frameUrl = parsed
    ? `${parsed.base}/api/frame.jpeg?src=${encodeURIComponent(parsed.name)}&t=${tick}`
    : null;

  /* ── Arrastre de vértices ────────────────────────────────────────── */

  const replaceRegion = (index: number, region: DetectionRegion) => {
    const next = regions.slice();
    next[index] = region;
    onChange(next);
  };

  const applyPoint = (ri: number, pi: number, clientX: number, clientY: number) => {
    const el = svgRef.current;
    if (!el) return;
    const region = regions[ri];
    if (!region) return;
    const p = toNormalized(clientX, clientY, el.getBoundingClientRect());
    const moved = movePoint(region, pi, p);
    if (moved === region) return;
    replaceRegion(ri, moved);
  };

  const startDrag = (e: ReactPointerEvent<SVGElement>, ri: number, pi: number) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    onActivate(ri);
    dragRef.current = { region: ri, point: pi, pointerId: e.pointerId };
    setDragging(`${ri}-${pi}`);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    e.preventDefault();
    applyPoint(d.region, d.point, e.clientX, e.clientY);
  };

  const endDrag = (e: ReactPointerEvent<SVGElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  /* ── Teclado: mover, partir y borrar vértices sin ratón ──────────── */

  const onHandleKey = (e: ReactKeyboardEvent<SVGCircleElement>, ri: number, pi: number) => {
    if (disabled) return;
    const region = regions[ri];
    if (!region) return;
    const step = e.shiftKey ? KEY_STEP * 5 : KEY_STEP;
    let dx = 0;
    let dy = 0;
    if (e.key === "ArrowLeft") dx = -step;
    else if (e.key === "ArrowRight") dx = step;
    else if (e.key === "ArrowUp") dy = -step;
    else if (e.key === "ArrowDown") dy = step;
    else if (e.key === "Delete" || e.key === "Backspace") {
      if (region.length <= MIN_POINTS) return;
      e.preventDefault();
      replaceRegion(ri, removePoint(region, pi));
      return;
    } else if (e.key === "+" || e.key === "Insert") {
      if (region.length >= MAX_POINTS) return;
      e.preventDefault();
      replaceRegion(ri, addPointAfter(region, pi));
      return;
    } else return;
    e.preventDefault();
    const p = region[pi];
    replaceRegion(ri, movePoint(region, pi, { x: p.x + dx, y: p.y + dy }));
  };

  const splitEdge = (ri: number, pi: number) => {
    if (disabled) return;
    const region = regions[ri];
    if (!region || region.length >= MAX_POINTS) return;
    replaceRegion(ri, addPointAfter(region, pi));
  };

  /**
   * Proporción con la que se dibuja: la real de la imagen si ya se conoce, y
   * 16:9 mientras no. El recuadro y el viewBox usan la misma, así que el SVG
   * cubre el cuadro sin deformarse — un vértice se ve redondo y la etiqueta de
   * la región no sale estirada.
   */
  const ar = aspect && aspect > 0 ? aspect : 16 / 9;
  const vbW = 100 * ar;

  return (
    <div className={css.stage} style={{ aspectRatio: String(ar) }}>
      {frameUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={css.frame}
          src={frameUrl}
          alt=""
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              const next = img.naturalWidth / img.naturalHeight;
              setAspect((prev) => (prev != null && Math.abs(prev - next) < 0.01 ? prev : next));
            }
            setFailed(false);
            scheduleNext();
          }}
          onError={() => {
            // Un fotograma perdido no apaga la pantalla: se reintenta. Solo se
            // declara sin cuadro si nunca llegó ninguno.
            if (aspect == null) setFailed(true);
            scheduleNext();
          }}
        />
      ) : null}

      {!parsed || failed ? (
        <div className={css.stageMsg}>
          <VideocamOffIcon fontSize="small" aria-hidden />
          <strong>Sin fotograma de esta cámara</strong>
          <span>
            {emptyHint ??
              "El servidor no devolvió flujo para este equipo. Las regiones se pueden ajustar igualmente, pero a ciegas."}
          </span>
        </div>
      ) : null}

      <svg
        ref={svgRef}
        className={css.canvas}
        viewBox={`0 0 ${vbW.toFixed(3)} 100`}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {regions.map((region, ri) => {
          const active = ri === activeIndex;
          const c = centroid(region);
          return (
            <g key={`region-${ri}`}>
              <polygon
                className={css.regionShape}
                data-active={active ? "1" : "0"}
                points={polygonPoints(region, ar)}
                onPointerDown={() => onActivate(ri)}
              />
              <text className={css.regionLabel} x={c.x * 100 * ar} y={c.y * 100}>
                {`R${ri + 1}`}
              </text>
              {/* Puntos medios de cada lado: pulsarlos añade un vértice ahí. */}
              {!disabled && active && region.length < MAX_POINTS
                ? region.map((p, pi) => {
                    const q = region[(pi + 1) % region.length];
                    return (
                      <circle
                        key={`mid-${ri}-${pi}`}
                        className={css.midHandle}
                        cx={((p.x + q.x) / 2) * 100 * ar}
                        cy={((p.y + q.y) / 2) * 100}
                        r={1.1}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          splitEdge(ri, pi);
                        }}
                      >
                        <title>Añadir vértice en este lado</title>
                      </circle>
                    );
                  })
                : null}
              {region.map((p, pi) => (
                <circle
                  key={`pt-${ri}-${pi}`}
                  className={css.handle}
                  data-dragging={dragging === `${ri}-${pi}` ? "1" : undefined}
                  cx={p.x * 100 * ar}
                  cy={p.y * 100}
                  r={active ? 1.8 : 1.3}
                  tabIndex={disabled ? -1 : 0}
                  /* `button` y no `slider`: un vértice se mueve en dos ejes y
                     no tiene un valor único que anunciar. La posición va en la
                     etiqueta, que es lo que el lector lee al enfocarlo. */
                  role="button"
                  aria-label={`Región ${ri + 1}, vértice ${pi + 1}: ${Math.round(p.x * 100)} % desde la izquierda, ${Math.round(p.y * 100)} % desde arriba. Flechas para moverlo.`}
                  onPointerDown={(e) => startDrag(e, ri, pi)}
                  onKeyDown={(e) => onHandleKey(e, ri, pi)}
                />
              ))}
            </g>
          );
        })}
      </svg>

      <div className={css.stageBar}>
        <span className={css.stageChip}>
          {regions.length === 0
            ? "Sin regiones · detecta todo el cuadro"
            : `${regions.length} ${regions.length === 1 ? "región" : "regiones"}`}
        </span>
        {parsed && !failed ? (
          <button
            type="button"
            className={css.stageChip}
            data-tone={paused ? "warn" : undefined}
            style={{ pointerEvents: "auto", cursor: "pointer" }}
            onClick={() =>
              setPaused((v) => {
                const next = !v;
                if (!next) setTick((t) => t + 1);
                return next;
              })
            }
          >
            <span className={css.icon} aria-hidden>
              {paused ? <PlayArrowIcon fontSize="inherit" /> : <PauseIcon fontSize="inherit" />}
            </span>
            {paused ? "Cuadro congelado" : "En vivo"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
