"use client";

/**
 * Minimapa del recorrido: el plano visto desde arriba, dónde estás y hacia dónde miras. Un clic te lleva.
 * El marcador lo mueve quien pinta, sin pasar por React, porque cambia en cada cuadro.
 */
import { forwardRef, useMemo, useRef, type MouseEvent } from "react";
import { limitesSitio } from "@/lib/cctv/medidas";
import { aMetros, type Plano, type Punto } from "@/lib/cctv/plano";
import styles from "./editor.module.css";

export default forwardRef<SVGGElement, { plano: Plano; camarasQueVen: ReadonlySet<string>; onIr: (p: Punto) => void }>(function MiniMapa({ plano, camarasQueVen, onIr }, marcador) {
  const svg = useRef<SVGSVGElement>(null);
  const caja = useMemo(() => {
    const l = limitesSitio(plano);
    const margen = Math.max(l.max.x - l.min.x, l.max.y - l.min.y) * 0.05 + 0.5;
    return { x: l.min.x - margen, y: l.min.y - margen, w: l.max.x - l.min.x + margen * 2, h: l.max.y - l.min.y + margen * 2 };
  }, [plano]);
  // Todo se mide en metros: el marcador y las cámaras crecen con el sitio para que siempre se distingan.
  const u = Math.max(caja.w, caja.h) / 40;

  const alClic = (e: MouseEvent<SVGSVGElement>) => {
    const s = svg.current;
    const matriz = s?.getScreenCTM()?.inverse();
    if (!s || !matriz) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matriz);
    onIr({ x: p.x, y: p.y });
  };

  return (
    <svg
      ref={svg}
      className={styles.miniMapa}
      viewBox={`${caja.x} ${caja.y} ${caja.w} ${caja.h}`}
      role="img"
      aria-label="Minimapa del sitio. Haz clic para ir a ese lugar."
      onClick={alClic}
    >
      {(plano.areas ?? []).map((a) => (
        <polygon key={a.id} points={a.puntos.map((p) => { const q = aMetros(p, plano.escala); return `${q.x},${q.y}`; }).join(" ")} fill="rgba(255,255,255,0.09)" />
      ))}
      {plano.obstaculos.map((o) => (
        <polygon key={o.id} points={o.puntos.map((p) => { const q = aMetros(p, plano.escala); return `${q.x},${q.y}`; }).join(" ")} fill="rgba(255,255,255,0.24)" />
      ))}
      {plano.muros.map((m) => {
        const a = aMetros(m.a, plano.escala);
        const b = aMetros(m.b, plano.escala);
        return <line key={m.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff" strokeOpacity={m.tipo === "reja" ? 0.35 : 0.85} strokeWidth={u * 0.28} strokeLinecap="round" />;
      })}
      {plano.camaras.map((c) => {
        const q = aMetros(c.pos, plano.escala);
        return <circle key={c.id} cx={q.x} cy={q.y} r={u * 0.55} fill={camarasQueVen.has(c.id) ? "#36d399" : "#8c95a3"} />;
      })}
      <g ref={marcador}>
        <path d={`M0 0L${-u * 2.4} ${-u * 4.2}A${u * 4.8} ${u * 4.8} 0 0 1 ${u * 2.4} ${-u * 4.2}Z`} fill="rgba(79,205,180,0.32)" />
        <circle r={u * 0.85} fill="#4fcdb4" stroke="#fff" strokeWidth={u * 0.3} />
      </g>
    </svg>
  );
});
