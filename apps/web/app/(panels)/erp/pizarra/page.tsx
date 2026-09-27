"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import CelebrationOutlinedIcon from "@mui/icons-material/CelebrationOutlined";
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
import ResumenEquipo, { type FiltroEquipo } from "@/components/pizarra/ResumenEquipo";
import { ARO_DE_ESTADO, ARO_LABEL, hayFlujo } from "@/components/pizarra/equipo-estado";
import { RangoSelector } from "@/components/pizarra/PizarraKpi";
import { isCeoEmail } from "@/lib/activity-kinds";
import { formatHourMinute } from "@/lib/activity-labels";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getActivitiesSectionConfig } from "@/lib/section-views";
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
  /** Falló un refresco con datos ya en pantalla: se conservan y solo se avisa. */
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [filtro, setFiltro] = useState<FiltroEquipo>("todos");
  const hayDatos = useRef(false);
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
    try {
      const board = await fetchTeamBoard(token, { desde, hasta });
      hayDatos.current = true;
      setData(board);
      setError(null);
      setRefreshError(null);
      setUpdatedAt(Date.now());
    } catch (e) {
      const msg = formatApiError(e, "No se pudo cargar Actividades");
      if (hayDatos.current) setRefreshError(msg);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }, [token, desde, hasta]);

  useEffect(() => {
    void load();
  }, [load]);

  // Cada 30 s mientras la pestaña está a la vista; al volver a ella, refresca de inmediato.
  useEffect(() => {
    if (!token) return;
    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };
    const id = window.setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
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

  const visibles = useMemo(
    () => (filtro === "todos" ? users : users.filter((u) => (ARO_DE_ESTADO[u.status] ?? "retraso") === filtro)),
    [users, filtro],
  );

  const actCfg = getActivitiesSectionConfig(user);
  const puedeAsignar = hasPermission(user, PERMISSIONS.ACTIVITIES_MANAGE) && actCfg.canCreate && actCfg.canAssign;

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
                  className={p.soloEscritorio}
                  onClick={() => setCentro(true)}
                  disabled={users.length === 0}
                  title="Pantalla completa para dejarla puesta en una pantalla de la oficina"
                >
                  <MonitorOutlinedIcon aria-hidden="true" />
                  Centro operativo
                </Button>
              ) : null}
              {updatedAt ? (
                <span className={p.actualizado} aria-live="polite">
                  Actualizado {formatHourMinute(updatedAt)}
                </span>
              ) : null}
              <Button className={p.tap} onClick={() => void load()} disabled={loading || !token} aria-busy={loading}>
                <RefreshIcon aria-hidden="true" className={loading ? p.girando : undefined} />
                {loading ? "Actualizando…" : "Actualizar"}
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
              {refreshError && data ? (
                <div className={p.aviso}>
                  <Alert
                    tone="warning"
                    role="status"
                    action={
                      <Button className={p.tap} onClick={() => void load()} disabled={loading}>
                        Reintentar
                      </Button>
                    }
                  >
                    No se pudo actualizar. Sigues viendo lo de las {formatHourMinute(updatedAt)}.
                  </Alert>
                </div>
              ) : null}

              <ResumenEquipo users={users} filtro={filtro} onFiltro={setFiltro} />

              {loading && !data ? (
                <TarjetasCargando />
              ) : error && !data ? (
                <Alert
                  tone="danger"
                  role="alert"
                  action={
                    <Button variant="primary" className={p.tap} onClick={() => void load()} disabled={loading}>
                      Reintentar
                    </Button>
                  }
                >
                  {error}
                </Alert>
              ) : users.length === 0 ? (
                <EmptyState
                  icon={<GroupsOutlinedIcon />}
                  title="Nadie en tu equipo todavía"
                  description="Cuando tengas gente a tu cargo, aquí verás qué está haciendo cada quien."
                />
              ) : visibles.length === 0 ? (
                <EmptyState
                  icon={filtro === "retraso" ? <CelebrationOutlinedIcon /> : <GroupsOutlinedIcon />}
                  title={
                    filtro === "retraso"
                      ? "Nadie con retraso 🎉"
                      : `Nadie en «${filtro === "todos" ? "Todos" : ARO_LABEL[filtro]}» ahora`
                  }
                  action={
                    <Button className={p.tap} onClick={() => setFiltro("todos")}>
                      Ver a todo el equipo
                    </Button>
                  }
                />
              ) : (
                <div className={rejillaEquipo}>
                  {visibles.map((u) => {
                    const yo = u.id === user?.id;
                    return (
                      <EquipoPersonaCard
                        key={u.id}
                        user={u}
                        isSelf={yo}
                        asignarHref={puedeAsignar && !yo ? `/erp/pizarra/${u.id}/asignar` : undefined}
                      />
                    );
                  })}
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
