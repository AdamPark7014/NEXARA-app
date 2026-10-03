"use client";

import { useCallback, useEffect, useState } from "react";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import RouteOutlinedIcon from "@mui/icons-material/RouteOutlined";
import { Alert, Button, SkeletonRows, buttonClass } from "@/components/base";
import { buildApiUrl, parseResponseJson } from "@/lib/api-base";
import { attendanceMapUrl } from "@/lib/gps-map-links";
import GpsTrajectoryPreview from "@/components/GpsTrajectoryPreview";
import RecorridoDia from "@/components/asistencias/RecorridoDia";
import s from "@/components/asistencias/recorrido.module.css";

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

/**
 * Dónde checó una persona y, para dirección, su recorrido del día.
 *
 * Los mapas de entrada y salida son enlaces «en mapa» (nunca coordenadas). El recorrido
 * se pide solo al abrirlo y se lee como línea de tiempo: entrada, algunas ubicaciones
 * con su hora y salida, con la imagen de la ruta debajo.
 */
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

  const enlace = buttonClass("secondary", { size: "sm" });
  const salidaSinUbicacion = !exitUrl && hasCheckIn && attendances?.some((a) => a.type === "salida");

  return (
    <div className={s.panel}>
      <div className={s.acciones}>
        {entryUrl ? (
          <a href={entryUrl} target="_blank" rel="noopener noreferrer" className={enlace}>
            <PlaceOutlinedIcon aria-hidden="true" fontSize="inherit" />
            Entrada en mapa
          </a>
        ) : null}
        {exitUrl ? (
          <a href={exitUrl} target="_blank" rel="noopener noreferrer" className={enlace}>
            <PlaceOutlinedIcon aria-hidden="true" fontSize="inherit" />
            Salida en mapa
          </a>
        ) : salidaSinUbicacion ? (
          <span className={s.nota}>Salida sin ubicación</span>
        ) : null}
        {canViewTrajectory ? (
          <Button
            size="sm"
            variant="tertiary"
            className={s.accionFin}
            iconStart={<RouteOutlinedIcon fontSize="inherit" />}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? "Ocultar recorrido" : "Recorrido del día"}
          </Button>
        ) : null}
      </div>

      {open && canViewTrajectory ? (
        <div className={s.cuerpo}>
          {loading ? (
            <SkeletonRows rows={3} label="Cargando recorrido" />
          ) : failed ? (
            <Alert
              tone="danger"
              dense
              action={
                <Button size="sm" variant="secondary" onClick={() => void load()}>
                  Reintentar
                </Button>
              }
            >
              No se pudo cargar el recorrido.
            </Alert>
          ) : (
            <>
              <RecorridoDia attendances={attendances} trajectory={trajectory} enJornada={!attendances?.some((a) => a.type === "salida")} />
              <GpsTrajectoryPreview trajectory={trajectory} attendances={attendances} compact />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
