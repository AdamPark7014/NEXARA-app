"use client";

/**
 * Recuadro «vista desde la cámara»: la escena proyectada con la óptica real de la lente, la
 * persona más cercana en su ángulo y su densidad («134 PPM · Reconocimiento · persona a 10 m»).
 */
import { useMemo, useState } from "react";
import { ETIQUETA_NIVEL, metros } from "@/lib/cctv/optica";
import { distancia, type CamaraPlano, type Plano, type Tapa } from "@/lib/cctv/plano";
import {
  ETIQUETA_ESTADO_PERSONA,
  camaraEnMetros,
  leerPersona,
  personaDeCamara,
  puntoReferencia,
  type PoligonoCobertura,
} from "@/lib/cctv/visibilidad";
import { limitesEnMetros } from "@/lib/cctv/editor";
import { puntoEtiqueta, vistaDesdeCamara, type FiguraVista } from "@/lib/cctv/vista";
import { COLOR_NIVEL, OPACIDAD_NIVEL } from "./colores";
import styles from "./editor.module.css";

const ANCHO = 640;
const ALTO = 360;

function relleno(f: FiguraVista): { fill: string; opacity?: number; stroke?: string } {
  switch (f.tipo) {
    case "terreno":
      return { fill: "var(--ui-track)" };
    case "piso":
      return { fill: "var(--ui-surface-2)" };
    case "cobertura":
      return { fill: COLOR_NIVEL[f.nivel], opacity: f.propia ? OPACIDAD_NIVEL[f.nivel] + 0.14 : OPACIDAD_NIVEL[f.nivel] * 0.55 };
    case "muro":
      return { fill: f.frente ? "#cfd6de" : "#bfc8d2", stroke: f.frente ? "#cfd6de" : "#bfc8d2" };
    case "hoja":
      return { fill: "#c9a46b", stroke: "#c9a46b" };
    case "persona":
      return { fill: "#8c96a3" };
  }
}

export default function VistaCamara({
  plano,
  camara,
  tapas,
  coberturas,
  esHoja,
}: {
  plano: Plano;
  camara: CamaraPlano;
  tapas: readonly Tapa[];
  coberturas: ReadonlyMap<string, PoligonoCobertura[]>;
  esHoja: (t: Tapa) => boolean;
}) {
  const [zoom, setZoom] = useState(1);
  const [grande, setGrande] = useState(false);
  const k = plano.escala.metrosPorPx;

  const datos = useMemo(() => {
    const cam = camaraEnMetros(camara, plano.escala);
    if (!cam) return null;
    const personas = plano.personas.map((p) => ({ ...p, posM: { x: p.pos.x * k, y: p.pos.y * k } }));
    const persona = personaDeCamara(cam, personas.map((p) => ({ id: p.id, pos: p.posM })));
    const objetivo = persona?.pos ?? puntoReferencia(cam);
    const lectura = leerPersona(cam, tapas, objetivo);
    const otras: PoligonoCobertura[] = [];
    for (const [id, pols] of coberturas) if (id !== camara.id) otras.push(...pols);
    const figuras = vistaDesdeCamara({
      cam,
      tapas,
      coberturaPropia: coberturas.get(camara.id) ?? [],
      coberturaOtras: otras,
      personas: personas.map((p) => p.posM),
      piso: limitesEnMetros(plano),
      ancho: ANCHO,
      alto: ALTO,
      esHoja,
    });
    return {
      figuras,
      lectura,
      conPersona: persona != null,
      etiqueta: persona && lectura.estado !== "oculta" ? puntoEtiqueta(cam, objetivo, ANCHO, ALTO) : null,
      distPiso: distancia(cam.pos, objetivo),
    };
  }, [camara, plano, k, tapas, coberturas, esHoja]);

  if (!datos) {
    return <div className={styles.pipVacio}>La ficha de esta cámara no trae óptica suficiente para simular su vista.</div>;
  }
  const { lectura } = datos;
  const ppmTexto = `${Math.round(lectura.ppm)} PPM · ${lectura.estado === "visible" || lectura.estado === "parcial" ? ETIQUETA_NIVEL[lectura.nivel] : ETIQUETA_ESTADO_PERSONA[lectura.estado]}`;
  const w = ANCHO / zoom;
  const h = ALTO / zoom;

  return (
    <figure className={`${styles.pip} ${grande ? styles.pipGrande : ""}`} aria-label={`Vista desde la cámara ${camara.numero}`}>
      <div className={styles.pipImagen}>
        <svg viewBox={`${(ANCHO - w) / 2} ${(ALTO - h) / 2} ${w} ${h}`} role="img" aria-label={`Simulación de lo que ve la cámara ${camara.numero}`}>
          <rect x={0} y={0} width={ANCHO} height={ALTO} fill="var(--ui-bg)" />
          {datos.figuras.map((f, i) => {
            const r = relleno(f);
            const puntos = f.puntos.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
            return (
              <g key={i}>
                <polygon points={puntos} fill={r.fill} fillOpacity={r.opacity} stroke={r.stroke} strokeWidth={r.stroke ? 0.6 : 0} />
                {f.tipo === "persona" ? <circle cx={f.cabeza.x} cy={f.cabeza.y} r={Math.max(f.cabeza.r, 1.5)} fill="#2a303b" /> : null}
              </g>
            );
          })}
          {datos.etiqueta ? (
            <g>
              <rect x={datos.etiqueta.x - 68} y={datos.etiqueta.y - 22} width={136} height={20} rx={10} fill="#14171f" opacity={0.85} />
              <text x={datos.etiqueta.x} y={datos.etiqueta.y - 8} textAnchor="middle" fontSize={11} fontWeight={600} fill="#fff">
                {ppmTexto}
              </text>
            </g>
          ) : null}
        </svg>
        <span className={styles.pipPastilla}>{ppmTexto}</span>
        <span className={styles.pipPastilla2}>
          {datos.conPersona ? `persona a ${metros(datos.distPiso)}` : `referencia a ${metros(datos.distPiso)}`}
          {datos.conPersona ? ` · ${ETIQUETA_ESTADO_PERSONA[lectura.estado].toLowerCase()}` : ""}
        </span>
      </div>
      <figcaption className={styles.pipPie}>
        <b>
          {camara.numero} · {camara.nombre}
        </b>
        <label className={styles.pipZoom}>
          Zoom
          <input type="range" min={1} max={8} step={1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom digital" />
        </label>
        <button type="button" className={styles.pipBoton} onClick={() => setGrande((g) => !g)} aria-pressed={grande}>
          {grande ? "Reducir" : "Ampliar"}
        </button>
      </figcaption>
    </figure>
  );
}
