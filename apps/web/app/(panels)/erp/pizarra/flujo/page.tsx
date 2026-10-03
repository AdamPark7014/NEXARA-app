"use client";

import { useCallback, useEffect, useState } from "react";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import AlarmOffOutlinedIcon from "@mui/icons-material/AlarmOffOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  InfoPopover,
  ModulePage,
  SkeletonRows,
  Stat,
  StatRow,
} from "@/components/base";
import { useUser } from "@/components/UserContext";
import { RangoSelector } from "@/components/pizarra/PizarraKpi";
import { semaforoATiempo } from "@/components/pizarra/FlujoKpiStrip";
import { formatApiError } from "@/lib/erp-api";
import { erpFetch } from "@/lib/erp-api";
import {
  formatPct,
  rangoDePreset,
  rangeQuery,
  type BoardRange,
  type RangoPreset,
  type WorkflowPipeline,
} from "@/lib/team-board-api";
import c from "@/components/pizarra/comun.module.css";
import s from "./flujo.module.css";

type FlujoResponse = {
  scope: string;
  desde: string;
  hasta: string;
  workflow: WorkflowPipeline;
};

/** «12 de 40 asignadas» (sin asignadas no hay de dónde sacar la proporción). */
function deAsignadas(n: number, total: number): string {
  if (total <= 0) return "del periodo";
  return `${Math.round((n / total) * 100)} % de las asignadas`;
}

export default function FlujoActividadesPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const [preset, setPreset] = useState<RangoPreset>("semana");
  const [rango, setRango] = useState<BoardRange>(() => rangoDePreset("semana"));
  const [data, setData] = useState<FlujoResponse | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      setData(await erpFetch<FlujoResponse>(`me/kpis/flujo${rangeQuery(rango)}`, token));
    } catch (e) {
      // Un fallo al refrescar no borra las cifras que ya se veían: solo se avisa.
      setError(formatApiError(e, "No se pudo cargar el flujo"));
    } finally {
      setCargando(false);
    }
  }, [token, rango]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const w = data?.workflow;

  return (
    <div className={s.pagina}>
      <ModulePage
        back={{ href: "/erp/pizarra", label: "Actividades" }}
        title="Flujo de actividades"
        description="Cómo avanzan las actividades del periodo: de asignadas a cerradas, y cuántas a tiempo."
        tertiaryActions={
          <InfoPopover label="¿Cómo se lee?" title="Cómo avanzan las actividades">
            <ul>
              <li>Asignadas → Iniciadas → Con evidencias → Cerradas.</li>
              <li>Rechazadas entre compañeros: solicitudes que un compañero no aceptó (no cuenta las que asigna el jefe).</li>
              <li>A tiempo: se cerró antes del fin del periodo o de la fecha máxima.</li>
            </ul>
          </InfoPopover>
        }
        secondaryActions={
          <RangoSelector
            preset={preset}
            rango={rango}
            onChange={(p, r) => {
              setPreset(p);
              setRango(r);
            }}
          />
        }
        before={
          error ? (
            <Alert
              tone={data ? "warning" : "danger"}
              role="alert"
              action={
                <Button size="sm" className={c.tap} onClick={() => void cargar()} loading={cargando}>
                  Reintentar
                </Button>
              }
            >
              {data ? `${error}. Se muestra lo último que cargó.` : error}
            </Alert>
          ) : null
        }
        card={false}
      >
        {cargando && !data ? (
          <Card>
            <SkeletonRows rows={4} label="Cargando el flujo" />
          </Card>
        ) : !w ? (
          error ? null : (
            <Card>
              <EmptyState
                icon={<InsightsOutlinedIcon />}
                tone="neutral"
                titleAs="h2"
                title="Sin datos de flujo en este rango"
                description="Prueba con otro rango de fechas."
              />
            </Card>
          )
        ) : (
          <div className={s.bloques}>
            <section aria-labelledby="flujo-embudo" className={s.bloque}>
              <h2 id="flujo-embudo" className={c.titulo}>
                Del encargo al cierre
              </h2>
              <StatRow cols={4} ariaLabel="Del encargo al cierre">
                <Stat
                  label="Asignadas"
                  value={w.assigned}
                  hint="en el periodo"
                  icon={<AssignmentOutlinedIcon />}
                  iconTone="neutral"
                  href="/erp/pizarra/flujo/assigned"
                />
                <Stat
                  label="Iniciadas"
                  value={w.started}
                  hint={deAsignadas(w.started, w.assigned)}
                  icon={<PlayCircleOutlineIcon />}
                  iconTone="info"
                  meter={w.assigned > 0 ? [{ value: w.started, tone: "info" }] : undefined}
                  meterMax={w.assigned || undefined}
                  href="/erp/pizarra/flujo/started"
                />
                <Stat
                  label="Con evidencias"
                  value={w.evidence}
                  hint={deAsignadas(w.evidence, w.assigned)}
                  icon={<PhotoCameraOutlinedIcon />}
                  iconTone="violet"
                  meter={w.assigned > 0 ? [{ value: w.evidence, tone: "violet" }] : undefined}
                  meterMax={w.assigned || undefined}
                  href="/erp/pizarra/flujo/evidence"
                />
                <Stat
                  label="Cerradas"
                  value={w.closed}
                  tone="brand"
                  hint={deAsignadas(w.closed, w.assigned)}
                  icon={<TaskAltIcon />}
                  iconTone="success"
                  meter={w.assigned > 0 ? [{ value: w.closed, tone: "success" }] : undefined}
                  meterMax={w.assigned || undefined}
                  href="/erp/pizarra/flujo/closed"
                />
              </StatRow>
            </section>

            <section aria-labelledby="flujo-tiempos" className={s.bloque}>
              <h2 id="flujo-tiempos" className={c.titulo}>
                Tiempos y rechazos
              </h2>
              <StatRow cols={4} ariaLabel="Tiempos y rechazos">
                <Stat
                  label="% a tiempo"
                  value={formatPct(w.slaPct)}
                  hint={`${w.slaOnTime} a tiempo · ${w.slaLate} tarde`}
                  icon={<TimerOutlinedIcon />}
                  iconTone={w.slaLate > 0 ? "warning" : "success"}
                  semaforo={semaforoATiempo(w.slaPct)}
                />
                <Stat
                  label="A tiempo"
                  value={w.slaOnTime}
                  tone="brand"
                  hint="cerradas dentro de su fecha"
                  icon={<TaskAltIcon />}
                  iconTone="success"
                  href="/erp/pizarra/flujo/slaOnTime"
                />
                <Stat
                  label="Tarde / vencidas"
                  value={w.slaLate}
                  tone={w.slaLate ? "danger" : "default"}
                  hint={w.slaLate ? "pasaron de su fecha máxima" : "ninguna tarde"}
                  icon={<AlarmOffOutlinedIcon />}
                  iconTone={w.slaLate ? "danger" : "neutral"}
                  href="/erp/pizarra/flujo/slaLate"
                />
                <Stat
                  label="Rechazadas entre compañeros"
                  value={w.peerRejected}
                  tone={w.peerRejected > 0 ? "warning" : "default"}
                  hint="solicitudes no aceptadas"
                  icon={<BlockOutlinedIcon />}
                  iconTone={w.peerRejected > 0 ? "warning" : "neutral"}
                  href="/erp/pizarra/flujo/peerRejected"
                />
              </StatRow>
            </section>
          </div>
        )}
      </ModulePage>
    </div>
  );
}
