"use client";

import { COLOR_TRAMO, horaMx, lineaDeTiempo, type DiaKpi } from "@/lib/kpis-equipo";

const ETIQUETA: Record<keyof typeof COLOR_TRAMO, string> = {
  productivo: "Productivo",
  inactivo: "Inactivo",
  comida: "Comida",
};

/** Leyenda de la barra: los mismos colores que los tramos. */
export function LeyendaTramos() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12, color: "var(--text-secondary)" }}>
      {(Object.keys(COLOR_TRAMO) as Array<keyof typeof COLOR_TRAMO>).map((k) => (
        <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span
            aria-hidden
            style={{ width: 14, height: 10, borderRadius: 3, background: COLOR_TRAMO[k], display: "inline-block" }}
          />
          {ETIQUETA[k]}
        </span>
      ))}
    </div>
  );
}

/**
 * La jornada de un día como barra: tramos productivos (actividad), inactivos y comida.
 * Cada tramo dice su hora al pasar el cursor; la regla marca las horas en punto.
 */
export default function KpiLineaDeTiempo({ dia }: { dia: Pick<DiaKpi, "tramos" | "fecha"> }) {
  const linea = lineaDeTiempo(dia);
  if (!linea) return null;
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div
        role="img"
        aria-label={`Línea de tiempo del ${dia.fecha}: ${linea.segmentos
          .map((s) => `${ETIQUETA[s.tipo]} ${horaMx(s.inicio)}–${horaMx(s.fin)}`)
          .join(", ")}`}
        style={{
          position: "relative",
          height: 18,
          borderRadius: 6,
          overflow: "hidden",
          background: "color-mix(in srgb, var(--border) 45%, var(--surface))",
        }}
      >
        {linea.segmentos.map((s) => (
          <span
            key={`${s.tipo}-${s.inicio}`}
            title={`${ETIQUETA[s.tipo]} · ${horaMx(s.inicio)}–${horaMx(s.fin)}`}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${s.izquierdaPct}%`,
              width: `${Math.max(s.anchoPct, 0.4)}%`,
              background: COLOR_TRAMO[s.tipo],
              opacity: s.tipo === "inactivo" ? 0.75 : 1,
            }}
          />
        ))}
      </div>
      <div aria-hidden style={{ position: "relative", height: 14 }}>
        {linea.marcas.map((m, i) => (
          <span
            key={m.at}
            style={{
              position: "absolute",
              left: `${m.pct}%`,
              transform: i === 0 ? "none" : i === linea.marcas.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
              fontSize: 10,
              color: "var(--text-tertiary)",
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
            }}
          >
            {horaMx(m.at).slice(0, 2)}
          </span>
        ))}
      </div>
    </div>
  );
}
