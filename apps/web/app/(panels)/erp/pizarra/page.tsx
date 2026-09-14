"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import MisActividadesView from "@/components/pizarra/MisActividadesView";
import { isCeoEmail } from "@/lib/activity-kinds";
import { resolveAssetUrl } from "@/lib/evidence-display";
import {
  STATUS_COLORS,
  STATUS_LABELS,
  fetchTeamBoard,
  formatMinutes,
  type BoardUserStatus,
  type TeamBoardResponse,
  type TeamBoardUser,
} from "@/lib/team-board-api";

/** Actividades tiene dos vistas: lo mío y mi equipo (se recuerda la última). */
type Vista = "mias" | "equipo";
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

function MiniChip({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span
      style={{
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
              <MiniChip color="#d97706">↩️ Corrigiendo evidencia</MiniChip>
            ) : null}
            {user.enEsperaAprobacion ? (
              <MiniChip color="#7c3aed">
                ⏳ {user.enEsperaAprobacion > 1 ? `${user.enEsperaAprobacion} en espera de aprobación` : "En espera de aprobación"}
              </MiniChip>
            ) : null}
          </div>
        ) : null}
      </div>
      {open.length > 0 ? (
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
          {open.slice(0, 3).map((a) => (
            <div key={a.id} title={`${a.anNumber} · ${a.titulo}`}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 650,
                  color: "var(--text-secondary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  marginBottom: 2,
                }}
              >
                {a.titulo}
                {a.assignmentCharge === "despacho"
                  ? " · Despacho"
                  : a.assignmentCharge === "ejecucion"
                    ? " · Ejecución"
                    : ""}
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

  // ?vista=mias|equipo manda (enlaces viejos de Mis actividades); si no, la última elegida.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("vista");
      const guardada = window.localStorage.getItem(VISTA_KEY);
      setVista(q === "mias" || q === "equipo" ? q : guardada === "equipo" ? "equipo" : "mias");
    } catch {
      /* sin storage: queda «mias» */
    }
  }, []);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setError("Inicia sesión para ver Actividades.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await fetchTeamBoard(token));
    } catch (e) {
      setError(formatApiError(e, "No se pudo cargar Actividades"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

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
  // Dos vistas solo para quien tiene gente a su cargo (según su tablero). Los demás, directo su lista.
  const tieneEquipo = otros > 0;
  const cargandoEquipo = !isCeo && data == null && !error;
  const sinEquipo = !isCeo && !tieneEquipo && (data != null || Boolean(error));
  // Christian solo asigna: ve el tablero. Encargados con subordinados eligen lo suyo o su equipo.
  const conPestanas = !isCeo && tieneEquipo;
  const verMias = conPestanas && vista === "mias";

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
              ["mias", "✅ Mis actividades"],
              ["equipo", "👥 Mi equipo"],
            ] as const
          ).map(([id, label]) => {
            const on = vista === id;
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
                }}
              >
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
    </div>
  );
}
