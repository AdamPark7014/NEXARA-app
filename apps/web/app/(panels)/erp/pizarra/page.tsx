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
  formatClock,
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

function Avatar({
  url,
  name,
  size = 72,
}: {
  url: string | null;
  name: string;
  size?: number;
}) {
  const src = url ? resolveAssetUrl(url) : null;
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
          boxShadow: "0 4px 14px rgba(15, 23, 42, 0.12)",
        }}
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
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.28,
        fontWeight: 700,
        color: "var(--primary)",
        background: "color-mix(in srgb, var(--primary) 14%, var(--surface))",
        boxShadow: "0 4px 14px rgba(15, 23, 42, 0.08)",
      }}
    >
      {initials(name)}
    </div>
  );
}

function StatusDot({ status }: { status: BoardUserStatus }) {
  const color = STATUS_COLORS[status];
  return (
    <span
      title={STATUS_LABELS[status]}
      style={{
        width: 14,
        height: 14,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 0 4px color-mix(in srgb, ${color} 22%, transparent)`,
        flexShrink: 0,
      }}
    />
  );
}

function PersonCard({
  user,
  onOpen,
}: {
  user: TeamBoardUser;
  onOpen: (u: TeamBoardUser) => void;
}) {
  const act = user.currentActivity;
  return (
    <button
      type="button"
      onClick={() => onOpen(user)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: "22px 16px 18px",
        borderRadius: 20,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        cursor: "pointer",
        textAlign: "center",
        fontFamily: "inherit",
        color: "inherit",
        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 12px 28px rgba(15, 23, 42, 0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(15, 23, 42, 0.04)";
      }}
    >
      <div style={{ position: "relative" }}>
        <Avatar url={user.avatarUrl} name={user.nombre} size={80} />
        <span
          style={{
            position: "absolute",
            right: 2,
            bottom: 2,
            background: "var(--surface)",
            borderRadius: "50%",
            padding: 3,
            display: "flex",
          }}
        >
          <StatusDot status={user.status} />
        </span>
      </div>
      <div style={{ width: "100%", minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 15,
            lineHeight: 1.25,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {user.nombre}
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: 12,
            color: "var(--text-secondary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {user.puesto || STATUS_LABELS[user.status]}
        </div>
      </div>
      <div
        style={{
          width: "100%",
          marginTop: 4,
          paddingTop: 12,
          borderTop: "1px solid var(--border)",
          fontSize: 12,
          lineHeight: 1.35,
          color: "var(--text-secondary)",
          minHeight: 52,
        }}
      >
        {act ? (
          <>
            <div style={{ fontWeight: 700, color: "var(--foreground)", fontSize: 11, letterSpacing: 0.02 }}>
              {act.anNumber}
            </div>
            <div
              style={{
                marginTop: 2,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                color: "var(--foreground)",
              }}
            >
              {act.titulo}
            </div>
          </>
        ) : (
          <span>Sin actividad en curso</span>
        )}
      </div>
    </button>
  );
}

function DetailDrawer({
  user,
  onClose,
}: {
  user: TeamBoardUser;
  onClose: () => void;
}) {
  const act = user.currentActivity;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle de ${user.nombre}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "flex",
        justifyContent: "flex-end",
        background: "rgba(15, 23, 42, 0.35)",
      }}
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 100%)",
          height: "100%",
          background: "var(--surface)",
          borderLeft: "1px solid var(--border)",
          padding: "24px 22px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          boxShadow: "-12px 0 40px rgba(15, 23, 42, 0.12)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
            <Avatar url={user.avatarUrl} name={user.nombre} size={72} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.2 }}>{user.nombre}</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
                {user.puesto || "Sin puesto"}
              </div>
              <div
                style={{
                  marginTop: 8,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  color: STATUS_COLORS[user.status],
                }}
              >
                <StatusDot status={user.status} />
                {STATUS_LABELS[user.status]}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface)",
              borderRadius: 10,
              width: 36,
              height: 36,
              cursor: "pointer",
              fontSize: 18,
              color: "var(--text-secondary)",
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          <Stat label="Entrada" value={formatClock(user.clockInAt)} />
          <Stat label="En sitio" value={formatMinutes(user.workedMinutes)} />
          <Stat label="En actividad" value={formatMinutes(user.activityElapsedMinutes)} />
          <Stat
            label="Inicio OT"
            value={user.activityStartedAt ? formatClock(user.activityStartedAt) : "—"}
          />
        </div>

        <section
          style={{
            padding: 14,
            borderRadius: 14,
            border: "1px solid var(--border)",
            background: "color-mix(in srgb, var(--surface-2, var(--surface)) 80%, transparent)",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.04, color: "var(--text-secondary)" }}>
            ACTIVIDAD EN CURSO
          </div>
          {act ? (
            <>
              <div style={{ marginTop: 8, fontWeight: 800, fontSize: 14 }}>{act.anNumber}</div>
              <div style={{ marginTop: 4, fontSize: 14, lineHeight: 1.4 }}>{act.titulo}</div>
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-secondary)" }}>
                Estatus: {act.estatus}
              </div>
              {act.id ? (
                <Link
                  href={`/ops/activities/${act.id}`}
                  style={{
                    display: "inline-block",
                    marginTop: 12,
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--primary)",
                    textDecoration: "none",
                  }}
                >
                  Ver actividad →
                </Link>
              ) : null}
            </>
          ) : (
            <div style={{ marginTop: 8, fontSize: 14, color: "var(--text-secondary)" }}>
              No tiene OT abierta ahora.
            </div>
          )}
        </section>

        <Link
          href={`/erp/actividades/diarias?responsableId=${user.id}`}
          style={{
            display: "block",
            textAlign: "center",
            padding: "12px 14px",
            borderRadius: 12,
            background: "var(--primary)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          Asignar actividad
        </Link>
        <Link
          href={`/erp/actividades/proyectos?responsableId=${user.id}`}
          style={{
            display: "block",
            textAlign: "center",
            padding: "11px 14px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            color: "var(--foreground)",
            fontWeight: 600,
            fontSize: 13,
            textDecoration: "none",
            background: "var(--surface)",
          }}
        >
          Asignar a proyecto
        </Link>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "12px 12px",
        borderRadius: 12,
        border: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 15, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

export default function PizarraPage() {
  const { token } = useUser();
  const [data, setData] = useState<TeamBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TeamBoardUser | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setError("Inicia sesión para ver la pizarra.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const board = await fetchTeamBoard(token);
      setData(board);
      setSelected((prev) => {
        if (!prev) return null;
        return board.users.find((u) => u.id === prev.id) ?? prev;
      });
    } catch (e) {
      setError(formatApiError(e, "No se pudo cargar la pizarra"));
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

  const users = data?.users ?? [];
  const counts = useMemo(() => {
    const acc: Partial<Record<BoardUserStatus, number>> = {};
    for (const u of users) acc[u.status] = (acc[u.status] ?? 0) + 1;
    return acc;
  }, [users]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1200, margin: "0 auto" }}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              fontFamily: "var(--nx-font-display, inherit)",
            }}
          >
            Pizarra
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--text-secondary)" }}>
            Tu equipo hoy · toca una persona para el detalle
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || !token}
          style={{
            padding: "9px 14px",
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

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {(Object.keys(STATUS_LABELS) as BoardUserStatus[]).map((key) => (
          <span
            key={key}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <StatusDot status={key} />
            {STATUS_LABELS[key]}
            <span style={{ color: "var(--text-secondary)" }}>{counts[key] ?? 0}</span>
          </span>
        ))}
      </div>

      {loading && !data ? (
        <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: 0 }}>Cargando equipo…</p>
      ) : error ? (
        <p style={{ color: "#dc2626", fontSize: 14, margin: 0 }}>{error}</p>
      ) : users.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: 0 }}>Nadie en tu alcance todavía.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 14,
          }}
        >
          {users.map((u) => (
            <PersonCard key={u.id} user={u} onOpen={setSelected} />
          ))}
        </div>
      )}

      {selected ? <DetailDrawer user={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
