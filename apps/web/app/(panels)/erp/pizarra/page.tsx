"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import OutboxOutlinedIcon from "@mui/icons-material/OutboxOutlined";
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined";
import MonitorOutlinedIcon from "@mui/icons-material/MonitorOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import { Alert, Button, EmptyState, PageHead, Skeleton, Tabs } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import MisActividadesView from "@/components/pizarra/MisActividadesView";
import AsignadasPorMiView from "@/components/pizarra/AsignadasPorMiView";
import SolicitudesEquipoView from "@/components/pizarra/SolicitudesEquipoView";
import FlujoKpiStrip from "@/components/pizarra/FlujoKpiStrip";
import CentroOperativo from "@/components/pizarra/CentroOperativo";
import EquipoPersonaCard, { rejillaEquipo } from "@/components/pizarra/EquipoPersonaCard";
import ResumenEquipo from "@/components/pizarra/ResumenEquipo";
import { hayFlujo } from "@/components/pizarra/equipo-estado";
import { RangoSelector } from "@/components/pizarra/PizarraKpi";
import { isCeoEmail } from "@/lib/activity-kinds";
import {
  fetchTeamBoard,
  type BoardRange,
  type RangoPreset,
  type TeamBoardResponse,
} from "@/lib/team-board-api";
import p from "./pizarra.module.css";

/** Actividades: lo mío, mi equipo, lo que repartí y solicitudes entre pares. */
type Vista = "mias" | "equipo" | "asignadas" | "solicitudes";
const VISTA_KEY = "nx-actividades-vista";

function TarjetasCargando() {
  return (
    <div className={rejillaEquipo} aria-busy="true" aria-label="Cargando al equipo">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className={p.esqueleto}>
          <Skeleton width={74} height={74} radius={37} />
          <Skeleton width="70%" height={12} />
          <Skeleton width="50%" height={10} />
          <Skeleton width="90%" height={10} />
        </div>
      ))}
    </div>
  );
}


const PESTANAS = [
  { id: "mias" as const, label: "Mis actividades", icon: TaskAltIcon },
  { id: "equipo" as const, label: "Mi equipo", icon: GroupsOutlinedIcon },
  { id: "asignadas" as const, label: "Asignadas por mí", icon: OutboxOutlinedIcon },
  { id: "solicitudes" as const, label: "Solicitudes de equipo", icon: HandshakeOutlinedIcon },
];

export default function PizarraPage() {
  const { token, user } = useUser();
  const [data, setData] = useState<TeamBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("mias");
  const [preset, setPreset] = useState<RangoPreset>("hoy");
  const [rango, setRango] = useState<BoardRange>({});
  /** Modo centro operativo: la pizarra a pantalla completa para la pared. */
  const [centro, setCentro] = useState(false);

  // ?vista=mias|equipo|asignadas manda (enlaces viejos de Mis actividades); si no, la última elegida.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("vista");
      const guardada = window.localStorage.getItem(VISTA_KEY);
      const valida = (v: string | null): v is Vista =>
        v === "mias" || v === "equipo" || v === "asignadas" || v === "solicitudes";
      setVista(valida(q) ? q : valida(guardada) ? guardada : "mias");
    } catch {
      /* sin storage: queda «mias» */
    }
  }, []);

  const desde = rango.desde ?? null;
  const hasta = rango.hasta ?? null;
  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setError("Inicia sesión para ver Actividades.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await fetchTeamBoard(token, { desde, hasta }));
    } catch (e) {
      setError(formatApiError(e, "No se pudo cargar Actividades"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token, desde, hasta]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token) return;
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [token, load]);

  const users = useMemo(() => {
    const list = data?.users ?? [];
    const me = user?.id;
    if (me == null) return list;
    return [...list].sort((a, b) => {
      if (a.id === me) return -1;
      if (b.id === me) return 1;
      return 0;
    });
  }, [data?.users, user?.id]);

  const isCeo = isCeoEmail(user?.email);
  const otros = users.filter((u) => u.id !== user?.id).length;
  // Las vistas solo para quien tiene gente a su cargo (según su tablero). Los demás, directo su lista.
  const tieneEquipo = otros > 0;
  const cargandoEquipo = !isCeo && data == null && !error;
  const sinEquipo = !isCeo && !tieneEquipo && (data != null || Boolean(error));
  // Christian solo asigna: ve el tablero y lo que repartió. Encargados con subordinados,
  // además lo suyo.
  const pestanas: Vista[] = isCeo
    ? ["equipo", "asignadas", "solicitudes"]
    : tieneEquipo
      ? ["mias", "equipo", "asignadas", "solicitudes"]
      : ["mias", "solicitudes"];
  const conPestanas = pestanas.length > 0;
  const vistaActiva: Vista = conPestanas && pestanas.includes(vista) ? vista : pestanas[0] ?? "equipo";
  const verMias = vistaActiva === "mias";
  const verEquipo = vistaActiva === "equipo";
  const verAsignadas = vistaActiva === "asignadas";
  const verSolicitudes = vistaActiva === "solicitudes";

  const cambiarVista = (v: Vista) => {
    setVista(v);
    if (v !== "equipo") setCentro(false);
    try {
      window.localStorage.setItem(VISTA_KEY, v);
    } catch {
      /* sin storage */
    }
  };

  if (cargandoEquipo) {
    return (
      <div className={p.pagina}>
        <PageHead title="Actividades" />
        <TarjetasCargando />
      </div>
    );
  }

  if (sinEquipo && vistaActiva === "solicitudes") {
    return (
      <div className={p.pagina}>
        <PageHead
          title="Actividades"
          tabs={
            <Tabs
              ariaLabel="Vista de actividades"
              items={PESTANAS.filter((t) => t.id === "mias" || t.id === "solicitudes")}
              value={vistaActiva}
              onChange={cambiarVista}
            />
          }
        />
        <SolicitudesEquipoView token={token} />
      </div>
    );
  }

  if (sinEquipo && vistaActiva === "mias") {
    return (
      <div className={p.pagina}>
        <PageHead
          title="Actividades"
          tabs={
            <Tabs
              ariaLabel="Vista de actividades"
              items={PESTANAS.filter((t) => t.id === "mias" || t.id === "solicitudes")}
              value={vistaActiva}
              onChange={cambiarVista}
            />
          }
        />
        <MisActividadesView />
      </div>
    );
  }

  if (sinEquipo) {
    return <MisActividadesView />;
  }

  // Regla 7: el flujo del periodo con todo en cero no informa. Solo se pinta si
  // hay movimiento real, y detrás de la gente: la gente es lo que se viene a ver.
  const flujo =
    data?.workflow && hayFlujo(data.workflow) ? <FlujoKpiStrip workflow={data.workflow} /> : null;

  return (
    <div className={p.pagina}>
      <PageHead
        title="Actividades"
        actions={
          verMias ? null : (
            <>
              {verEquipo ? (
                <Button
                  variant="primary"
                  onClick={() => setCentro(true)}
                  disabled={users.length === 0}
                  title="Pantalla completa para dejarla puesta en una pantalla de la oficina"
                >
                  <MonitorOutlinedIcon aria-hidden="true" />
                  Centro operativo
                </Button>
              ) : null}
              <Button onClick={() => void load()} disabled={loading || !token}>
                <RefreshIcon aria-hidden="true" />
                Actualizar
              </Button>
            </>
          )
        }
        tabs={
          conPestanas ? (
            <Tabs
              ariaLabel="Vista de actividades"
              items={PESTANAS.filter((t) => pestanas.includes(t.id))}
              value={vistaActiva}
              onChange={cambiarVista}
            />
          ) : null
        }
      />

      {verMias ? (
        <MisActividadesView />
      ) : verSolicitudes ? (
        <SolicitudesEquipoView token={token} />
      ) : (
        <>
          <div className={p.filtros}>
            <RangoSelector
              preset={preset}
              rango={rango}
              onChange={(np, r) => {
                setPreset(np);
                setRango(np === "hoy" ? {} : r);
              }}
            />
          </div>

          {verAsignadas ? (
            <>
              <AsignadasPorMiView token={token} rango={preset === "hoy" ? {} : rango} />
              {flujo}
            </>
          ) : (
            <>
              <ResumenEquipo users={users} />

              {loading && !data ? (
                <TarjetasCargando />
              ) : error ? (
                <Alert tone="danger" role="alert">
                  {error}
                </Alert>
              ) : users.length === 0 ? (
                <EmptyState icon={<GroupsOutlinedIcon />} title="Nadie en tu equipo" />
              ) : (
                <div className={rejillaEquipo}>
                  {users.map((u) => (
                    <EquipoPersonaCard key={u.id} user={u} isSelf={u.id === user?.id} />
                  ))}
                </div>
              )}

              {flujo}

              {centro ? (
                <CentroOperativo
                  users={users}
                  onCerrar={() => setCentro(false)}
                  onRefrescar={() => void load()}
                />
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
