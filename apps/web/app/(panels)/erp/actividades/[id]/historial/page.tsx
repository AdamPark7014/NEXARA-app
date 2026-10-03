"use client";

// Historial de la actividad (incluye el registro de despacho). Vivía en
// /ops/activities/[id]/historial y Core la reexportaba; ahora vive aquí.
// Línea de tiempo v2 (`Timeline`), del suceso más reciente al más viejo.

import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "@/components/detail/DetailFrame";
import { Alert, Badge, Button, EmptyState, RecordSection, SkeletonRows, Timeline, TimelineItem, type TimelineState } from "@/components/base";
import { useActivityDetail } from "@/components/ops/ActivityDetailShell";
import { useUser } from "@/components/UserContext";
import { listActivityTimeline, type ActivityTimelineEvent } from "@/lib/ops-activities-api";
import { formatApiError } from "@/lib/erp-api";
import s from "./historial.module.css";
import type { SvgIconComponent } from "@mui/icons-material";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
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

/** El suceso más reciente va resaltado; una cancelación o una incidencia, en rojo. */
function timelineState(ev: ActivityTimelineEvent, idx: number): TimelineState {
  if (/cancel/i.test(ev.kind)) return "danger";
  if (idx === 0) return "current";
  if (/cumplida|revision/i.test(ev.kind)) return "done";
  return "default";
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
      setTimelineError(formatApiError(e, "No se pudo cargar el historial"));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [token, activity?.id]);

  useEffect(() => {
    void loadTimeline();
  }, [loadTimeline]);

  // La ficha (shell) ya pinta la carga y el error cuando la actividad no llegó.
  if (!activity) return null;

  const isCompleted = !!activity.fechaFinalizacion;

  return (
    <>
      {error ? (
        <Alert
          tone="danger"
          role="alert"
          action={
            <Button size="sm" variant="tertiary" onClick={reload}>
              Reintentar
            </Button>
          }
        >
          No se pudo actualizar: {error}
        </Alert>
      ) : null}
      <RecordSection
        title="Línea de tiempo unificada"
        subtitle={
          loading
            ? "Cargando historial…"
            : `${events.length} evento${events.length === 1 ? "" : "s"} · ${isCompleted ? "Finalizada" : activity.estatus}`
        }
      >
        {loading ? <SkeletonRows rows={4} label="Cargando historial" /> : null}
        {!loading && timelineError ? (
          <EmptyState
            tone="danger"
            icon={<ErrorOutlineIcon fontSize="inherit" />}
            title="Historial limitado"
            description={timelineError}
            action={
              <Button size="sm" variant="secondary" onClick={() => void loadTimeline()}>
                Reintentar
              </Button>
            }
          />
        ) : null}

        {!loading && !timelineError && events.length === 0 ? (
          <EmptyState
            tone="neutral"
            icon={<ScheduleOutlinedIcon fontSize="inherit" />}
            title="Sin eventos"
            description="Aún no hay movimientos registrados en esta actividad."
          />
        ) : null}

        {!loading && events.length > 0 ? (
          <Timeline ariaLabel="Historial de la actividad">
            {events.map((ev, idx) => {
              const EvIcon = timelineIcon(ev);
              return (
                <TimelineItem
                  key={ev.id}
                  state={timelineState(ev, idx)}
                  icon={<EvIcon fontSize="inherit" />}
                  title={ev.title}
                  meta={`${relativeTime(ev.at)} · ${formatDateTime(ev.at)}`}
                >
                  <div className={s.sub}>
                    <Badge tone="neutral" size="sm">
                      {ev.kind}
                    </Badge>
                    {ev.subtitle ? <span>{ev.subtitle}</span> : null}
                  </div>
                </TimelineItem>
              );
            })}
          </Timeline>
        ) : null}
      </RecordSection>
    </>
  );
}
