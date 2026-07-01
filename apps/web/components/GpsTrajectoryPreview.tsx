"use client";

import {
  buildDayRoutePoints,
  googleMapsRouteUrl,
  googleStaticMapPathUrl,
  pointCoords,
  type GpsCoordPoint,
} from "@/lib/gps-map-links";

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
  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const routePoints = buildDayRoutePoints(attendances, trajectory);
  const staticMapUrl = googleStaticMapPathUrl(routePoints, mapsKey, {
    width: compact ? 480 : 640,
    height: compact ? 200 : 280,
  });
  const routeUrl = googleMapsRouteUrl(routePoints);

  if (trajectory.length === 0 && routePoints.length === 0) {
    return (
      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", padding: "8px 0" }}>
        Sin puntos GPS registrados este día.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {staticMapUrl ? (
        <a href={routeUrl ?? staticMapUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
          <img
            src={staticMapUrl}
            alt="Recorrido GPS del día"
            style={{
              width: "100%",
              maxHeight: compact ? 200 : 280,
              objectFit: "cover",
              borderRadius: 10,
              border: "1px solid var(--border)",
            }}
          />
        </a>
      ) : null}

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
          {trajectory.map((pt, i) => {
            const c = pointCoords(pt);
            if (!c) return null;
            const isFirst = i === 0;
            const isLast = i === trajectory.length - 1;
            return (
              <div
                key={pt.id ?? i}
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
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
