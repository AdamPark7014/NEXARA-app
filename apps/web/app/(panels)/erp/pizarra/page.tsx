"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SvgIconComponent } from "@mui/icons-material";
import ReplayIcon from "@mui/icons-material/Replay";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import OutboxOutlinedIcon from "@mui/icons-material/OutboxOutlined";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import MisActividadesView from "@/components/pizarra/MisActividadesView";
import AsignadasPorMiView from "@/components/pizarra/AsignadasPorMiView";
import { KpiStrip, PrioridadChip, RangoSelector, SemaforoDot } from "@/components/pizarra/PizarraKpi";
import { isCeoEmail } from "@/lib/activity-kinds";
import { resolveAssetUrl } from "@/lib/evidence-display";
import {
  STATUS_COLORS,
  STATUS_LABELS,
  fetchTeamBoard,
  formatMinutes,
  type BoardRange,
  type BoardUserStatus,
  type RangoPreset,
  type TeamBoardResponse,
  type TeamBoardUser,
} from "@/lib/team-board-api";

/** Actividades tiene tres vistas: lo mío, mi equipo y lo que repartí (se recuerda la última). */
type Vista = "mias" | "equipo" | "asignadas";
const VISTA_KEY = "nx-actividades-vista";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

function Avatar({ url, name, size = 80 }: { url: string | null; name: string; size?: number }) {
  const src = url ? resolveAssetUrl(url) : null;
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }}
      />
    );
  }
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        fontSize: size * 0.28,
        fontWeight: 700,
        color: "var(--primary)",
        background: "color-mix(in srgb, var(--primary) 14%, var(--surface))",
      }}
    >
      {initials(name)}
    </div>
  );
}

function MiniChip({ children, color, icon: Icon }: { children: ReactNode; color: string; icon?: SvgIconComponent }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 10.5,
        fontWeight: 650,
        lineHeight: 1.2,
        padding: "2px 7px",
        borderRadius: 999,
        color,
        background: `color-mix(in srgb, ${color} 10%, var(--surface))`,
        border: `1px solid color-mix(in srgb, ${color} 30%, var(--border))`,
        whiteSpace: "nowrap",
      }}
    >
      {Icon ? <Icon aria-hidden="true" sx={{ fontSize: 13, flex: "0 0 auto" }} /> : null}
      {children}
    </span>
  );
}

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
  const hora = new Date(f.finishedAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  if (f.lateMinutes == null) return `Finalizó a las ${hora}`;
  if (f.lateMinutes <= 0) return `Finalizó a las ${hora}, a tiempo`;
  return `Finalizó a las ${hora} con ${formatMinutes(f.lateMinutes)} de atraso`;
}

function PersonCard({ user, isSelf }: { user: TeamBoardUser; isSelf?: boolean }) {
  const color = STATUS_COLORS[user.status];
  const act = user.currentActivity;
  const open = user.openActivities ?? [];
  const ahora = Date.now();
  const fin = user.lastFinished;
  return (
    <Link
      href={`/erp/pizarra/${user.id}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: "22px 14px 16px",
        borderRadius: 20,
        border: isSelf
          ? "2px solid color-mix(in srgb, var(--primary) 55%, var(--border))"
          : "1px solid var(--border)",
        background: isSelf
          ? "color-mix(in srgb, var(--primary) 6%, var(--surface))"
          : "var(--surface)",
        textDecoration: "none",
        color: "inherit",
        boxShadow: "0 6px 18px rgba(15, 23, 42, 0.04)",
      }}
    >
      <div style={{ position: "relative" }}>
        <Avatar url={user.avatarUrl} name={user.nombre} />
        <span
          style={{
            position: "absolute",
            right: 0,
            bottom: 2,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: color,
            border: "3px solid var(--surface)",
            boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 25%, transparent)`,
          }}
          title={STATUS_LABELS[user.status]}
        />
      </div>
      <div style={{ width: "100%", textAlign: "center", minWidth: 0 }}>
        <div
          style={{
            fontWeight: 750,
            fontSize: 14,
            lineHeight: 1.25,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {user.nombre}
        </div>
        {isSelf ? (
          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              fontWeight: 750,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--primary)",
            }}
          >
            Tú
          </div>
        ) : null}
        <div
          style={{
            marginTop: 4,
            fontSize: 12,
            fontWeight: 650,
            color,
          }}
        >
          {estadoTexto(user, ahora)}
        </div>
        {user.status === "libre" && fin ? (
          <div
            style={{
              marginTop: 4,
              fontSize: 11.5,
              lineHeight: 1.35,
              fontWeight: 600,
              color: fin.lateMinutes && fin.lateMinutes > 0 ? "#dc2626" : "#16a34a",
            }}
          >
            {terminoTexto(fin)}
          </div>
        ) : null}
        {user.enCorreccion || user.enEsperaAprobacion ? (
          <div style={{ marginTop: 6, display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap" }}>
            {user.enCorreccion ? (
              <MiniChip color="#d97706" icon={ReplayIcon}>
                Corrigiendo evidencia
              </MiniChip>
            ) : null}
            {user.enEsperaAprobacion ? (
              <MiniChip color="#7c3aed" icon={HourglassTopIcon}>
                {user.enEsperaAprobacion > 1 ? `${user.enEsperaAprobacion} en espera de aprobación` : "En espera de aprobación"}
              </MiniChip>
            ) : null}
          </div>
        ) : null}
      </div>
      <KpiStrip kpis={user.kpis} compacta />
      {open.length > 0 ? (
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
          {open.slice(0, 3).map((a) => (
            <div key={a.id} title={`${a.anNumber} · ${a.titulo}`}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  marginBottom: 3,
                  minWidth: 0,
                }}
              >
                <SemaforoDot semaforo={a.semaforo} size={8} />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 650,
                    color: "var(--text-secondary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {a.titulo}
                  {a.assignmentCharge === "despacho"
                    ? " · Despacho"
                    : a.assignmentCharge === "ejecucion"
                      ? " · Ejecución"
                      : ""}
                </span>
                {a.prioridad === "ALTA" ? <PrioridadChip prioridad={a.prioridad} /> : null}
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 999,
                  background: "color-mix(in srgb, var(--border) 80%, transparent)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, Math.max(0, a.progressPct))}%`,
                    borderRadius: 999,
                    background:
                      a.progressPct >= 100
                        ? "#16a34a"
                        : a.progressPct > 0
                          ? "var(--primary)"
                          : "transparent",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            width: "100%",
            minHeight: 44,
            paddingTop: 10,
            borderTop: "1px solid var(--border)",
            fontSize: 12,
            lineHeight: 1.35,
            color: "var(--text-secondary)",
            textAlign: "center",
          }}
        >
          {act ? act.titulo : fin ? `Última: ${fin.titulo}` : "Sin actividades hoy"}
        </div>
      )}
    </Link>
  );
}

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
        v === "mias" || v === "equipo" || v === "asignadas";
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
    ? ["equipo", "asignadas"]
    : tieneEquipo
      ? ["mias", "equipo", "asignadas"]
      : [];
  const conPestanas = pestanas.length > 0;
  const vistaActiva: Vista = conPestanas && pestanas.includes(vista) ? vista : pestanas[0] ?? "equipo";
  const verMias = vistaActiva === "mias";
  const verAsignadas = vistaActiva === "asignadas";

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
      <p style={{ color: "var(--text-secondary)", fontSize: 14, maxWidth: 1100, margin: "0 auto" }}>
        Cargando actividades…
      </p>
    );
  }

  if (sinEquipo) {
    return <MisActividadesView />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ display: "flex", gap: 12, alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Actividades</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
            {verMias
              ? "Lo tuyo, en orden. En «Mi equipo» ves a tu gente y le asignas trabajo."
              : verAsignadas
                ? "Lo que repartiste en el rango, con quién lo tiene y cómo va"
                : "Tú y tu equipo — toca a alguien para ver su día o asignarle trabajo"}
          </p>
        </div>
        {verMias ? null : (
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || !token}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            fontWeight: 650,
            fontSize: 13,
            cursor: loading ? "wait" : "pointer",
            fontFamily: "inherit",
          }}
        >
          Actualizar
        </button>
        )}
      </header>

      {conPestanas ? (
        <div
          role="tablist"
          aria-label="Vista de actividades"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            padding: 4,
            alignSelf: "flex-start",
            borderRadius: 14,
            border: "1px solid var(--border)",
            background: "var(--surface)",
          }}
        >
          {(
            [
              ["mias", "Mis actividades", TaskAltIcon],
              ["equipo", "Mi equipo", GroupsOutlinedIcon],
              ["asignadas", "Asignadas por mí", OutboxOutlinedIcon],
            ] as const
          )
            .filter(([id]) => pestanas.includes(id))
            .map(([id, label, Icon]) => {
            const on = vistaActiva === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => cambiarVista(id)}
                style={{
                  minHeight: 44,
                  padding: "8px 16px",
                  borderRadius: 10,
                  border: "none",
                  background: on ? "var(--primary)" : "transparent",
                  color: on ? "#fff" : "inherit",
                  fontWeight: on ? 750 : 650,
                  fontSize: 14,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Icon aria-hidden="true" sx={{ fontSize: 18 }} />
                {label}
              </button>
            );
          })}
        </div>
      ) : null}

      {verMias ? (
        <MisActividadesView />
      ) : (
      <>
      <RangoSelector
        preset={preset}
        rango={rango}
        onChange={(p, r) => {
          setPreset(p);
          setRango(p === "hoy" ? {} : r);
        }}
      />

      {verAsignadas ? (
        <AsignadasPorMiView token={token} rango={preset === "hoy" ? {} : rango} />
      ) : (
      <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {(Object.keys(STATUS_LABELS) as BoardUserStatus[])
          // «Inactivo» ya no se asigna; solo aparece si una API vieja lo manda.
          .filter((key) => key !== "inactivo" || (counts[key] ?? 0) > 0)
          .map((key) => (
          <span
            key={key}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "5px 10px",
              borderRadius: 999,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLORS[key] }} />
            {STATUS_LABELS[key]} {counts[key] ?? 0}
          </span>
        ))}
      </div>

      {loading && !data ? (
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Cargando…</p>
      ) : error ? (
        <p style={{ color: "#dc2626", fontSize: 14 }}>{error}</p>
      ) : users.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Nadie en tu equipo por ahora.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))",
            gap: 12,
          }}
        >
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
