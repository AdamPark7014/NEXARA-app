"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, EmptyState, InfoPopover, PageHead, SkeletonRows, Stat, StatRow } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { RangoSelector } from "@/components/pizarra/PizarraKpi";
import FlujoKpiStrip from "@/components/pizarra/FlujoKpiStrip";
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

type FlujoResponse = {
  scope: string;
  desde: string;
  hasta: string;
  workflow: WorkflowPipeline;
};

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
      setData(null);
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
    <div style={{ maxWidth: 1120, margin: "0 auto" }}>
      <PageHead
        back={{ href: "/erp/pizarra", label: "Actividades" }}
        title="Flujo de actividades"
        actions={
          <>
            <RangoSelector
              preset={preset}
              rango={rango}
              onChange={(p, r) => {
                setPreset(p);
                setRango(r);
              }}
            />
            <InfoPopover label="¿Cómo se lee?" title="Pipeline">
              <ul>
                <li>Asignadas → Iniciadas → En evidencia → Cerradas.</li>
                <li>Peer rechazadas: solicitudes de equipo rechazadas (no OT del jefe).</li>
                <li>SLA: contra fin de periodo o fecha máxima.</li>
              </ul>
            </InfoPopover>
          </>
        }
      />

      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}

      {cargando && !data ? <SkeletonRows rows={4} /> : null}

      {!cargando && !data && !error ? (
        <EmptyState title="Sin datos de flujo en este rango" />
      ) : null}

      {w ? (
        <>
          <FlujoKpiStrip workflow={w} detalleHref={null} />
          <StatRow cols={3}>
            <Stat label="A tiempo (SLA)" value={w.slaOnTime} tone="brand" />
            <Stat label="Tarde / vencidas" value={w.slaLate} tone={w.slaLate ? "danger" : "default"} />
            <Stat label="% a tiempo" value={formatPct(w.slaPct)} />
          </StatRow>
        </>
      ) : null}
    </div>
  );
}
