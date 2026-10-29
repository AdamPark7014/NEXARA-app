"use client";

/**
 * Plano de solo lectura para la ficha de cámara y la propuesta: muros con sus huecos, puertas,
 * conos DORI (de todas las cámaras o de una), etiquetas de áreas, cotas, cámaras numeradas y la
 * etiqueta de cada cono. Se recorta al sitio (o al cono de la cámara) con un margen.
 */
import { useMemo } from "react";
import { etiquetaCono, distanciaInclinadaM, hfovDeg, ppm } from "@/lib/cctv/optica";
import { dirRumbo, hojasPuerta, type Plano, type Punto, type Tapa } from "@/lib/cctv/plano";
import { camaraEnMetros, type PoligonoCobertura } from "@/lib/cctv/visibilidad";
import { COLOR_NIVEL, OPACIDAD_NIVEL } from "./colores";

const pts = (ps: readonly Punto[]) => ps.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

export default function PlanoEstatico({
  plano,
  tapas,
  coberturas,
  soloCamara,
  conCroquis = false,
  conEtiquetasCono = true,
  alto,
  titulo,
}: {
  plano: Plano;
  tapas: readonly Tapa[];
  coberturas: ReadonlyMap<string, PoligonoCobertura[]>;
  /** Solo el cono de esta cámara, y el recorte alrededor de él. */
  soloCamara?: string;
  conCroquis?: boolean;
  conEtiquetasCono?: boolean;
  /** Alto en px; el ancho se ajusta al contenedor. */
  alto?: number;
  titulo: string;
}) {
  const k = plano.escala.metrosPorPx;
  const camaras = soloCamara ? plano.camaras.filter((c) => c.id === soloCamara) : plano.camaras;

  const caja = useMemo(() => {
    const puntos: Punto[] = [];
    if (soloCamara) {
      const c = plano.camaras.find((x) => x.id === soloCamara);
      if (c) {
        puntos.push(c.pos);
        for (const pol of coberturas.get(c.id) ?? []) for (const p of pol.puntos) puntos.push({ x: p.x / k, y: p.y / k });
        const d = dirRumbo(c.rumboDeg);
        puntos.push({ x: c.pos.x + (d.x * c.distanciaM) / k, y: c.pos.y + (d.y * c.distanciaM) / k });
      }
    } else {
      for (const m of plano.muros) puntos.push(m.a, m.b);
      for (const c of plano.camaras) puntos.push(c.pos);
      for (const pols of coberturas.values()) for (const pol of pols) for (const p of pol.puntos) puntos.push({ x: p.x / k, y: p.y / k });
    }
    if (!puntos.length) return { x: 0, y: 0, w: 60 / k, h: 30 / k };
    const minX = Math.min(...puntos.map((p) => p.x));
    const minY = Math.min(...puntos.map((p) => p.y));
    const maxX = Math.max(...puntos.map((p) => p.x));
    const maxY = Math.max(...puntos.map((p) => p.y));
    const margen = Math.max(maxX - minX, maxY - minY) * 0.06 + 1.5 / k;
    return { x: minX - margen, y: minY - margen, w: maxX - minX + 2 * margen, h: maxY - minY + 2 * margen };
  }, [plano, coberturas, soloCamara, k]);

  /** Unidad de dibujo: lo que mide 1 px si el plano ocupa ~900 px de ancho. */
  const u = Math.max(caja.w, caja.h * 2) / 900;
  const muros = new Map(plano.muros.map((m) => [m.id, m]));

  return (
    <svg viewBox={`${caja.x} ${caja.y} ${caja.w} ${caja.h}`} width="100%" height={alto} preserveAspectRatio="xMidYMid meet" role="img" aria-label={titulo} style={{ display: "block", background: "var(--ui-surface)" }}>
      {conCroquis && plano.croquis ? (
        <image
          href={plano.croquis.url}
          width={plano.croquis.anchoPx}
          height={plano.croquis.altoPx}
          opacity={plano.croquis.opacidad * 0.6}
          preserveAspectRatio="none"
          style={{ filter: plano.croquis.invertido ? "invert(1) hue-rotate(180deg)" : undefined }}
        />
      ) : null}
      {camaras.flatMap((c) =>
        (coberturas.get(c.id) ?? []).map((pol, i) => (
          <polygon key={`${c.id}-${i}`} points={pts(pol.puntos.map((p) => ({ x: p.x / k, y: p.y / k })))} fill={COLOR_NIVEL[pol.nivel]} fillOpacity={OPACIDAD_NIVEL[pol.nivel] + (soloCamara ? 0.12 : 0)} />
        )),
      )}
      {plano.obstaculos.map((o) => (
        <polygon key={o.id} points={pts(o.puntos)} fill="var(--ui-neutral-bg)" stroke="var(--ui-neutral)" strokeWidth={u} />
      ))}
      {tapas
        .filter((t) => {
          const m = muros.get(t.origen);
          return m && t.baseM === 0 && Math.abs(t.topeM - m.alturaM) < 1e-6;
        })
        .map((t, i) => {
          const m = muros.get(t.origen)!;
          return (
            <line
              key={i}
              x1={t.a.x / k}
              y1={t.a.y / k}
              x2={t.b.x / k}
              y2={t.b.y / k}
              stroke={m.alturaM >= 4 ? "#3a4150" : "#5b6272"}
              strokeWidth={Math.max(m.grosorM / k, 2.5 * u)}
              strokeLinecap="square"
            />
          );
        })}
      {plano.muros
        .filter((m) => m.tipo !== "muro")
        .map((m) => (
          <line key={m.id} x1={m.a.x} y1={m.a.y} x2={m.b.x} y2={m.b.y} stroke="var(--ui-info)" strokeWidth={2 * u} strokeDasharray={`${5 * u} ${4 * u}`} />
        ))}
      {plano.aberturas
        .filter((ab) => ab.tipo === "puerta")
        .map((ab) => {
          const m = muros.get(ab.muroId);
          if (!m) return null;
          const en = (t: number) => ({ x: m.a.x + (m.b.x - m.a.x) * t, y: m.a.y + (m.b.y - m.a.y) * t });
          return hojasPuerta(ab, en(ab.desde), en(ab.hasta)).map((h, i) => (
            <line key={`${ab.id}-${i}`} x1={h.a.x} y1={h.a.y} x2={h.b.x} y2={h.b.y} stroke="var(--ui-fg-3)" strokeWidth={1.4 * u} />
          ));
        })}
      {plano.cotas.map((c) => (
        <g key={c.id}>
          <line x1={c.a.x} y1={c.a.y} x2={c.b.x} y2={c.b.y} stroke="#b07a1a" strokeWidth={u} />
          {c.texto ? (
            <text x={(c.a.x + c.b.x) / 2} y={(c.a.y + c.b.y) / 2 - 4 * u} fontSize={11 * u} fontWeight={600} fill="#8a5a06" textAnchor="middle">
              {c.texto}
            </text>
          ) : null}
        </g>
      ))}
      {plano.etiquetas.map((e) => (
        <text key={e.id} x={e.pos.x} y={e.pos.y} fontSize={13 * u} fontWeight={600} fill="var(--ui-fg-2)" textAnchor="middle">
          {e.texto}
        </text>
      ))}
      {conEtiquetasCono
        ? camaras.map((c) => {
            const cm = camaraEnMetros(c, plano.escala);
            const h = c.lentes[0] ? hfovDeg(c.lentes[0].optica) : null;
            if (!cm || h == null) return null;
            const d = dirRumbo(c.rumboDeg);
            const largo = (c.distanciaM * 0.82) / k;
            const texto = etiquetaCono(c.distanciaM, ppm(cm.pxHoriz, distanciaInclinadaM(c.distanciaM, c.alturaM), h));
            return (
              <g key={`et-${c.id}`} transform={`translate(${c.pos.x + d.x * largo} ${c.pos.y + d.y * largo}) scale(${u})`}>
                <rect x={-74} y={-9} width={148} height={18} rx={9} fill="#14171f" opacity={0.85} />
                <text y={3.5} textAnchor="middle" fontSize={10} fontWeight={600} fill="#fff">
                  {texto}
                </text>
              </g>
            );
          })
        : null}
      {camaras.map((c) => {
        const d = dirRumbo(c.rumboDeg);
        return (
          <g key={c.id} transform={`translate(${c.pos.x} ${c.pos.y}) scale(${u})`}>
            <line x1={0} y1={0} x2={d.x * 14} y2={d.y * 14} stroke="#14171f" strokeWidth={1.5} />
            <circle r={2.6} fill="#14171f" />
            <circle cx={d.x * 14} cy={d.y * 14} r={10} fill="#14171f" stroke="#fff" strokeWidth={2} />
            <text x={d.x * 14} y={d.y * 14 + 3.8} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#fff">
              {c.numero}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
