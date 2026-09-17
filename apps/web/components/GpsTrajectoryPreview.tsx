"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildDayRoutePoints,
  googleMapsRouteUrl,
  pointCoords,
  type GpsCoordPoint,
} from "@/lib/gps-map-links";
import { staticRouteMapUrl } from "@/lib/static-map";
import { useVisibleOnce } from "@/lib/use-visible-once";

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

/**
 * Cada cambio de URL de la imagen es una imagen nueva que alguien tiene que
 * pagar. Las pantallas de asistencia refrescan cada 15 s y la de GPS cada 30 s:
 * sin este freno, un turno de ocho horas con la pestaña abierta pedía cientos
 * de mapas del mismo recorrido. La imagen se renueva como mucho cada 5 minutos.
 */
const MAP_REFRESH_MS = 5 * 60_000;

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

  // La URL ya viene redondeada a 5 decimales y muestreada: si el recorrido no
  // cambió de verdad, sale la misma cadena y el navegador no vuelve a pedirla.
  const candidateUrl = useMemo(
    () => staticRouteMapUrl(routePoints, {
      width: compact ? 480 : 640,
      height: compact ? 200 : 280,
    }),
    [routePoints, compact],
  );

  const [shownUrl, setShownUrl] = useState("");
  const lastChangeRef = useRef(0);

  useEffect(() => {
    if (!visible || !candidateUrl) return;
    if (candidateUrl === shownUrl) return;

    const elapsed = Date.now() - lastChangeRef.current;
    if (!shownUrl || elapsed >= MAP_REFRESH_MS) {
      lastChangeRef.current = Date.now();
      setShownUrl(candidateUrl);
      return;
    }
    const timer = window.setTimeout(() => {
      lastChangeRef.current = Date.now();
      setShownUrl(candidateUrl);
    }, MAP_REFRESH_MS - elapsed);
    return () => window.clearTimeout(timer);
  }, [visible, candidateUrl, shownUrl]);

  if (trajectory.length === 0 && routePoints.length === 0) {
    return (
      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", padding: "8px 0" }}>
        Sin trayecto: la checada no guardó GPS (permiso denegado o ubicación apagada) y no hay puntos de recorrido del día.
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {shownUrl ? (
        <a href={routeUrl ?? shownUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
          <img
            src={shownUrl}
            alt="Recorrido GPS del día"
            loading="lazy"
            decoding="async"
            style={{
              width: "100%",
              maxHeight: compact ? 200 : 280,
              objectFit: "cover",
              borderRadius: 10,
              border: "1px solid var(--border)",
            }}
          />
        </a>
      ) : (
        <div
          style={{
            height: compact ? 200 : 280,
            borderRadius: 10,
            border: "1px dashed var(--border)",
            display: "grid",
            placeItems: "center",
            fontSize: 11.5,
            color: "var(--text-tertiary)",
          }}
        >
          {candidateUrl ? "Cargando mapa del recorrido…" : "Sin mapa del recorrido."}
        </div>
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
