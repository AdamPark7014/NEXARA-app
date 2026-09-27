"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { buildApiUrl, parseResponseJson } from "@/lib/api-base";
import { attendanceMapUrl } from "@/lib/gps-map-links";
import GpsTrajectoryPreview from "@/components/GpsTrajectoryPreview";

type Props = {
  token: string;
  userId: number;
  date: string;
  attendances?: {
    type: string;
    timestamp: string;
    entryLatitude?: unknown;
    entryLongitude?: unknown;
    exitLatitude?: unknown;
    exitLongitude?: unknown;
  }[];
  hasCheckIn?: boolean;
  viewerUserId?: number;
  canViewOwnTrajectory?: boolean;
  /** El recorrido del día (`gps/trajectory`) es solo para dirección; los mapas de checada, no. */
  canViewTrajectory?: boolean;
};

type TrajectoryPoint = {
  id: number;
  latitud?: number | string | null;
  longitud?: number | string | null;
  ultimaActualizacion?: string;
};

const mapButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minHeight: 40,
  padding: "6px 12px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--primary)",
  fontSize: 13,
  fontWeight: 650,
  textDecoration: "none",
  whiteSpace: "nowrap",
  cursor: "pointer",
  fontFamily: "inherit",
};

export default function AttendanceGpsDayPanel({
  token,
  userId,
  date,
  attendances,
  hasCheckIn,
  viewerUserId,
  canViewOwnTrajectory = false,
  canViewTrajectory = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [trajectory, setTrajectory] = useState<TrajectoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!token || !userId) return;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(buildApiUrl(`gps/trajectory?userId=${userId}&date=${date}`), {
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await parseResponseJson<TrajectoryPoint[]>(res);
      setTrajectory(Array.isArray(data) ? data : []);
    } catch {
      setFailed(true);
    } finally {
      setLoaded(true);
      setLoading(false);
    }
  }, [token, userId, date]);

  useEffect(() => {
    setLoaded(false);
    setTrajectory([]);
  }, [userId, date]);

  useEffect(() => {
    if (open && !loaded && canViewTrajectory) void load();
  }, [open, loaded, load, canViewTrajectory]);

  const entryUrl = attendanceMapUrl(attendances, "entrada");
  const exitUrl = attendanceMapUrl(attendances, "salida", trajectory);

  if (!hasCheckIn && !entryUrl && !exitUrl) return null;

  if (viewerUserId != null && userId === viewerUserId && !canViewOwnTrajectory) return null;

  return (
    <div style={{ marginTop: 4, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {entryUrl ? (
          <a href={entryUrl} target="_blank" rel="noopener noreferrer" style={mapButton}>
            📍 Entrada en mapa
          </a>
        ) : null}
        {exitUrl ? (
          <a href={exitUrl} target="_blank" rel="noopener noreferrer" style={mapButton}>
            📍 Salida en mapa
          </a>
        ) : hasCheckIn && attendances?.some((a) => a.type === "salida") ? (
          <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Salida sin ubicación</span>
        ) : null}
        {canViewTrajectory ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            style={{ ...mapButton, marginLeft: "auto" }}
          >
            {open ? "Ocultar recorrido" : "Recorrido del día"}
          </button>
        ) : null}
      </div>

      {open && canViewTrajectory ? (
        <div style={{ marginTop: 8 }}>
          {loading ? (
            <div style={{ fontSize: 13, color: "var(--text-tertiary)", padding: "6px 0" }}>Cargando recorrido…</div>
          ) : failed ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
              <span style={{ color: "var(--text-secondary)" }}>No se pudo cargar el recorrido.</span>
              <button type="button" style={mapButton} onClick={() => void load()}>
                Reintentar
              </button>
            </div>
          ) : (
            <GpsTrajectoryPreview trajectory={trajectory} attendances={attendances} compact />
          )}
        </div>
      ) : null}
    </div>
  );
}
