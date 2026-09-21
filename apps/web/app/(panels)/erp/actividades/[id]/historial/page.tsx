"use client";

// Historial de la actividad (incluye el registro de despacho). Vivía en
// /ops/activities/[id]/historial y Core la reexportaba; ahora vive aquí.

import { useCallback, useEffect, useState } from "react";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import { Tag } from "@/components/ui/DataTable";
import { DetailError, DetailSection, formatDateTime } from "@/components/detail/DetailFrame";
import { useActivityDetail } from "@/components/ops/ActivityDetailShell";
import { useUser } from "@/components/UserContext";
import { listActivityTimeline, type ActivityTimelineEvent } from "@/lib/ops-activities-api";
import type { SvgIconComponent } from "@mui/icons-material";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import LoginIcon from "@mui/icons-material/Login";
import LogoutIcon from "@mui/icons-material/Logout";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import EngineeringOutlinedIcon from "@mui/icons-material/EngineeringOutlined";
import UndoIcon from "@mui/icons-material/Undo";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import RateReviewOutlinedIcon from "@mui/icons-material/RateReviewOutlined";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";

/** La API manda `icon` como emoji; lo traducimos por code point a un icono MUI. */
const TIMELINE_ICON_BY_CODEPOINT: Record<number, SvgIconComponent> = {
  0x1f4cb: AssignmentOutlinedIcon, // estado
  0x1f680: PlayCircleOutlineIcon, // arrancó
  0x1f4c5: EventOutlinedIcon, // agenda
  0x1f6aa: LoginIcon, // ACS entrada
  0x1f6b6: LogoutIcon, // ACS salida
  0x1f464: SwapHorizIcon, // reasignación
  0x1f4e8: SendOutlinedIcon, // la reparte
  0x1f477: EngineeringOutlinedIcon, // ejecuta
  0x21a9: UndoIcon, // devuelta
  0x1f551: EventRepeatIcon, // reprogramada
  0x26a0: WarningAmberOutlinedIcon, // incidencia
  0x2705: TaskAltIcon, // resuelta / cumplida / aprobada
  0x1f4a1: LightbulbOutlinedIcon, // recomendación
  0x1f4e6: Inventory2OutlinedIcon, // material
  0x1f4cd: PlaceOutlinedIcon, // check-in / check-out
  0x1f4dd: DescriptionOutlinedIcon, // hoja de servicio
  0x1f4f8: PhotoCameraOutlinedIcon, // evidencia revisada
  0x1f6ab: BlockOutlinedIcon, // cancelada (con motivo)
};

const TIMELINE_ICON_BY_KIND: Record<string, SvgIconComponent> = {
  estado: AssignmentOutlinedIcon,
  agenda: EventOutlinedIcon,
  acs: LoginIcon,
  "reasignación": SwapHorizIcon,
  enviada: SendOutlinedIcon,
  despacho: UndoIcon,
  reprogramada: EventRepeatIcon,
  incidencia: WarningAmberOutlinedIcon,
  "recomendación": LightbulbOutlinedIcon,
  material: Inventory2OutlinedIcon,
  evidencia: PhotoCameraOutlinedIcon,
  cumplida: TaskAltIcon,
  revision: RateReviewOutlinedIcon,
  cancelada: BlockOutlinedIcon,
};

function timelineIcon(ev: ActivityTimelineEvent): SvgIconComponent {
  const cp = ev.icon ? ev.icon.codePointAt(0) : undefined;
  return (cp !== undefined ? TIMELINE_ICON_BY_CODEPOINT[cp] : undefined) ?? TIMELINE_ICON_BY_KIND[ev.kind] ?? ScheduleOutlinedIcon;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(Math.abs(diff) / 60000);
  if (mins < 2) return "Justo ahora";
  // Eventos programados (fecha futura): «En 40 min», no «Justo ahora».
  const fmt = (v: string) => (diff < 0 ? `En ${v}` : `Hace ${v}`);
  if (mins < 60) return fmt(`${mins} min`);
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return fmt(`${hrs}h`);
  return fmt(`${Math.round(hrs / 24)}d`);
}

export default function ActivityHistoryPage() {
  const { activity, error, reload } = useActivityDetail();
  const { user } = useUser();
  const token = user?.token ?? "";
  const [events, setEvents] = useState<ActivityTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  const loadTimeline = useCallback(async () => {
    if (!token || !activity?.id) return;
    setLoading(true);
    setTimelineError(null);
    try {
      const data = await listActivityTimeline(token, activity.id);
      setEvents(data.events ?? []);
    } catch (e) {
      setTimelineError(e instanceof Error ? e.message : "No se pudo cargar el historial");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [token, activity?.id]);

  useEffect(() => {
    void loadTimeline();
  }, [loadTimeline]);

  if (error) return <DetailError message={error} onRetry={reload} />;
  if (!activity) return null;

  const isCompleted = !!activity.fechaFinalizacion;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 14 }}>
        <KpiCard label="Eventos" value={events.length} icon={<EventOutlinedIcon fontSize="inherit" aria-hidden="true" />} />
        <KpiCard label="Estado" value={isCompleted ? "Finalizada" : activity.estatus} icon={<SettingsOutlinedIcon fontSize="inherit" aria-hidden="true" />} variant={isCompleted ? "positive" : "accent"} />
      </div>

      <DetailSection title="Línea de tiempo unificada">
        {loading && <EmptyState icon={<HourglassTopIcon fontSize="inherit" aria-hidden="true" />} title="Cargando historial…" description="" />}
        {timelineError && (
          <EmptyState
            icon={<ErrorOutlineIcon fontSize="inherit" aria-hidden="true" />}
            title="Historial limitado"
            description={timelineError}
            action={<Button size="sm" variant="secondary" onClick={() => void loadTimeline()}>Reintentar</Button>}
          />
        )}

        {!loading && !timelineError && events.length === 0 && (
          <EmptyState icon={<ScheduleOutlinedIcon fontSize="inherit" aria-hidden="true" />} title="Sin eventos" description="Aún no hay movimientos registrados en esta actividad." />
        )}

        {!loading && events.length > 0 && (
          <div style={{ position: "relative", paddingLeft: 28 }}>
            <div style={{ position: "absolute", left: 9, top: 10, bottom: 10, width: 2, background: "var(--border)" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {events.map((ev, idx) => {
                const EvIcon = timelineIcon(ev);
                return (
                <div key={ev.id} style={{ position: "relative", paddingBottom: idx < events.length - 1 ? 16 : 0 }}>
                  <div
                    style={{
                      position: "absolute",
                      left: -28,
                      top: 12,
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "var(--primary)",
                      border: "2px solid var(--surface)",
                      zIndex: 1,
                    }}
                  />
                  <div
                    style={{
                      padding: "12px 14px",
                      background: idx === 0 ? "color-mix(in srgb, var(--primary) 5%, var(--surface))" : "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                        <EvIcon aria-hidden="true" sx={{ fontSize: 16, color: "var(--primary)", flexShrink: 0 }} />
                        <span>{ev.title}</span>
                      </div>
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{relativeTime(ev.at)}</span>
                    </div>
                    <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
                      <Tag variant="neutral">{ev.kind}</Tag>
                      {ev.subtitle && <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{ev.subtitle}</span>}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>{formatDateTime(ev.at)}</div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        )}
      </DetailSection>
    </>
  );
}
