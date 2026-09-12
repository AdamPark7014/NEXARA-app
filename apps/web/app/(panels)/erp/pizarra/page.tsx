"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import { useUser } from "@/components/UserContext";
import {
  fetchTeamBoard,
  STATUS_COLORS,
  STATUS_LABELS,
  type BoardUserStatus,
  type TeamBoardResponse,
  type TeamBoardUser,
} from "@/lib/team-board-api";

const BUCKET_LABEL: Record<string, string> = {
  daily: "Diaria",
  projects: "Proyecto",
  services: "Servicio",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

function deadlineHint(iso: string | null | undefined, status: BoardUserStatus): string {
  if (!iso) return "Sin fecha límite";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Sin fecha límite";
  const label = d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  if (status === "atrasado" || d.getTime() < Date.now()) return `Vencida · ${label}`;
  return `Límite · ${label}`;
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div
      aria-hidden
      style={{
        width: 48,
        height: 48,
        borderRadius: "50%",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        fontWeight: 700,
        color: "var(--primary)",
        background: "color-mix(in srgb, var(--primary) 16%, var(--surface))",
      }}
    >
      {initials(name)}
    </div>
  );
}

function StatusPill({ status }: { status: BoardUserStatus }) {
  const color = STATUS_COLORS[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.02,
        color,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 0 2px color-mix(in srgb, ${color} 25%, transparent)`,
        }}
      />
      {STATUS_LABELS[status]}
    </span>
  );
}

function PersonCard({ user }: { user: TeamBoardUser }) {
  const act = user.currentActivity;
  return (
    <article
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 14,
        borderRadius: 12,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        minHeight: 148,
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <Avatar url={user.avatarUrl} name={user.nombre} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: "var(--foreground)",
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
              marginTop: 2,
              fontSize: 12,
              color: "var(--text-secondary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {user.puesto || "Sin puesto"}
          </div>
          <div style={{ marginTop: 8 }}>
            <StatusPill status={user.status} />
          </div>
        </div>
      </div>

      {act ? (
        <div
          style={{
            paddingTop: 10,
            borderTop: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <code
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--primary)",
                background: "color-mix(in srgb, var(--primary) 10%, transparent)",
                padding: "2px 6px",
                borderRadius: 6,
              }}
            >
              {act.anNumber}
            </code>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.04,
                color: "var(--text-secondary)",
                padding: "2px 6px",
                borderRadius: 6,
                background: "var(--surface-2, color-mix(in srgb, var(--border) 40%, transparent))",
              }}
            >
              {BUCKET_LABEL[act.bucket] ?? act.bucket}
            </span>
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--foreground)",
              lineHeight: 1.35,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {act.titulo}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
            {deadlineHint(act.fechaMaxima, user.status)}
          </div>
        </div>
      ) : (
        <div
          style={{
            paddingTop: 10,
            borderTop: "1px solid var(--border)",
            fontSize: 12,
            color: "var(--text-secondary)",
          }}
        >
          Sin OT abierta
        </div>
      )}
    </article>
  );
}

export default function PizarraPage() {
  const { token } = useUser();
  const [data, setData] = useState<TeamBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la pizarra");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const users = data?.users ?? [];
  const counts = users.reduce(
    (acc, u) => {
      acc[u.status] = (acc[u.status] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<BoardUserStatus, number>>,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader
        density="ops"
        eyebrow="ERP · Core"
        title="Pizarra corporativa"
        subtitle="Semáforo del equipo: actividad abierta, asistencia y GPS reciente."
        meta={
          data ? (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-secondary)",
                padding: "4px 10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            >
              Alcance: {data.scope === "company" ? "empresa" : "mi equipo"} · {users.length} personas
            </span>
          ) : null
        }
        actions={
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || !token}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--foreground)",
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? "wait" : "pointer",
            }}
          >
            Actualizar
          </button>
        }
      />

      <Section title="Semáforo del equipo" subtitle="Activo · Atrasado · Inactivo · Sin actividad">
        {loading ? (
          <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: 0 }}>Cargando pizarra…</p>
        ) : error ? (
          <p style={{ color: "#ef4444", fontSize: 13, margin: 0 }}>{error}</p>
        ) : users.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: 0 }}>
            No hay personas en tu alcance.
          </p>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                marginBottom: 14,
                fontSize: 12,
                color: "var(--text-secondary)",
              }}
            >
              {(Object.keys(STATUS_LABELS) as BoardUserStatus[]).map((key) => (
                <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: STATUS_COLORS[key],
                    }}
                  />
                  {STATUS_LABELS[key]}: {counts[key] ?? 0}
                </span>
              ))}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: 12,
              }}
            >
              {users.map((u) => (
                <PersonCard key={u.id} user={u} />
              ))}
            </div>
          </>
        )}
      </Section>
    </div>
  );
}
