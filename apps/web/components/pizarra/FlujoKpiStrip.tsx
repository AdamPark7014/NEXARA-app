"use client";

import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { ButtonLink, Stat, StatRow, type Semaforo } from "@/components/base";
import type { WorkflowPipeline } from "@/lib/team-board-api";
import { formatPct } from "@/lib/team-board-api";
import s from "./FlujoKpiStrip.module.css";

/** Semáforo del % a tiempo: ≥ 85 verde, ≥ 60 ámbar, menos rojo; sin cerradas, gris. */
export function semaforoATiempo(pct: number | null | undefined): Semaforo {
  if (pct == null || !Number.isFinite(pct)) return "gris";
  if (pct >= 85) return "verde";
  if (pct >= 60) return "ambar";
  return "rojo";
}

/** Franja de avance de actividades (mismo lenguaje visual que asistencias/indicadores). */
export default function FlujoKpiStrip({
  workflow,
  detalleHref = "/erp/pizarra/flujo",
}: {
  workflow: WorkflowPipeline;
  detalleHref?: string | null;
}) {
  return (
    <section className={s.flujo} aria-labelledby="flujo-del-periodo">
      <div className={s.cabeza}>
        <h2 id="flujo-del-periodo" className={s.titulo}>
          Flujo del periodo
        </h2>
        {detalleHref ? (
          <ButtonLink href={detalleHref} variant="ghost" size="sm" iconEnd={<ArrowForwardIcon />}>
            Ver detalle
          </ButtonLink>
        ) : null}
      </div>
      <StatRow cols={6} ariaLabel="Flujo del periodo">
        <Stat
          label="Asignadas"
          value={workflow.assigned}
          icon={<AssignmentOutlinedIcon />}
          iconTone="neutral"
          density="compact"
          href="/erp/pizarra/flujo/assigned"
        />
        <Stat
          label="Iniciadas"
          value={workflow.started}
          icon={<PlayCircleOutlineIcon />}
          iconTone="info"
          density="compact"
          href="/erp/pizarra/flujo/started"
        />
        <Stat
          label="Con evidencias"
          value={workflow.evidence}
          icon={<PhotoCameraOutlinedIcon />}
          iconTone="violet"
          density="compact"
          href="/erp/pizarra/flujo/evidence"
        />
        <Stat
          label="Cerradas"
          value={workflow.closed}
          tone="brand"
          icon={<TaskAltIcon />}
          iconTone="success"
          density="compact"
          href="/erp/pizarra/flujo/closed"
        />
        <Stat
          label="Rechazadas entre compañeros"
          value={workflow.peerRejected}
          tone={workflow.peerRejected > 0 ? "warning" : "default"}
          icon={<BlockOutlinedIcon />}
          iconTone={workflow.peerRejected > 0 ? "warning" : "neutral"}
          density="compact"
          href="/erp/pizarra/flujo/peerRejected"
        />
        <Stat
          label="A tiempo"
          value={formatPct(workflow.slaPct)}
          title={`${workflow.slaOnTime} a tiempo · ${workflow.slaLate} tarde — ver detalle para la lista`}
          hint={`${workflow.slaOnTime} a tiempo · ${workflow.slaLate} tarde`}
          tone={workflow.slaLate > 0 ? "danger" : "default"}
          icon={<TimerOutlinedIcon />}
          iconTone={workflow.slaLate > 0 ? "danger" : "success"}
          semaforo={semaforoATiempo(workflow.slaPct)}
          density="compact"
        />
      </StatRow>
    </section>
  );
}
