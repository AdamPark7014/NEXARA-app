/**
 * Símbolo técnico de lo que no es cámara, para el dibujo, el plano y la simbología. Va centrado en
 * el origen y mide unos 24 px.
 */
import { FAMILIA_DE_TIPO, type TipoEquipo } from "@/lib/cctv/catalogo";

export const COLOR_PLANO_CAMARA = "#0a7f6d";

export function colorPlanoEquipo(tipo: TipoEquipo): string {
  const f = FAMILIA_DE_TIPO[tipo];
  return f === "acceso" ? "#b4760d" : f === "alarmas" ? "#bb2d2d" : "#2f4fbf";
}

export function SimboloEquipo({ tipo, color, escala = 1 }: { tipo: TipoEquipo; color?: string; escala?: number }) {
  const c = color ?? colorPlanoEquipo(tipo);
  const base = { fill: "none", stroke: c, strokeWidth: 1.7, strokeLinejoin: "round", strokeLinecap: "round" } as const;
  return (
    <g {...base} transform={`scale(${escala})`}>
      {tipo === "terminal" ? (
        <>
          <rect x={-7.5} y={-11} width={15} height={22} rx={2.6} fill="#fff" />
          <circle cy={-3} r={3} />
          <path d="M-4.6,6.5 A5,5 0 0 1 4.6,6.5" />
        </>
      ) : tipo === "barrera" ? (
        <>
          <rect x={-7} y={-7} width={14} height={14} fill="#fff" />
          <line x1={-7} y1={0} x2={7} y2={0} />
          <circle r={2.6} fill={c} stroke="none" />
        </>
      ) : tipo === "sismica" ? (
        <>
          <path d="M0,-12 L12,9 L-12,9 Z" fill="#fff" />
          <path d="M-7,4 L-3,4 L-1.4,-3 L1,6 L3,1 L7,1" strokeWidth={1.4} />
        </>
      ) : tipo === "sirena" ? (
        <>
          <path d="M-9,5 L-9,0 A9,9 0 0 1 9,0 L9,5 Z" fill="#fff" />
          <line x1={-11} y1={8} x2={11} y2={8} />
          <line x1={-13} y1={-4} x2={-16} y2={-6} />
          <line x1={13} y1={-4} x2={16} y2={-6} />
          <line x1={0} y1={-13} x2={0} y2={-16} />
        </>
      ) : tipo === "gabinete" ? (
        <>
          <rect x={-11} y={-11} width={22} height={22} fill="#fff" />
          <line x1={-11} y1={-11} x2={11} y2={11} />
          <line x1={-11} y1={11} x2={11} y2={-11} />
        </>
      ) : tipo === "nvr" ? (
        <>
          <rect x={-12} y={-7} width={24} height={14} rx={1.6} fill="#fff" />
          <circle cx={-6.5} r={2.6} />
          <line x1={-1} y1={-2} x2={8.5} y2={-2} />
          <line x1={-1} y1={2.4} x2={8.5} y2={2.4} />
        </>
      ) : tipo === "switch" ? (
        <>
          <rect x={-12} y={-7} width={24} height={14} rx={1.6} fill="#fff" />
          {[-8, -4, 0, 4, 8].map((x) => (
            <line key={x} x1={x} y1={-3} x2={x} y2={3} strokeWidth={2.2} />
          ))}
        </>
      ) : tipo === "servidor" ? (
        <>
          <rect x={-10} y={-11} width={20} height={22} rx={1.6} fill="#fff" />
          <line x1={-10} y1={-3.6} x2={10} y2={-3.6} />
          <line x1={-10} y1={3.6} x2={10} y2={3.6} />
          <circle cx={6} cy={-7.4} r={1} fill={c} stroke="none" />
          <circle cx={6} cy={0} r={1} fill={c} stroke="none" />
          <circle cx={6} cy={7.4} r={1} fill={c} stroke="none" />
        </>
      ) : tipo === "ups" ? (
        <>
          <rect x={-10} y={-11} width={20} height={22} rx={1.6} fill="#fff" />
          <path d="M1.5,-7 L-4.5,1 L-0.5,1 L-1.5,7 L4.5,-1.5 L0.5,-1.5 Z" fill={c} stroke="none" />
        </>
      ) : tipo === "panel" ? (
        <>
          <rect x={-10} y={-10} width={20} height={20} rx={2.6} fill="#fff" />
          <circle r={4.6} />
          <circle r={1.3} fill={c} stroke="none" />
        </>
      ) : (
        <>
          <rect x={-10} y={-10} width={20} height={20} rx={2.6} fill="#fff" />
          <line x1={-4.5} y1={0} x2={4.5} y2={0} />
          <line x1={0} y1={-4.5} x2={0} y2={4.5} />
        </>
      )}
    </g>
  );
}
