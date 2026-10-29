"use client";

/**
 * Vista 3D del sitio (artboard 2 del mockup aprobado): muros a su altura real, cámaras a su altura
 * de montaje con su número, conos DORI en el piso, croquis de fondo y humanoides. Arrastrar gira,
 * Mayús + arrastrar (o clic derecho) mueve, la rueda acerca; «F» enfoca lo seleccionado.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { limitesEnMetros, type Seleccion, type TipoElemento } from "@/lib/cctv/editor";
import { VISTA_ISOMETRICA, VISTA_SUPERIOR, encuadrar, escena3D, proyector, type Vista3D } from "@/lib/cctv/escena3d";
import type { Plano, Tapa } from "@/lib/cctv/plano";
import type { PoligonoCobertura } from "@/lib/cctv/visibilidad";
import { COLOR_NIVEL, OPACIDAD_NIVEL } from "./colores";
import styles from "./editor.module.css";

type Arrastre = { modo: "girar" | "mover"; x: number; y: number; vista: Vista3D };

const ALTO = 640;
const pts = (ps: ReadonlyArray<{ x: number; y: number }>) => ps.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

/** Gris de una cara según su luz (tono 0.78–0.96) sobre el color de muro del sistema. */
function grisMuro(tono: number): string {
  const r = Math.round(206 * tono + 20);
  const g = Math.round(213 * tono + 20);
  const b = Math.round(222 * tono + 20);
  return `rgb(${Math.min(r, 250)}, ${Math.min(g, 252)}, ${Math.min(b, 255)})`;
}

export default function Lienzo3D({
  plano,
  seleccion,
  tapas,
  coberturas,
  capas,
  onSeleccionar,
}: {
  plano: Plano;
  seleccion: Seleccion | null;
  tapas: readonly Tapa[];
  coberturas: ReadonlyMap<string, PoligonoCobertura[]>;
  capas: { croquis: boolean; etiquetas: boolean; translucidos: boolean; humanoides: boolean };
  onSeleccionar: (s: Seleccion | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [ancho, setAncho] = useState(900);
  const limites = useMemo(() => limitesEnMetros(plano), [plano]);
  const k = plano.escala.metrosPorPx;
  const encuadreInicial = (orientacion: { azimutDeg: number; elevacionDeg: number }, w = ancho): Vista3D => {
    const lim = limites ?? { min: { x: 0, y: 0 }, max: { x: 20, y: 12 } };
    return { ...orientacion, ancho: w, alto: ALTO, ...encuadrar(lim, { ...orientacion, ancho: w, alto: ALTO }) };
  };
  const [vista, setVista] = useState<Vista3D>(() => encuadreInicial(VISTA_ISOMETRICA));
  const arrastre = useRef<Arrastre | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const medir = () => {
      const w = svg.getBoundingClientRect().width;
      if (w > 0) {
        setAncho(w);
        setVista((v) => ({ ...v, ancho: w }));
      }
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const rueda = (e: WheelEvent) => {
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.0015);
      setVista((v) => ({ ...v, pxPorMetro: Math.min(Math.max(v.pxPorMetro * f, 1), 400) }));
    };
    svg.addEventListener("wheel", rueda, { passive: false });
    return () => svg.removeEventListener("wheel", rueda);
  }, []);

  // «F» enfoca la cámara o el humanoide seleccionado.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.key.toLowerCase() !== "f" || !seleccion) return;
      const c = plano.camaras.find((x) => x.id === seleccion.id) ?? plano.personas.find((x) => x.id === seleccion.id);
      if (c) setVista((v) => ({ ...v, centro: { x: c.pos.x * k, y: c.pos.y * k }, pxPorMetro: Math.max(v.pxPorMetro, 28) }));
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [seleccion, plano, k]);

  const figuras = useMemo(
    () =>
      escena3D({
        plano: capas.humanoides ? plano : { ...plano, personas: [] },
        tapas,
        coberturas,
        vista,
        seleccionada: seleccion?.tipo === "camara" ? seleccion.id : null,
        limites,
      }),
    [plano, tapas, coberturas, vista, seleccion, limites, capas.humanoides],
  );
  const matriz = useMemo(() => proyector(vista).matrizPiso(k), [vista, k]);

  const alPresionar = (e: ReactPointerEvent<SVGSVGElement>) => {
    const el = (e.target as Element).closest?.("[data-sel]");
    const raw = el?.getAttribute("data-sel");
    if (raw && e.button === 0 && !e.shiftKey) {
      const [tipo, ...resto] = raw.split(":");
      onSeleccionar({ tipo: tipo as TipoElemento, id: resto.join(":") });
      return;
    }
    arrastre.current = { modo: e.button === 2 || e.shiftKey ? "mover" : "girar", x: e.clientX, y: e.clientY, vista };
    setArrastrando(true);
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const alMover = (e: ReactPointerEvent<SVGSVGElement>) => {
    const a = arrastre.current;
    if (!a) return;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    if (a.modo === "girar") {
      setVista({ ...a.vista, azimutDeg: a.vista.azimutDeg + dx * 0.35, elevacionDeg: Math.min(90, Math.max(8, a.vista.elevacionDeg + dy * 0.25)) });
    } else {
      const ang = (a.vista.azimutDeg * Math.PI) / 180;
      const se = Math.max(Math.sin((a.vista.elevacionDeg * Math.PI) / 180), 0.2);
      const mx = -dx / a.vista.pxPorMetro;
      const my = -dy / (a.vista.pxPorMetro * se);
      setVista({
        ...a.vista,
        centro: { x: a.vista.centro.x + mx * Math.cos(ang) + my * Math.sin(ang), y: a.vista.centro.y - mx * Math.sin(ang) + my * Math.cos(ang) },
      });
    }
  };
  const alSoltar = () => {
    arrastre.current = null;
    setArrastrando(false);
  };

  const selId = seleccion?.id;

  return (
    <>
      <div className={styles.controles3d}>
        <button type="button" className={styles.boton3d} onClick={() => setVista(encuadreInicial(VISTA_ISOMETRICA))}>
          Isométrica
        </button>
        <button type="button" className={styles.boton3d} onClick={() => setVista(encuadreInicial(VISTA_SUPERIOR))}>
          Vista superior
        </button>
      </div>
      <p className={styles.pista3d}>Arrastrar: girar · Mayús + arrastrar: mover · rueda: acercar · F: enfocar la selección</p>
      <svg
        ref={svgRef}
        className={styles.lienzo}
        viewBox={`0 0 ${ancho} ${ALTO}`}
        style={{ cursor: arrastrando ? "grabbing" : "grab" }}
        onPointerDown={alPresionar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
        onContextMenu={(e) => e.preventDefault()}
        role="img"
        aria-label="Vista 3D del sitio: muros a su altura, cámaras a su altura de montaje y conos de cobertura en el piso"
      >
        <defs>
          <linearGradient id="cctv-cielo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--ui-track)" />
            <stop offset="1" stopColor="var(--ui-surface-2)" />
          </linearGradient>
        </defs>
        <rect width={ancho} height={ALTO} fill="url(#cctv-cielo)" />
        {figuras.map((f, i) => {
          switch (f.tipo) {
            case "piso":
              return (
                <g key={i}>
                  <polygon points={pts(f.puntos)} fill="var(--ui-surface)" stroke="var(--ui-border-strong)" strokeWidth={1} />
                  {plano.croquis && capas.croquis ? (
                    <image
                      href={plano.croquis.url}
                      width={plano.croquis.anchoPx}
                      height={plano.croquis.altoPx}
                      transform={`matrix(${matriz.join(" ")})`}
                      opacity={plano.croquis.opacidad * 0.75}
                      preserveAspectRatio="none"
                      style={{ pointerEvents: "none", filter: plano.croquis.invertido ? "invert(1) hue-rotate(180deg)" : undefined }}
                    />
                  ) : null}
                </g>
              );
            case "cobertura":
              return (
                <polygon
                  key={i}
                  points={pts(f.puntos)}
                  fill={COLOR_NIVEL[f.nivel]}
                  fillOpacity={f.propia ? OPACIDAD_NIVEL[f.nivel] + 0.2 : OPACIDAD_NIVEL[f.nivel] + 0.06}
                  style={{ pointerEvents: "none" }}
                />
              );
            case "cara": {
              const sel = selId === f.origen;
              const relleno =
                f.material === "hoja" ? "#c9a46b" : f.material === "vidrio" ? "var(--ui-info)" : f.material === "obstaculo" ? "#b9c2cc" : f.superior ? "var(--ui-surface)" : grisMuro(f.tono);
              const opacidad = f.material === "vidrio" ? 0.22 : !f.superior && capas.translucidos && f.material === "muro" ? 0.45 : 1;
              const tipoSel = f.material === "obstaculo" ? "obstaculo" : f.material === "hoja" ? null : "muro";
              return (
                <polygon
                  key={i}
                  data-sel={tipoSel ? `${tipoSel}:${f.origen}` : undefined}
                  points={pts(f.puntos)}
                  fill={sel ? "var(--ui-brand-soft-2)" : relleno}
                  fillOpacity={opacidad}
                  stroke={sel ? "var(--ui-brand)" : "#aeb7c2"}
                  strokeOpacity={opacidad}
                  strokeWidth={sel ? 1.4 : 0.5}
                />
              );
            }
            case "persona": {
              const sel = selId === f.id;
              return (
                <g key={i} data-sel={`persona:${f.id}`}>
                  <polygon points={pts(f.anillo)} fill="none" stroke={sel ? "var(--ui-brand)" : "var(--ui-info)"} strokeWidth={2} />
                  <line x1={f.pie.x} y1={f.pie.y} x2={f.cadera.x} y2={f.cadera.y} stroke="#7d8796" strokeWidth={Math.max(f.radio * 1.6, 2)} strokeLinecap="round" />
                  <line x1={f.cadera.x} y1={f.cadera.y} x2={f.cuello.x} y2={f.cuello.y} stroke="#aab3bf" strokeWidth={Math.max(f.radio * 2.1, 2.5)} strokeLinecap="round" />
                  <circle cx={f.cabeza.x} cy={f.cabeza.y} r={Math.max(f.radio, 1.5)} fill="#2a303b" />
                </g>
              );
            }
            case "camara": {
              const sel = selId === f.id;
              return (
                <g key={i} data-sel={`camara:${f.id}`} style={{ cursor: "pointer" }}>
                  <line x1={f.montaje.x} y1={f.montaje.y} x2={f.insignia.x} y2={f.insignia.y} stroke="#14171f" strokeWidth={1} />
                  <circle cx={f.montaje.x} cy={f.montaje.y} r={3} fill="#14171f" />
                  {sel ? <circle cx={f.insignia.x} cy={f.insignia.y} r={15} fill="var(--ui-brand)" opacity={0.22} /> : null}
                  <circle cx={f.insignia.x} cy={f.insignia.y} r={10} fill={sel ? "var(--ui-brand)" : "#14171f"} stroke="#fff" strokeWidth={1.8} />
                  <text x={f.insignia.x} y={f.insignia.y + 3.8} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#fff" style={{ userSelect: "none" }}>
                    {f.numero}
                  </text>
                </g>
              );
            }
            case "etiqueta":
              return capas.etiquetas ? (
                <text key={i} x={f.pos.x} y={f.pos.y} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--ui-fg-2)" style={{ pointerEvents: "none", userSelect: "none" }}>
                  {f.texto}
                </text>
              ) : null;
          }
        })}
      </svg>
    </>
  );
}
