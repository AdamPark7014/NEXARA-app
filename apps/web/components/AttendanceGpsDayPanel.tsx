"use client";

import { useCallback, useEffect, useState } from "react";
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
};

type TrajectoryPoint = {
  id: number;
  latitud?: number | string | null;
  longitud?: number | string | null;
  ultimaActualizacion?: string;
};

export default function AttendanceGpsDayPanel({ token, userId, date, attendances, hasCheckIn }: Props) {
  const [open, setOpen] = useState(false);
  const [trajectory, setTrajectory] = useState<TrajectoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!token || !userId) return;
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl(`gps/trajectory?userId=${userId}&date=${date}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await parseResponseJson<TrajectoryPoint[]>(res);
      setTrajectory(Array.isArray(data) ? data : []);
      setLoaded(true);
    } catch {
      setTrajectory([]);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [token, userId, date]);

  useEffect(() => {
    if (open && !loaded) void load();
  }, [open, loaded, load]);

  const entryUrl = attendanceMapUrl(attendances, "entrada");
  const exitUrl = attendanceMapUrl(attendances, "salida", trajectory);

  if (!hasCheckIn && !entryUrl && !exitUrl) return null;

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11, marginBottom: 8 }}>
        {entryUrl ? (
          <a href={entryUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)", fontWeight: 600 }}>
            ↓ Mapa entrada
          </a>
        ) : null}
        {exitUrl ? (
          <a href={exitUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)", fontWeight: 600 }}>
            ↑ Mapa salida
          </a>
        ) : hasCheckIn && attendances?.some((a) => a.type === "salida") ? (
          <span style={{ color: "var(--text-tertiary)" }}>↑ Salida sin GPS</span>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            marginLeft: "auto",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--primary)",
          }}
        >
          {open ? "Ocultar GPS del día" : "GPS del día · recorrido"}
        </button>
      </div>

      {open ? (
        loading ? (
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", padding: "6px 0" }}>Cargando trayecto…</div>
        ) : (
          <GpsTrajectoryPreview trajectory={trajectory} attendances={attendances} compact />
        )
      ) : null}
    </div>
  );
}
