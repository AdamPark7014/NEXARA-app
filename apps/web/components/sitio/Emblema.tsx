import type { CSSProperties } from "react";
import { DEGRADADOS, EMBLEMA_ALTO, EMBLEMA_ANCHO, FRAGMENTOS, LETRAS, PALABRA_ALTO, PALABRA_ANCHO, PIEZAS } from "./emblema-datos";
import { SILUETA } from "./emblema-silueta";
import { azar } from "./azar";
import e from "./ensamble.module.css";

const CONTORNO = `M${SILUETA.map(([x, y]) => `${x} ${y}`).join("L")}Z`;
const CX = EMBLEMA_ANCHO / 2;
const CY = EMBLEMA_ALTO / 2;

/**
 * Vuelo de cada fragmento en la entrada: sale lejos del centro, en su misma dirección, girado y más chico, y llega en
 * un barrido que da la vuelta al hexágono. Va sembrado: el servidor y cada visita pintan lo mismo.
 */
const VUELOS: CSSProperties[] = (() => {
  const r = azar(20261122);
  return FRAGMENTOS.map((f) => {
    const angulo = Math.atan2(f.cy - CY, f.cx - CX);
    const rumbo = angulo + (r() - 0.5) * 1.1;
    const lejos = 80 + r() * 190;
    const vuelta = (angulo + Math.PI * 0.75 + Math.PI * 2) % (Math.PI * 2);
    const espera = (vuelta / (Math.PI * 2)) * 0.34 + r() * 0.1;
    return {
      "--dx": `${(Math.cos(rumbo) * lejos).toFixed(0)}px`,
      "--dy": `${(Math.sin(rumbo) * lejos).toFixed(0)}px`,
      "--giro": `${((r() - 0.5) * 220).toFixed(0)}deg`,
      "--talla": (0.45 + r() * 0.5).toFixed(2),
      "--espera": `${espera.toFixed(2)}s`,
    } as CSSProperties;
  });
})();

type Props = {
  /** Prefijo de los `id` internos: dos emblemas en la misma página no comparten degradados. */
  uid: string;
  /** Con la entrada: fragmentos que vuelan, trazo guía y destello. Sin ella, solo el logotipo. */
  animado?: boolean;
  className?: string;
};

/** El emblema de NEXARA en vectores. Es decorativo: quien lo usa pone el nombre accesible. */
export default function Emblema({ uid, animado = false, className }: Props) {
  const relleno = (p: { color: string; grad: string | null }) => (p.grad ? `url(#${uid}-${p.grad})` : p.color);
  return (
    <svg
      className={`${e.emblema} ${className ?? ""}`}
      viewBox={`0 0 ${EMBLEMA_ANCHO} ${EMBLEMA_ALTO}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {DEGRADADOS.map((g) => (
          <linearGradient key={g.id} id={`${uid}-${g.id}`} gradientUnits="userSpaceOnUse" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>
            <stop offset="0" stopColor={g.c[0]} />
            <stop offset=".5" stopColor={g.c[1]} />
            <stop offset="1" stopColor={g.c[2]} />
          </linearGradient>
        ))}
        <radialGradient id={`${uid}-nucleo`} gradientUnits="userSpaceOnUse" cx={CX} cy={EMBLEMA_ALTO * 0.47} r={EMBLEMA_ANCHO * 0.5}>
          <stop offset="0" stopColor="#2b323a" />
          <stop offset=".55" stopColor="#191d23" />
          <stop offset="1" stopColor="#0b0c11" />
        </radialGradient>
        {animado ? (
          <>
            <linearGradient id={`${uid}-brillo`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset=".5" stopColor="#fff" stopOpacity=".55" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <clipPath id={`${uid}-contorno`}>
              <path d={CONTORNO} />
            </clipPath>
          </>
        ) : null}
      </defs>

      {animado ? <path className={e.guia} d={CONTORNO} pathLength={1} /> : null}

      <g className={e.nucleo}>
        {PIEZAS.filter((p) => p.clase === "oscuro").map((p, i) => (
          <path key={i} d={p.d} fill={i === 0 ? `url(#${uid}-nucleo)` : p.color} />
        ))}
      </g>
      <g className={e.solido}>
        {PIEZAS.filter((p) => p.clase !== "oscuro").map((p, i) => (
          <path key={i} d={p.d} fill={relleno(p)} />
        ))}
      </g>

      {animado ? (
        <>
          <g className={e.fragmentos}>
            {FRAGMENTOS.map((f, i) => (
              <path key={i} className={e.frag} d={f.d} fill={relleno(f)} style={VUELOS[i]} />
            ))}
          </g>
          <g clipPath={`url(#${uid}-contorno)`}>
            <rect className={e.destello} x={-110} y={-20} width={96} height={EMBLEMA_ALTO + 40} fill={`url(#${uid}-brillo)`} />
          </g>
        </>
      ) : null}
    </svg>
  );
}

/**
 * La palabra NEXARA en vectores (las mismas letras del logotipo), en el color del texto. Con `contorno` solo se dibuja
 * el filo de cada letra, como una pista de circuito.
 */
export function Palabra({ className, contorno = false }: { className?: string; contorno?: boolean }) {
  return (
    <svg className={className} viewBox={`0 0 ${PALABRA_ANCHO} ${PALABRA_ALTO}`} aria-hidden="true" focusable="false">
      {LETRAS.map((d, i) =>
        contorno ? (
          <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        ) : (
          <path key={i} d={d} fill="currentColor" fillRule="evenodd" />
        ),
      )}
    </svg>
  );
}
