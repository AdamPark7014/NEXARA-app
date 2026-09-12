"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import { resolveAssetUrl } from "@/lib/evidence-display";
import type { ActivityProjectMode } from "@/lib/ops-activity-form";
import { ROLES } from "@/lib/rbac/roles";
import { resolveV2RoleKey } from "@/lib/user-access";
import {
  fetchTeamBoardUser,
  type TeamBoardUser,
} from "@/lib/team-board-api";

const OpsActivityForm = dynamic(() => import("@/components/ops/OpsActivityForm"), { ssr: false });

type AssignKind = "tarea" | "proyecto" | "servicio";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

export default function AsignarActividadPage() {
  const params = useParams();
  const router = useRouter();
  const { user, token } = useUser();
  const userId = Number(params?.userId);
  const [kind, setKind] = useState<AssignKind | null>(null);
  const [person, setPerson] = useState<TeamBoardUser | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const v2 = useMemo(() => resolveV2RoleKey(user), [user]);
  const access = user?.moduleAccess;

  const options = useMemo(() => {
    const canTarea = access?.["activities-daily"] !== "off";
    const canProyecto = access?.["activities-projects"] !== "off";
    const canServicio =
      Boolean(user?.isSuperAdmin) ||
      v2 === ROLES.CEO ||
      v2 === ROLES.SUPER_ADMIN ||
      access?.["activities-services"] === "write" ||
      access?.["activities-services"] === "read";

    const list: {
      id: AssignKind;
      title: string;
      help: string;
      emoji: string;
      mode: ActivityProjectMode;
    }[] = [];

    if (canTarea) {
      list.push({
        id: "tarea",
        title: "Tarea del día",
        help: "Pendiente cotidiana. Sin proyecto ni cliente.",
        emoji: "✅",
        mode: "without_project",
      });
    }
    if (canProyecto) {
      list.push({
        id: "proyecto",
        title: "De un proyecto",
        help: "Va ligada a un proyecto y su cliente.",
        emoji: "📁",
        mode: "with_project",
      });
    }
    if (canServicio) {
      list.push({
        id: "servicio",
        title: "De un servicio",
        help: "Cliente de servicio corporativo (sin proyecto).",
        emoji: "🛠️",
        mode: "without_project",
      });
    }
    return list;
  }, [access, user?.isSuperAdmin, v2]);

  const selected = options.find((o) => o.id === kind) ?? null;

  const loadPerson = useCallback(async () => {
    if (!token || !Number.isFinite(userId)) return;
    try {
      setPerson(await fetchTeamBoardUser(token, userId));
      setLoadError(null);
    } catch (e) {
      setLoadError(formatApiError(e, "No se pudo cargar a la persona"));
    }
  }, [token, userId]);

  useEffect(() => {
    void loadPerson();
  }, [loadPerson]);

  useEffect(() => {
    if (options.length === 1) setKind(options[0].id);
  }, [options]);

  if (!Number.isFinite(userId)) {
    return <p style={{ color: "#dc2626" }}>Persona no válida.</p>;
  }

  const avatarSrc = person?.avatarUrl ? resolveAssetUrl(person.avatarUrl) : null;
  const displayName = person?.nombre ?? `Persona #${userId}`;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
      <button
        type="button"
        onClick={() => router.push(`/erp/pizarra/${userId}`)}
        style={{
          alignSelf: "flex-start",
          border: "none",
          background: "transparent",
          color: "var(--text-secondary)",
          fontWeight: 650,
          fontSize: 13,
          cursor: "pointer",
          padding: 0,
          fontFamily: "inherit",
        }}
      >
        ← Volver al perfil
      </button>

      <header
        style={{
          display: "flex",
          gap: 14,
          alignItems: "center",
          padding: "16px 16px",
          borderRadius: 18,
          border: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        {avatarSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarSrc}
            alt=""
            width={64}
            height={64}
            style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }}
          />
        ) : (
          <div
            aria-hidden
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              fontSize: 18,
              fontWeight: 800,
              color: "var(--primary)",
              background: "color-mix(in srgb, var(--primary) 14%, var(--surface))",
            }}
          >
            {initials(displayName)}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Asignar a
          </div>
          <h1 style={{ margin: "2px 0 0", fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>
            {displayName}
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
            {person?.puesto || person?.email || "Elige el tipo de actividad"}
          </p>
        </div>
      </header>

      {loadError ? <p style={{ color: "#dc2626", margin: 0, fontSize: 13 }}>{loadError}</p> : null}

      {options.length === 0 ? (
        <p style={{ color: "var(--text-secondary)" }}>No tienes permiso para asignar actividades.</p>
      ) : (
        <>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "var(--text-secondary)" }}>
              ¿Qué le vas a asignar?
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.min(options.length, 3)}, minmax(0, 1fr))`,
                gap: 10,
              }}
            >
              {options.map((opt) => {
                const selectedOpt = kind === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setKind(opt.id)}
                    style={{
                      textAlign: "left",
                      padding: "16px 14px",
                      borderRadius: 16,
                      border: selectedOpt ? "2px solid var(--primary)" : "1px solid var(--border)",
                      background: selectedOpt
                        ? "color-mix(in srgb, var(--primary) 10%, var(--surface))"
                        : "var(--surface)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      color: "inherit",
                      boxShadow: selectedOpt ? "0 8px 20px rgba(15, 23, 42, 0.06)" : "none",
                    }}
                  >
                    <div style={{ fontSize: 22, lineHeight: 1 }}>{opt.emoji}</div>
                    <div style={{ marginTop: 10, fontWeight: 800, fontSize: 15 }}>{opt.title}</div>
                    <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                      {opt.help}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {selected ? (
            <div
              style={{
                padding: 16,
                borderRadius: 16,
                border: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            >
              <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>
                Completa los datos
              </div>
              <OpsActivityForm
                initialResponsableId={userId}
                forcedProjectMode={selected.mode}
                hideProjectModePicker
                onCancel={() => router.push(`/erp/pizarra/${userId}`)}
                onSuccess={() => router.push(`/erp/pizarra/${userId}`)}
              />
            </div>
          ) : (
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
              Toca una opción para continuar.
            </p>
          )}
        </>
      )}
    </div>
  );
}
