"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import CelebrationOutlinedIcon from "@mui/icons-material/CelebrationOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import OutboxOutlinedIcon from "@mui/icons-material/OutboxOutlined";
import HandshakeOutlinedIcon from "@mui/icons-material/HandshakeOutlined";
import RateReviewOutlinedIcon from "@mui/icons-material/RateReviewOutlined";
import MonitorOutlinedIcon from "@mui/icons-material/MonitorOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import CloseIcon from "@mui/icons-material/Close";
import {
  Alert,
  Button,
  EmptyState,
  FilterChip,
  FilterChips,
  ModulePage,
  ModuleToolbar,
  SearchInput,
  Skeleton,
  Tabs,
  type TabItem,
} from "@/components/base";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import { getSocketBaseUrl } from "@/lib/api-base";
import { createRealtimeSocket } from "@/lib/realtime-socket";
import MisActividadesView from "@/components/pizarra/MisActividadesView";
import AsignadasPorMiView from "@/components/pizarra/AsignadasPorMiView";
import SolicitudesEquipoView from "@/components/pizarra/SolicitudesEquipoView";
import EnEsperaRevisionView, { type VerRevisiones } from "@/components/pizarra/EnEsperaRevisionView";
import { fetchRevisiones, type RevisionesResponse } from "@/lib/revisiones-api";
import FlujoKpiStrip from "@/components/pizarra/FlujoKpiStrip";
import CentroOperativo from "@/components/pizarra/CentroOperativo";
import EquipoPersonaCard, { rejillaEquipo } from "@/components/pizarra/EquipoPersonaCard";
import LineaDelDia, { ConmutadorModo, type ModoEquipo } from "@/components/pizarra/LineaDelDia";
import ResumenEquipo, { type FiltroEquipo } from "@/components/pizarra/ResumenEquipo";
import AtencionEquipo from "@/components/pizarra/AtencionEquipo";
import AsistenteIA from "@/components/pizarra/AsistenteIA";
import { ARO_DE_ESTADO, ARO_LABEL, hayFlujo, resumenEquipo } from "@/components/pizarra/equipo-estado";
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
  type TeamBoardUser,
} from "@/lib/team-board-api";
import c from "@/components/pizarra/comun.module.css";
import p from "./pizarra.module.css";

/** Actividades: lo mío, mi equipo, lo que repartí, lo que espera mi revisión y solicitudes entre pares. */
type Vista = "mias" | "equipo" | "asignadas" | "revision" | "solicitudes";
const VISTAS: readonly Vista[] = ["mias", "equipo", "asignadas", "revision", "solicitudes"];
const VISTA_KEY = "nx-actividades-vista";
/** «Mi equipo»: tarjetas o línea del día; se recuerda por navegador. */
const MODO_KEY = "nx-equipo-modo";

const DESCRIPCION: Record<Vista, string> = {
  mias: "Lo que te toca hoy, en el orden en que lo vas a hacer.",
  equipo: "Quién trabaja, quién va con retraso y qué espera tu revisión.",
  asignadas: "Lo que repartiste y cómo va cada persona.",
  revision: "Evidencias que tu equipo ya envió y esperan tu visto bueno: revísalas y califícalas.",
  solicitudes: "Actividades que les pides a tus compañeros y las que te piden a ti.",
};

/** La URL dice en qué pestaña estás: «‹ regresar» desde una actividad vuelve a la misma. */
function reflejarEnUrl(cambios: Record<string, string | null>) {
  try {
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(cambios)) {
      if (v == null) url.searchParams.delete(k);
      else url.searchParams.set(k, v);
    }
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  } catch {
    /* sin History API: la pestaña vale para esta visita */
  }
}

function TarjetasCargando() {
  return (
    <div className={[rejillaEquipo, p.relleno].join(" ")} aria-busy="true" aria-label="Cargando al equipo">
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

/** «José Ramírez» encuentra «jose», «ramirez» o «técnico» sin pelear con acentos. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const PESTANAS: ReadonlyArray<TabItem<Vista>> = [
  { id: "mias", label: "Mis actividades", icon: TaskAltIcon },
  { id: "equipo", label: "Mi equipo", icon: GroupsOutlinedIcon },
  { id: "asignadas", label: "Asignadas por mí", icon: OutboxOutlinedIcon },
  { id: "revision", label: "En espera de revisión", icon: RateReviewOutlinedIcon },
  { id: "solicitudes", label: "Solicitudes de equipo", icon: HandshakeOutlinedIcon },
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
  const [busqueda, setBusqueda] = useState("");
  const hayDatos = useRef(false);
  const [vista, setVista] = useState<Vista>("mias");
  const [preset, setPreset] = useState<RangoPreset>("hoy");
  const [rango, setRango] = useState<BoardRange>({});
  /** Modo centro operativo: la pizarra a pantalla completa para la pared. */
  const [centro, setCentro] = useState(false);
  const [modo, setModo] = useState<ModoEquipo>("tarjetas");
  // «En espera de revisión»: se carga con la pizarra para que la pestaña lleve su número.
  const [revisiones, setRevisiones] = useState<RevisionesResponse | null>(null);
  const [cargandoRevisiones, setCargandoRevisiones] = useState(false);
  const [errorRevisiones, setErrorRevisiones] = useState<string | null>(null);
  const [verRevisiones, setVerRevisiones] = useState<VerRevisiones>("pendientes");

  useEffect(() => {
    try {
      if (window.localStorage.getItem(MODO_KEY) === "linea") setModo("linea");
    } catch {
      /* sin storage: tarjetas */
    }
  }, []);

  const cambiarModo = (m: ModoEquipo) => {
    setModo(m);
    try {
      window.localStorage.setItem(MODO_KEY, m);
    } catch {
      /* sin storage: vale para esta visita */
    }
  };

  // ?vista=mias|equipo|asignadas|revision manda (enlaces viejos y «‹ regresar» desde una
  // actividad); si no, la última elegida. `&ver=revisadas` abre lo que ya revisaste.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("vista");
      const valida = (v: string | null): v is Vista => v != null && (VISTAS as readonly string[]).includes(v);
      if (params.get("ver") === "revisadas") setVerRevisiones("revisadas");
      if (valida(q)) {
        setVista(q);
        return;
      }
      const guardada = window.localStorage.getItem(VISTA_KEY);
      setVista(valida(guardada) ? guardada : "mias");
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

  const cargarRevisiones = useCallback(async () => {
    if (!token) return;
    setCargandoRevisiones(true);
    try {
      setRevisiones(await fetchRevisiones(token));
      setErrorRevisiones(null);
    } catch (e) {
      // Con lista ya en pantalla se conserva y solo se avisa (la vista decide cómo).
      setErrorRevisiones(formatApiError(e, "No se pudo cargar lo que espera revisión"));
    } finally {
      setCargandoRevisiones(false);
    }
  }, [token]);

  useEffect(() => {
    void cargarRevisiones();
  }, [cargarRevisiones]);

  const recargar = useCallback(() => {
    void load();
    void cargarRevisiones();
  }, [load, cargarRevisiones]);

  // Cada 30 s mientras la pestaña está a la vista; al volver a ella, refresca de inmediato.
  useEffect(() => {
    if (!token) return;
    const tick = () => {
      if (document.visibilityState === "visible") recargar();
    };
    const id = window.setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [token, recargar]);

  // La pizarra también escucha el socket: al borrar (o mover) una actividad
  // sale de Mi equipo sin esperar los 30 s del refresco; al enviar o revisar
  // evidencia, «En espera de revisión» también se pone al día.
  useEffect(() => {
    if (!token) return;
    const socket = createRealtimeSocket(getSocketBaseUrl(), { auth: { token } });
    const onEntity = (payload?: { model?: string }) => {
      if (payload?.model && payload.model !== "Activity") return;
      recargar();
    };
    socket.on("entity:updated", onEntity);
    socket.on("activity:updated", () => recargar());
    return () => {
      socket.disconnect();
    };
  }, [token, recargar]);

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

  const conteo = useMemo(() => resumenEquipo(users), [users]);

  const visibles = useMemo(() => {
    const q = normalizar(busqueda);
    return users.filter((u) => {
      if (filtro !== "todos" && (ARO_DE_ESTADO[u.status] ?? "retraso") !== filtro) return false;
      if (!q) return true;
      return normalizar(`${u.nombre} ${u.puesto ?? ""}`).includes(q);
    });
  }, [users, filtro, busqueda]);

  const actCfg = getActivitiesSectionConfig(user);
  const puedeAsignar = hasPermission(user, PERMISSIONS.ACTIVITIES_MANAGE) && actCfg.canCreate && actCfg.canAssign;
  /** «＋ Asignar» de la tarjeta y del panel «Para atender»: con permiso y nunca a uno mismo. */
  const asignarA = (u: TeamBoardUser): string | undefined =>
    puedeAsignar && u.id !== user?.id ? `/erp/pizarra/${u.id}/asignar` : undefined;

  const isCeo = isCeoEmail(user?.email);
  const otros = users.filter((u) => u.id !== user?.id).length;
  // Las vistas solo para quien tiene gente a su cargo (según su tablero). Los demás, directo su lista.
  const tieneEquipo = otros > 0;
  const cargandoEquipo = !isCeo && data == null && !error;
  const sinEquipo = !isCeo && !tieneEquipo && (data != null || Boolean(error));
  const porRevisar = revisiones?.pendientes.length ?? 0;
  // Sin gente a cargo también revisa quien es responsable de lo que hace otro: la pestaña
  // sale si tiene algo pendiente o ya revisó algo.
  const revisaAlgo = porRevisar > 0 || (revisiones?.revisadas.length ?? 0) > 0;
  // Christian solo asigna y revisa: ve el tablero, lo que repartió y lo que espera su
  // revisión. Encargados con subordinados, además lo suyo.
  const pestanas: Vista[] = isCeo
    ? ["equipo", "asignadas", "revision", "solicitudes"]
    : tieneEquipo
      ? ["mias", "equipo", "asignadas", "revision", "solicitudes"]
      : revisaAlgo
        ? ["mias", "revision", "solicitudes"]
        : ["mias", "solicitudes"];
  const conPestanas = pestanas.length > 0;
  const vistaActiva: Vista = conPestanas && pestanas.includes(vista) ? vista : pestanas[0] ?? "equipo";
  const verMias = vistaActiva === "mias";
  const verEquipo = vistaActiva === "equipo";
  const verAsignadas = vistaActiva === "asignadas";
  const verRevision = vistaActiva === "revision";
  const verSolicitudes = vistaActiva === "solicitudes";

  const cambiarVista = (v: Vista) => {
    setVista(v);
    if (v !== "equipo") setCentro(false);
    reflejarEnUrl({ vista: v, ver: v === "revision" && verRevisiones === "revisadas" ? "revisadas" : null });
    try {
      window.localStorage.setItem(VISTA_KEY, v);
    } catch {
      /* sin storage */
    }
  };

  const cambiarVerRevisiones = (v: VerRevisiones) => {
    setVerRevisiones(v);
    reflejarEnUrl({ vista: "revision", ver: v === "revisadas" ? "revisadas" : null });
  };

  // Contadores reales de las pestañas: lo abierto de quien mira, la gente a su cargo y lo
  // que espera su revisión.
  const misAbiertas = users.find((u) => u.id === user?.id)?.openActivities?.length;
  const pestanasVisibles = (ids: readonly Vista[]): TabItem<Vista>[] =>
    PESTANAS.filter((t) => ids.includes(t.id)).map((t) => ({
      ...t,
      count:
        t.id === "equipo"
          ? otros
          : t.id === "mias"
            ? misAbiertas
            : t.id === "revision"
              ? porRevisar || undefined
              : undefined,
    }));

  const vistaRevision = (
    <EnEsperaRevisionView
      data={revisiones}
      loading={cargandoRevisiones}
      error={errorRevisiones}
      onRecargar={() => void cargarRevisiones()}
      ver={verRevisiones}
      onVer={cambiarVerRevisiones}
    />
  );

  const pestanasNodo = (ids: readonly Vista[]) => (
    <Tabs ariaLabel="Vista de actividades" items={pestanasVisibles(ids)} value={vistaActiva} onChange={cambiarVista} />
  );

  // «Asignar con IA» hasta arriba, en todas las pestañas; solo lo ve quien lo tiene (el
  // componente no pinta nada si no es el CEO o si la IA no está disponible).
  const asistente = <AsistenteIA onCreada={() => void load()} />;

  if (cargandoEquipo) {
    return (
      <div className={p.pagina}>
        <ModulePage title="Actividades" description="Cargando tu tablero…" listLabel="Cargando al equipo">
          <TarjetasCargando />
        </ModulePage>
      </div>
    );
  }

  if (sinEquipo && (vistaActiva === "solicitudes" || vistaActiva === "mias" || vistaActiva === "revision")) {
    return (
      <div className={p.pagina}>
        <ModulePage
          title="Actividades"
          description={DESCRIPCION[vistaActiva]}
          tabs={pestanasNodo(pestanas)}
          lead={asistente}
          card={false}
        >
          {vistaActiva === "solicitudes" ? (
            <SolicitudesEquipoView token={token} />
          ) : vistaActiva === "revision" ? (
            vistaRevision
          ) : (
            <MisActividadesView />
          )}
        </ModulePage>
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

  const rangoSelector = (
    <RangoSelector
      preset={preset}
      rango={rango}
      onChange={(np, r) => {
        setPreset(np);
        setRango(np === "hoy" ? {} : r);
      }}
    />
  );

  const actualizar = verMias ? null : (
    <>
      {updatedAt ? (
        <span className={p.actualizado} aria-live="polite">
          Actualizado {formatHourMinute(updatedAt)}
        </span>
      ) : null}
      <Button
        variant="ghost"
        className={c.tap}
        iconStart={<RefreshIcon className={loading || cargandoRevisiones ? p.girando : undefined} />}
        onClick={recargar}
        disabled={loading || cargandoRevisiones || !token}
        aria-busy={loading || cargandoRevisiones}
      >
        {loading || cargandoRevisiones ? "Actualizando…" : "Actualizar"}
      </Button>
    </>
  );

  const centroOperativo = verEquipo ? (
    <Button
      className={[p.soloEscritorio, c.tap].join(" ")}
      iconStart={<MonitorOutlinedIcon />}
      onClick={() => setCentro(true)}
      disabled={users.length === 0}
      title="Pantalla completa para dejarla puesta en una pantalla de la oficina"
    >
      Centro operativo
    </Button>
  ) : null;

  const avisoRefresco =
    verEquipo && refreshError && data ? (
      <Alert
        tone="warning"
        role="status"
        action={
          <Button size="sm" className={c.tap} onClick={() => void load()} disabled={loading}>
            Reintentar
          </Button>
        }
      >
        No se pudo actualizar. Sigues viendo lo de las {formatHourMinute(updatedAt)}.
      </Alert>
    ) : null;

  const hayFiltro = filtro !== "todos" || busqueda.trim() !== "";
  const quitarFiltro = () => {
    setFiltro("todos");
    setBusqueda("");
  };

  const barraEquipo =
    verEquipo && users.length > 0 ? (
      <ModuleToolbar
        search={
          <SearchInput
            placeholder="Buscar persona o puesto"
            aria-label="Buscar persona o puesto"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        }
        chips={
          <FilterChips ariaLabel="Filtrar al equipo por estado">
            <FilterChip active={filtro === "todos"} count={conteo.total} onClick={() => setFiltro("todos")}>
              Todos
            </FilterChip>
            <FilterChip
              active={filtro === "trabajando"}
              count={conteo.trabajando}
              dot="success"
              onClick={() => setFiltro(filtro === "trabajando" ? "todos" : "trabajando")}
            >
              {ARO_LABEL.trabajando}
            </FilterChip>
            <FilterChip
              active={filtro === "retraso"}
              count={conteo.retraso}
              dot="warning"
              onClick={() => setFiltro(filtro === "retraso" ? "todos" : "retraso")}
            >
              {ARO_LABEL.retraso}
            </FilterChip>
            <FilterChip
              active={filtro === "libre"}
              count={conteo.libres}
              dot="info"
              onClick={() => setFiltro(filtro === "libre" ? "todos" : "libre")}
            >
              {ARO_LABEL.libre}
            </FilterChip>
          </FilterChips>
        }
        end={
          <>
            {/* La línea es de un día: solo con el rango «Hoy». */}
            {preset === "hoy" ? <ConmutadorModo modo={modo} onChange={cambiarModo} /> : null}
            {rangoSelector}
          </>
        }
      />
    ) : null;

  let contenidoEquipo: ReactNode = null;
  if (verEquipo) {
    if (loading && !data) {
      contenidoEquipo = <TarjetasCargando />;
    } else if (error && !data) {
      contenidoEquipo = (
        <div className={p.relleno}>
          <Alert
            tone="danger"
            role="alert"
            action={
              <Button variant="primary" className={c.tap} onClick={() => void load()} disabled={loading}>
                Reintentar
              </Button>
            }
          >
            {error}
          </Alert>
        </div>
      );
    } else if (users.length === 0) {
      contenidoEquipo = (
        <EmptyState
          icon={<GroupsOutlinedIcon />}
          title="Nadie en tu equipo todavía"
          description="Cuando tengas gente a tu cargo, aquí verás qué está haciendo cada quien."
          titleAs="h2"
        />
      );
    } else if (visibles.length === 0) {
      const soloRetraso = filtro === "retraso" && !busqueda.trim();
      contenidoEquipo = (
        <EmptyState
          icon={soloRetraso ? <CelebrationOutlinedIcon /> : <GroupsOutlinedIcon />}
          tone={soloRetraso ? "success" : "neutral"}
          titleAs="h2"
          title={
            soloRetraso
              ? "Nadie con retraso 🎉"
              : busqueda.trim()
                ? `Nadie coincide con «${busqueda.trim()}»`
                : `Nadie en «${filtro === "todos" ? "Todos" : ARO_LABEL[filtro]}» ahora`
          }
          description={soloRetraso ? "Todo tu equipo va en tiempo con lo que tiene abierto." : undefined}
          action={
            hayFiltro ? (
              <Button className={c.tap} iconStart={<CloseIcon />} onClick={quitarFiltro}>
                Ver a todo el equipo
              </Button>
            ) : undefined
          }
        />
      );
    } else if (modo === "linea" && preset === "hoy") {
      contenidoEquipo = <LineaDelDia token={token} users={visibles} refresco={updatedAt} asignarHref={asignarA} />;
    } else {
      contenidoEquipo = (
        <div className={[rejillaEquipo, p.relleno].join(" ")}>
          {visibles.map((u) => {
            const yo = u.id === user?.id;
            return (
              <EquipoPersonaCard
                key={u.id}
                user={u}
                isSelf={yo}
                asignarHref={asignarA(u)}
              />
            );
          })}
        </div>
      );
    }
  }

  return (
    <div className={p.pagina}>
      <ModulePage
        title="Actividades"
        description={DESCRIPCION[vistaActiva]}
        tertiaryActions={actualizar}
        secondaryActions={centroOperativo}
        tabs={conPestanas ? pestanasNodo(pestanas) : null}
        stats={
          verEquipo && data ? (
            <>
              <ResumenEquipo users={users} />
              {/* «Desde hace cuánto» es de hoy: con otros rangos el panel no aplica. */}
              {preset === "hoy" ? (
                <AtencionEquipo users={users} ahora={updatedAt ?? undefined} asignarHref={asignarA} />
              ) : null}
            </>
          ) : null
        }
        lead={asistente}
        before={avisoRefresco}
        toolbar={barraEquipo}
        card={verEquipo}
        listLabel={verEquipo ? "Personas del equipo" : undefined}
      >
        {verMias ? (
          <MisActividadesView />
        ) : verSolicitudes ? (
          <SolicitudesEquipoView token={token} />
        ) : verRevision ? (
          vistaRevision
        ) : verAsignadas ? (
          <AsignadasPorMiView token={token} rango={preset === "hoy" ? {} : rango} toolbarEnd={rangoSelector} />
        ) : (
          contenidoEquipo
        )}
      </ModulePage>

      {verEquipo || verAsignadas ? flujo : null}

      {verEquipo && centro ? (
        <CentroOperativo users={users} onCerrar={() => setCentro(false)} onRefrescar={() => void load()} />
      ) : null}
    </div>
  );
}
