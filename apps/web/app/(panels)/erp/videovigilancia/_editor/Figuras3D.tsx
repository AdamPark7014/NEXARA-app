"use client";

/** Pinta las figuras de `escena3D` (editor 3D y propuesta usan el mismo dibujo). */
import type { Figura3D } from "@/lib/cctv/escena3d";
import type { Plano } from "@/lib/cctv/plano";
import { COLOR_NIVEL, OPACIDAD_NIVEL } from "./colores";

const GRIS_APAGADO = "#8f99a6";

const pts = (ps: ReadonlyArray<{ x: number; y: number }>) => ps.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

/** Gris de una cara según su luz (tono 0.78–0.96) sobre el color de muro del sistema. */
function grisMuro(tono: number): string {
  const r = Math.round(206 * tono + 20);
  const g = Math.round(213 * tono + 20);
  const b = Math.round(222 * tono + 20);
  return `rgb(${Math.min(r, 250)}, ${Math.min(g, 252)}, ${Math.min(b, 255)})`;
}

export default function Figuras3D({
  figuras,
  plano,
  matriz,
  capas,
  selId,
  apagado = false,
}: {
  figuras: readonly Figura3D[];
  plano: Plano;
  matriz: readonly number[];
  capas: { croquis: boolean; etiquetas: boolean; translucidos: boolean };
  selId?: string | null;
  /** Piso de otro nivel: todo en gris y tenue. Va con colores propios y no con `filter`, que al girar se
   * vuelve a rasterizar en cada cuadro y frena la vista. */
  apagado?: boolean;
}) {
  return (
    <>
      {figuras.map((f, i) => {
        switch (f.tipo) {
          case "piso":
            return (
              <g key={i}>
                <polygon points={pts(f.puntos)} fill="var(--ui-surface)" fillOpacity={apagado ? 0.55 : 1} stroke="var(--ui-border-strong)" strokeWidth={1} />
                {plano.croquis && capas.croquis ? (
                  <image
                    href={plano.croquis.url}
                    width={plano.croquis.anchoPx}
                    height={plano.croquis.altoPx}
                    transform={`matrix(${matriz.join(" ")})`}
                    opacity={plano.croquis.opacidad * (apagado ? 0.3 : 0.75)}
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
                fill={apagado ? GRIS_APAGADO : COLOR_NIVEL[f.nivel]}
                fillOpacity={apagado ? OPACIDAD_NIVEL[f.nivel] * 0.6 : f.propia ? OPACIDAD_NIVEL[f.nivel] + 0.2 : OPACIDAD_NIVEL[f.nivel] + 0.06}
                style={{ pointerEvents: "none" }}
              />
            );
          case "cara": {
            const sel = selId === f.origen;
            const relleno =
              f.material === "hoja" ? "#c9a46b" : f.material === "vidrio" ? "var(--ui-info)" : f.material === "obstaculo" ? "#b9c2cc" : f.superior ? "var(--ui-surface)" : grisMuro(f.tono);
            // Muros sólidos con su sombra; la cara de afuera que queda entre quien ve y el interior va
            // tenue para que se vea la cobertura («casa de muñecas»). Con «Muros translúcidos», todos.
            const muroVertical = !f.superior && f.material === "muro";
            const opacidad = apagado
              ? 0.32
              : f.material === "vidrio"
                ? 0.22
                : muroVertical && capas.translucidos
                  ? 0.45
                  : muroVertical && f.exterior
                    ? 0.24
                    : 1;
            const tipoSel = f.material === "obstaculo" ? "obstaculo" : f.material === "hoja" ? null : "muro";
            // Los muros se parten en tramos de 1 m para el orden de pintado; para que no se vean las
            // juntas, cada tramo solo traza sus aristas largas (base y corona) y no los cortes.
            const aristas = !sel && f.puntos.length === 4 && f.material !== "hoja";
            return (
              <g key={i} data-sel={tipoSel ? `${tipoSel}:${f.origen}` : undefined}>
                <polygon
                  points={pts(f.puntos)}
                  fill={sel ? "var(--ui-brand-soft-2)" : relleno}
                  fillOpacity={opacidad}
                  stroke={sel ? "var(--ui-brand)" : aristas && opacidad === 1 ? relleno : f.material === "hoja" ? "#a8844f" : "none"}
                  // En caras opacas el trazo del mismo color (y un poco grueso) tapa las juntas entre tramos.
                  strokeWidth={sel ? 1.4 : aristas && opacidad === 1 ? 1.2 : 0.6}
                />
                {aristas ? (
                  <path
                    d={`M${f.puntos[0].x.toFixed(1)},${f.puntos[0].y.toFixed(1)}L${f.puntos[1].x.toFixed(1)},${f.puntos[1].y.toFixed(1)}M${f.puntos[3].x.toFixed(1)},${f.puntos[3].y.toFixed(1)}L${f.puntos[2].x.toFixed(1)},${f.puntos[2].y.toFixed(1)}`}
                    stroke="#97a2b0"
                    strokeOpacity={apagado ? 0.45 : f.superior ? 0.9 : 0.75}
                    strokeWidth={0.8}
                    fill="none"
                  />
                ) : null}
              </g>
            );
          }
          case "persona": {
            const sel = selId === f.id;
            return (
              <g key={i} data-sel={`persona:${f.id}`}>
                <title>Persona de prueba: arrástrala en el 2D para medir cuántos PPM le llegan</title>
                <polygon points={pts(f.anillo)} fill="none" stroke={sel ? "var(--ui-brand)" : apagado ? GRIS_APAGADO : "var(--ui-info)"} strokeWidth={2} strokeOpacity={apagado ? 0.5 : 1} />
                <line x1={f.pie.x} y1={f.pie.y} x2={f.cadera.x} y2={f.cadera.y} stroke={apagado ? "#c3cad3" : "#7d8796"} strokeWidth={Math.max(f.radio * 1.6, 2)} strokeLinecap="round" />
                <line x1={f.cadera.x} y1={f.cadera.y} x2={f.cuello.x} y2={f.cuello.y} stroke={apagado ? "#d3d9e0" : "#aab3bf"} strokeWidth={Math.max(f.radio * 2.1, 2.5)} strokeLinecap="round" />
                <circle cx={f.cabeza.x} cy={f.cabeza.y} r={Math.max(f.radio, 1.5)} fill={apagado ? "#b4bcc6" : "#2a303b"} />
              </g>
            );
          }
          case "camara": {
            const sel = selId === f.id;
            return (
              <g key={i} data-sel={`camara:${f.id}`} style={{ cursor: "pointer" }}>
                <title>{`Cámara ${f.numero} · ${f.nombre}${apagado ? "" : " — clic para editarla"}`}</title>
                <line x1={f.montaje.x} y1={f.montaje.y} x2={f.insignia.x} y2={f.insignia.y} stroke={apagado ? GRIS_APAGADO : "#14171f"} strokeWidth={1} />
                <circle cx={f.montaje.x} cy={f.montaje.y} r={3} fill={apagado ? GRIS_APAGADO : "#14171f"} />
                {sel ? <circle cx={f.insignia.x} cy={f.insignia.y} r={15} fill="var(--ui-brand)" opacity={0.22} /> : null}
                <circle cx={f.insignia.x} cy={f.insignia.y} r={10} fill={sel ? "var(--ui-brand)" : apagado ? "#a7b0bb" : "#14171f"} stroke="#fff" strokeWidth={1.8} />
                <text x={f.insignia.x} y={f.insignia.y + 3.8} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#fff" style={{ userSelect: "none" }}>
                  {f.numero}
                </text>
              </g>
            );
          }
          case "rayos": {
            const linea = (a: { x: number; y: number }, b: { x: number; y: number }) => `M${a.x.toFixed(1)},${a.y.toFixed(1)}L${b.x.toFixed(1)},${b.y.toFixed(1)}`;
            const [c0, c1] = f.cerca;
            const [l0, l1] = f.lejos;
            return (
              <g key={i} style={{ pointerEvents: "none" }}>
                <path d={`${linea(f.lente, l0)}${linea(f.lente, l1)}`} stroke="var(--ui-brand)" strokeWidth={1.4} strokeDasharray="6 4" fill="none" opacity={0.9} />
                <path d={`${linea(f.lente, c0)}${linea(f.lente, c1)}${linea(c0, c1)}`} stroke="var(--ui-brand)" strokeWidth={1} strokeDasharray="2 3" fill="none" opacity={0.7} />
                <circle cx={f.lente.x} cy={f.lente.y} r={3.5} fill="var(--ui-brand)" stroke="#fff" strokeWidth={1.2} />
              </g>
            );
          }
          case "etiqueta":
            return capas.etiquetas ? (
              <text key={i} x={f.pos.x} y={f.pos.y} textAnchor="middle" fontSize={12} fontWeight={600} fill={apagado ? "var(--ui-fg-4)" : "var(--ui-fg-2)"} style={{ pointerEvents: "none", userSelect: "none" }}>
                {f.texto}
              </text>
            ) : null;
        }
      })}
    </>
  );
}
