"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReplayIcon from "@mui/icons-material/Replay";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import OutboxOutlinedIcon from "@mui/icons-material/OutboxOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import { Alert, Avatar, Badge, Button, EmptyState, PageHead, Skeleton, Stat, StatRow, Tabs, TONE_COLOR, type Tone } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import MisActividadesView from "@/components/pizarra/MisActividadesView";
import AsignadasPorMiView from "@/components/pizarra/AsignadasPorMiView";
import SolicitudesEquipoView from "@/components/pizarra/SolicitudesEquipoView";
import { PrioridadChip, RangoSelector, SemaforoDot } from "@/components/pizarra/PizarraKpi";
import { isCeoEmail } from "@/lib/activity-kinds";
import {
  STATUS_LABELS,
  fetchTeamBoard,
  formatMinutes,
  formatPct,
  type BoardRange,
  type BoardUserStatus,
  type RangoPreset,
  type TeamBoardResponse,
  type TeamBoardUser,
} from "@/lib/team-board-api";
import p from "./pizarra.module.css";

/** Actividades: lo mío, mi equipo, lo que repartí y solicitudes entre pares. */
type Vista = "mias" | "equipo" | "asignadas" | "solicitudes";
const VISTA_KEY = "nx-actividades-vista";

/** Estado de la persona → tono de la base (el mismo en el punto, el texto y la cifra de arriba). */
const TONO_ESTADO: Record<BoardUserStatus, Tone> = {
  activo: "success",
  atrasado: "danger",
  libre: "info",
  sin_actividad: "neutral",
  inactivo: "neutral",
};

const TEXTO_TONO: Record<Tone, string> = {
  success: "var(--ui-success-text)",
  danger: "var(--ui-danger-text)",
  info: "var(--ui-info-text)",
  warning: "var(--ui-warning-text)",
  violet: "var(--ui-violet-text)",
  brand: "var(--ui-brand-text)",
  neutral: "var(--ui-fg-2)",
  outline: "var(--ui-fg-2)",
};

/** Cifras de arriba: cuántas personas hay en cada estado. */
const ETIQUETA_CIFRA: Record<BoardUserStatus, string> = {
  activo: "Activos",
  atrasado: "Atrasados",
  libre: "Terminaron",
  sin_actividad: "Sin actividad",
  inactivo: "Inactivos",
};

/** Qué significa cada cifra: en el `title`, no en la pantalla. */
const PISTA_ESTADO: Record<BoardUserStatus, string> = {
  activo: "Con una actividad en curso",
  atrasado: "Pasados de su fecha máxima",
  libre: "Ya cerraron lo que tenían",
  sin_actividad: "Sin nada abierto",
  inactivo: "Sin registro reciente",
};

/** Estado con detalle: cuánto atraso lleva o desde cuándo terminó su última actividad. */
function estadoTexto(u: TeamBoardUser, ahora: number): string {
  if (u.status === "atrasado" && u.currentLateMinutes) {
    return `Atrasado ${formatMinutes(u.currentLateMinutes)}`;
  }
  if (u.status === "libre" && u.idleSinceAt) {
    const min = Math.max(0, Math.floor((ahora - new Date(u.idleSinceAt).getTime()) / 60_000));
    return min < 1 ? "Sin actividad desde hace un momento" : `Sin actividad desde hace ${formatMinutes(min)}`;
  }
  return STATUS_LABELS[u.status];
}

function terminoTexto(f: NonNullable<TeamBoardUser["lastFinished"]>): string {
  const hora = new Date(f.finishedAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (f.lateMinutes == null) return `Finalizó a las ${hora}`;
  if (f.lateMinutes <= 0) return `Finalizó a las ${hora}, a tiempo`;
  return `Finalizó a las ${hora} con ${formatMinutes(f.lateMinutes)} de atraso`;
}

function PersonCard({ user, isSelf }: { user: TeamBoardUser; isSelf?: boolean }) {
  const tono = TONO_ESTADO[user.status];
  const act = user.currentActivity;
  const open = user.openActivities ?? [];
  const fin = user.lastFinished;
  const k = user.kpis;
  return (
    <Link href={`/erp/pizarra/${user.id}`} className={`${p.tarjeta} ${isSelf ? p.tarjetaYo : ""}`}>
      <div className={p.cabeza}>
        <span className={p.avatar}>
          <Avatar url={user.avatarUrl} name={user.nombre} size={36} />
          <span className={p.punto} style={{ background: TONE_COLOR[tono] }} title={STATUS_LABELS[user.status]} />
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className={p.nombre}>
            <span>{user.nombre}</span>
            {isSelf ? <Badge tone="brand">Tú</Badge> : null}
          </span>
          <span className={p.puesto} style={{ display: "block" }}>
            {user.puesto || "Sin puesto"}
          </span>
        </span>
      </div>

      <div className={p.estado} style={{ color: TEXTO_TONO[tono] }}>
        <span>{estadoTexto(user, Date.now())}</span>
        {user.status === "libre" && fin ? <span className={p.estadoSub}>{terminoTexto(fin)}</span> : null}
      </div>

      {user.enCorreccion || user.enEsperaAprobacion ? (
        <div className={p.chips}>
          {user.enCorreccion ? (
            <Badge tone="warning">
              <ReplayIcon aria-hidden="true" />
              Corrigiendo evidencia
            </Badge>
          ) : null}
          {user.enEsperaAprobacion ? (
            <Badge tone="violet">
              <HourglassTopIcon aria-hidden="true" />
              {user.enEsperaAprobacion > 1 ? `${user.enEsperaAprobacion} en espera de aprobación` : "En espera de aprobación"}
            </Badge>
          ) : null}
        </div>
      ) : null}

      {k ? (
        <dl className={p.kpis}>
          <div className={p.kpi} title={`${k.aTiempo} de ${k.cerradas} cerradas dentro de su fecha máxima`}>
            <dt>A tiempo</dt>
            <dd>{formatPct(k.aTiempoPct)}</dd>
          </div>
          <div className={p.kpi} title={`Plan ${formatMinutes(k.minutosPlan)} contra real ${formatMinutes(k.minutosReales)}`}>
            <dt>Eficiencia</dt>
            <dd>{formatPct(k.eficienciaPct)}</dd>
          </div>
          <div
            className={p.kpi}
            title={`${formatMinutes(k.minutosEnActividad)} en actividad de ${formatMinutes(k.minutosAsistidos)} asistidos`}
          >
            <dt>Productividad</dt>
            <dd>{formatPct(k.productividadPct)}</dd>
          </div>
        </dl>
      ) : null}

      {open.length > 0 ? (
        <ul className={p.acts}>
          {open.slice(0, 3).map((a) => (
            <li key={a.id} className={p.act} title={`${a.anNumber} · ${a.titulo}`}>
              <span className={p.actLinea}>
                <SemaforoDot semaforo={a.semaforo} size={7} />
                <span className={p.actTitulo}>
                  {a.titulo}
                  {a.assignmentCharge === "despacho" ? " · Despacho" : a.assignmentCharge === "ejecucion" ? " · Ejecución" : ""}
                </span>
                {a.prioridad === "ALTA" ? <PrioridadChip prioridad={a.prioridad} /> : null}
              </span>
              {a.periodo ? (
                <span className={`${p.actPeriodo} ${a.periodo.estado === "vencida" ? p.actPeriodoVencido : ""}`}>
                  {a.periodo.etiqueta}
                </span>
              ) : null}
              <span className={`${p.progreso} ${a.progressPct >= 100 ? p.progresoCompleto : ""}`} aria-label={`Avance ${a.progressPct} %`}>
                <span style={{ width: `${Math.min(100, Math.max(0, a.progressPct))}%` }} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <span className={p.nada}>{act ? act.titulo : fin ? `Última: ${fin.titulo}` : "Sin actividades hoy"}</span>
      )}

      {k ? (
        <span className={p.cerradas}>
          {k.cerradas}/{k.asignadas} cerradas{k.rechazadas > 0 ? ` · ${k.rechazadas} rechazada${k.rechazadas > 1 ? "s" : ""}` : ""}
        </span>
      ) : null}
    </Link>
  );
}

function TarjetasCargando() {
  return (
    <div className={p.rejilla} aria-busy="true" aria-label="Cargando al equipo">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={p.esqueleto}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Skeleton width={36} height={36} radius={18} />
            <div style={{ flex: 1, display: "grid", gap: 6 }}>
              <Skeleton width="60%" />
              <Skeleton width="40%" height={10} />
            </div>
          </div>
          <Skeleton height={32} />
          <Skeleton width="80%" height={10} />
        </div>
      ))}
    </div>
  );
}

const PESTANAS = [
  { id: "mias" as const, label: "Mis actividades", icon: TaskAltIcon },
  { id: "equipo" as const, label: "Mi equipo", icon: GroupsOutlinedIcon },
  { id: "asignadas" as const, label: "Asignadas por mí", icon: OutboxOutlinedIcon },
  { id: "solicitudes" as const, label: "Solicitudes de equipo", icon: HourglassTopIcon },
];

export default function PizarraPage() {
  const { token, user } = useUser();
  const [data, setData] = useState<TeamBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("mias");
  const [preset, setPreset] = useState<RangoPreset>("hoy");
  const [rango, setRango] = useState<BoardRange>({});

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
  const counts = useMemo(() => {
    const acc: Partial<Record<BoardUserStatus, number>> = {};
    for (const u of users) acc[u.status] = (acc[u.status] ?? 0) + 1;
    return acc;
  }, [users]);

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
  const verAsignadas = vistaActiva === "asignadas";
  const verSolicitudes = vistaActiva === "solicitudes";

  const cambiarVista = (v: Vista) => {
    setVista(v);
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
        <SolicitudesEquipoView />
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

  const estados = (Object.keys(STATUS_LABELS) as BoardUserStatus[])
    // «Inactivo» ya no se asigna; solo aparece si una API vieja lo manda.
    .filter((key) => key !== "inactivo" || (counts[key] ?? 0) > 0);

  return (
    <div className={p.pagina}>
      <PageHead
        title="Actividades"
        actions={
          verMias ? null : (
            <Button onClick={() => void load()} disabled={loading || !token}>
              <RefreshIcon aria-hidden="true" />
              Actualizar
            </Button>
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
        <SolicitudesEquipoView />
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
            <AsignadasPorMiView token={token} rango={preset === "hoy" ? {} : rango} />
          ) : (
            <>
              <StatRow cols={estados.length}>
                {estados.map((key) => (
                  <Stat
                    key={key}
                    label={ETIQUETA_CIFRA[key]}
                    dot={TONE_COLOR[TONO_ESTADO[key]]}
                    value={counts[key] ?? 0}
                    title={PISTA_ESTADO[key]}
                    tone={key === "atrasado" && (counts[key] ?? 0) > 0 ? "danger" : "default"}
                  />
                ))}
              </StatRow>

              {loading && !data ? (
                <TarjetasCargando />
              ) : error ? (
                <Alert tone="danger" role="alert">
                  {error}
                </Alert>
              ) : users.length === 0 ? (
                <EmptyState icon={<GroupsOutlinedIcon />} title="Nadie en tu equipo" />
              ) : (
                <div className={p.rejilla}>
                  {users.map((u) => (
                    <PersonCard key={u.id} user={u} isSelf={u.id === user?.id} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
