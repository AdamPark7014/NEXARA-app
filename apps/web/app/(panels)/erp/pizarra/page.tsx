"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
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

function PersonCard({ user, isSelf }: { user: TeamBoardUser; isSelf?: boolean }) {
  const color = STATUS_COLORS[user.status];
  const act = user.currentActivity;
  const open = user.openActivities ?? [];
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
          {STATUS_LABELS[user.status]}
        </div>
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
          {act ? act.titulo : "Sin actividad abierta"}
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ display: "flex", gap: 12, alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Actividades</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
            Tú y tu equipo — toca a alguien para ver su día o asignarle trabajo
          </p>
        </div>
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
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {(Object.keys(STATUS_LABELS) as BoardUserStatus[]).map((key) => (
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
    </div>
  );
}
