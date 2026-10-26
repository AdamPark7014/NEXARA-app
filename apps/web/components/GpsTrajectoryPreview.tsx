"use client";

import { useMemo } from "react";
import {
  buildDayRoutePoints,
  googleMapsRouteUrl,
  pointCoords,
  type GpsCoordPoint,
} from "@/lib/gps-map-links";
import { useVisibleOnce } from "@/lib/use-visible-once";
import { huecosDelRecorrido } from "@/lib/recorrido-huecos";
import { duracionCorta } from "@/components/asistencias/formato";
import RecorridoMapa from "@/components/asistencias/RecorridoMapa";

type TrajectoryPoint = GpsCoordPoint & {
  id?: number;
  ultimaActualizacion?: string;
  velocidadKmh?: number | string | null;
  estaActivo?: boolean;
};

type Props = {
  trajectory: TrajectoryPoint[];
  attendances?: {
    type: string;
    timestamp: string;
    entryLatitude?: unknown;
    entryLongitude?: unknown;
    exitLatitude?: unknown;
    exitLongitude?: unknown;
  }[];
  compact?: boolean;
};

function fmtTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export default function GpsTrajectoryPreview({ trajectory, attendances, compact }: Props) {
  const [containerRef, visible] = useVisibleOnce<HTMLDivElement>();
  const routePoints = useMemo(
    () => buildDayRoutePoints(attendances, trajectory),
    [attendances, trajectory],
  );
  const routeUrl = useMemo(() => googleMapsRouteUrl(routePoints), [routePoints]);
  // Tramos de más de 40 min sin un punto: se dicen en la lista, entre los puntos que los rodean.
  const huecos = useMemo(() => {
    const ultima = (tipo: string) =>
      (attendances ?? []).filter((a) => a.type === tipo).map((a) => a.timestamp).sort().pop() ?? null;
    const entrada = ultima("entrada");
    const salida = ultima("salida");
    return huecosDelRecorrido({
      puntos: trajectory.map((p) => p.ultimaActualizacion),
      entrada,
      salida,
      enJornada: Boolean(entrada && !salida),
    });
  }, [attendances, trajectory]);

  if (trajectory.length === 0 && routePoints.length === 0) {
    return (
      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", padding: "8px 0" }}>
        Sin trayecto: la checada no guardó GPS (permiso denegado o ubicación apagada) y no hay puntos de recorrido del día.
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* El mapa se crea al acercarse a la vista: no pesa en la carga de la página. */}
      {visible ? (
        <RecorridoMapa puntos={routePoints} altura={compact ? 200 : 280} enlaceMaps={routeUrl} />
      ) : (
        <div style={{ height: compact ? 200 : 280 }} aria-hidden="true" />
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11 }}>
        {routeUrl ? (
          <a href={routeUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)", fontWeight: 600 }}>
            Ver recorrido trazado en Maps
          </a>
        ) : null}
        <span style={{ color: "var(--text-tertiary)" }}>
          {trajectory.length} punto{trajectory.length === 1 ? "" : "s"} GPS
        </span>
      </div>

      {!compact && trajectory.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 220, overflowY: "auto" }}>
          {huecos.length &&
          new Date(huecos[0]!.desde).getTime() < new Date(trajectory[0]?.ultimaActualizacion ?? 0).getTime() ? (
            <HuecoFila desde={huecos[0]!.desde} hasta={huecos[0]!.hasta} minutos={huecos[0]!.minutos} />
          ) : null}
          {(() => {
            const mostrados = new Set<string>();
            return trajectory.map((pt, i) => {
            const c = pointCoords(pt);
            if (!c) return null;
            const isFirst = i === 0;
            const isLast = i === trajectory.length - 1;
            const t = pt.ultimaActualizacion ? new Date(pt.ultimaActualizacion).getTime() : NaN;
            const hueco = huecos.find((h) => !mostrados.has(h.desde) && new Date(h.desde).getTime() === t);
            if (hueco) mostrados.add(hueco.desde);
            return (
              <div key={pt.id ?? i} style={{ display: "contents" }}>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  padding: "6px 8px",
                  fontSize: 11,
                  borderRadius: 6,
                  background: isFirst ? "#f0fdf4" : isLast ? "#eff6ff" : "var(--surface-2)",
                }}
              >
                <span style={{ fontFamily: "monospace", minWidth: 44 }}>{fmtTime(pt.ultimaActualizacion)}</span>
                <span style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>
                  {c.lat.toFixed(5)}, {c.lng.toFixed(5)}
                </span>
                {isFirst ? <span style={{ fontSize: 9, fontWeight: 700, color: "#15803d" }}>INICIO</span> : null}
                {isLast && !isFirst ? <span style={{ fontSize: 9, fontWeight: 700, color: "#1d4ed8" }}>FIN</span> : null}
              </div>
              {hueco ? <HuecoFila desde={hueco.desde} hasta={hueco.hasta} minutos={hueco.minutos} /> : null}
              </div>
            );
            });
          })()}
        </div>
      ) : null}
    </div>
  );
}

/** «Sin ubicación de 08:20 a 13:12 · 4 h 52»: un tramo sin puntos, en rojo suave. */
function HuecoFila({ desde, hasta, minutos }: { desde: string; hasta: string | null; minutos: number }) {
  return (
    <div
      role="note"
      style={{
        padding: "6px 8px",
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 6,
        color: "var(--ui-danger-text, #b91c1c)",
        background: "var(--ui-danger-bg, #fef2f2)",
      }}
    >
      {hasta
        ? `Sin ubicación de ${fmtTime(desde)} a ${fmtTime(hasta)} · ${duracionCorta(minutos * 60_000)}`
        : `Sin ubicación desde las ${fmtTime(desde)} · ${duracionCorta(minutos * 60_000)}`}
    </div>
  );
}
