"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import {
  ACTIVITY_KINDS,
  extrasEmailsForKind,
  isServicioBridgeEmail,
  kindsForAssignment,
  metaForKind,
  ORG_EMAILS,
  servicioDelegateEmails,
  servicioShouldGoToBridge,
  type ActivityKind,
} from "@/lib/activity-kinds";
import { formatApiError } from "@/lib/erp-api";
import { resolveAssetUrl } from "@/lib/evidence-display";
import { resolveV2RoleKey } from "@/lib/user-access";
import {
  fetchTeamBoard,
  fetchTeamBoardUser,
  type TeamBoardUser,
} from "@/lib/team-board-api";

const OpsActivityForm = dynamic(() => import("@/components/ops/OpsActivityForm"), { ssr: false });

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

async function addTeamMember(
  token: string,
  activityId: number,
  userId: number,
  indicaciones?: string,
) {
  const res = await fetch(buildApiUrl(`activities/${activityId}/team`), {
    method: "POST",
    credentials: "include",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId,
      rol: "TECNICO",
      ...(indicaciones?.trim() ? { indicaciones: indicaciones.trim() } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
}

export default function AsignarActividadPage() {
  const params = useParams();
  const router = useRouter();
  const { user, token } = useUser();
  const userId = Number(params?.userId);

  const [kind, setKind] = useState<ActivityKind | null>(null);
  const [person, setPerson] = useState<TeamBoardUser | null>(null);
  const [roster, setRoster] = useState<TeamBoardUser[]>([]);
  const [boardUsers, setBoardUsers] = useState<TeamBoardUser[]>([]);
  const [extraIds, setExtraIds] = useState<number[]>([]);
  const [extraNotes, setExtraNotes] = useState<Record<number, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);

  const v2 = useMemo(() => resolveV2RoleKey(user), [user]);
  const allowedKinds = useMemo(
    () =>
      kindsForAssignment({
        creatorEmail: user?.email,
        targetEmail: person?.email,
        v2Role: v2,
        isSuperAdmin: user?.isSuperAdmin,
      }),
    [v2, user?.email, user?.isSuperAdmin, person?.email],
  );

  const kindMeta = kind ? metaForKind(kind) : null;

  const bridgeNeeded =
    kind === "servicio" &&
    servicioShouldGoToBridge({
      creatorEmail: user?.email,
      targetEmail: person?.email,
      isSuperAdmin: Boolean(user?.isSuperAdmin),
      isCeo: v2 === "ceo",
    });

  const antonioOnBoard = useMemo(
    () => boardUsers.find((u) => u.email?.toLowerCase() === ORG_EMAILS.antonio) ?? null,
    [boardUsers],
  );

  const teamForExtras = useMemo(() => {
    // Antonio puente: solo Carolina/Alejandro.
    if (kind === "servicio" && isServicioBridgeEmail(person?.email)) {
      const allow = new Set(servicioDelegateEmails());
      return roster.filter((u) => allow.has((u.email || "").toLowerCase()));
    }
    // Servicio → soporte · Obra → instaladores · Proyecto → ambos · resto → todos.
    const pool = extrasEmailsForKind(kind);
    if (!pool) return roster;
    const allow = new Set(pool.map((e) => e.toLowerCase()));
    return roster.filter((u) => allow.has((u.email || "").toLowerCase()));
  }, [kind, person?.email, roster]);

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(userId)) return;
    try {
      const [p, board] = await Promise.all([
        fetchTeamBoardUser(token, userId),
        fetchTeamBoard(token).catch(() => null),
      ]);
      setPerson(p);
      const users = board?.users ?? [];
      setBoardUsers(users);
      setRoster(users.filter((u) => u.id !== userId));
      setLoadError(null);
    } catch (e) {
      setLoadError(formatApiError(e, "No se pudo cargar a la persona"));
    }
  }, [token, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (allowedKinds.length === 1) setKind(allowedKinds[0]);
    else if (kind && !allowedKinds.includes(kind)) setKind(null);
  }, [allowedKinds, kind]);

  useEffect(() => {
    const ok = new Set(teamForExtras.map((u) => u.id));
    setExtraIds((prev) => {
      const next = prev.filter((id) => ok.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [teamForExtras]);

  const toggleExtra = (id: number) => {
    setExtraIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSuccess = async (activityId: number) => {
    if (!token) {
      router.push(`/erp/pizarra/${userId}`);
      return;
    }
    setTeamError(null);
    try {
      for (const id of extraIds) {
        await addTeamMember(token, activityId, id, extraNotes[id]);
      }
    } catch (e) {
      setTeamError(
        e instanceof Error
          ? `Actividad creada, pero el equipo extra falló: ${e.message}`
          : "Actividad creada; no se pudo agregar al equipo extra",
      );
      return;
    }
    router.push(`/erp/pizarra/${userId}`);
  };

  if (!Number.isFinite(userId)) {
    return <p style={{ color: "#dc2626" }}>Persona no válida.</p>;
  }

  const avatarSrc = person?.avatarUrl ? resolveAssetUrl(person.avatarUrl) : null;
  const displayName = person?.nombre ?? `Persona #${userId}`;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
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
          padding: 16,
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
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-tertiary)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            Responsable
          </div>
          <h1 style={{ margin: "2px 0 0", fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>
            {displayName}
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
            {person?.puesto || person?.email || "Elige el tipo y completa los datos"}
          </p>
        </div>
      </header>

      {loadError ? <p style={{ color: "#dc2626", margin: 0, fontSize: 13 }}>{loadError}</p> : null}
      {teamError ? <p style={{ color: "#d97706", margin: 0, fontSize: 13 }}>{teamError}</p> : null}

      <section>
        <div style={{ fontSize: 13, fontWeight: 750, marginBottom: 10, color: "var(--text-secondary)" }}>
          1 · Tipo de actividad
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 10,
          }}
        >
          {allowedKinds.map((id) => {
            const opt = ACTIVITY_KINDS[id];
            const selected = kind === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setKind(id)}
                style={{
                  textAlign: "left",
                  padding: "14px 12px",
                  borderRadius: 16,
                  border: selected ? "2px solid var(--primary)" : "1px solid var(--border)",
                  background: selected
                    ? "color-mix(in srgb, var(--primary) 10%, var(--surface))"
                    : "var(--surface)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: "inherit",
                  minHeight: 112,
                }}
              >
                <div style={{ fontSize: 22 }}>{opt.emoji}</div>
                <div style={{ marginTop: 8, fontWeight: 800, fontSize: 14 }}>{opt.title}</div>
                <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.35 }}>
                  {opt.help}
                </div>
              </button>
            );
          })}
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.4 }}>
          Solo se muestran tipos válidos para {displayName}. Campo David: tarea/proyecto/obra · Soporte
          Antonio: tarea/proyecto/servicio · Josué (obra): todo menos servicio · Daniela/Mónica:
          tarea/comercial · Encargados: + comercial.
        </p>
      </section>

      {bridgeNeeded && (
        <div
          role="status"
          style={{
            padding: "12px 14px",
            borderRadius: 14,
            border: "1px solid color-mix(in srgb, #d97706 40%, var(--border))",
            background: "color-mix(in srgb, #d97706 10%, var(--surface))",
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          <strong>Servicios van primero a Antonio</strong> (puente de sistemas). Él agenda día/hora a
          Carolina o Alejandro.
          {antonioOnBoard ? (
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                onClick={() => router.push(`/erp/pizarra/${antonioOnBoard.id}/asignar`)}
                style={{
                  border: "none",
                  background: "var(--primary)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 12.5,
                  padding: "8px 12px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Ir a asignar a {antonioOnBoard.nombre.split(/\s+/).slice(0, 2).join(" ")} →
              </button>
            </div>
          ) : (
            <p style={{ margin: "8px 0 0", fontSize: 12 }}>
              No aparece Antonio en el tablero; revisa el seed / jerarquía.
            </p>
          )}
        </div>
      )}

      {kindMeta && !bridgeNeeded ? (
        <>
          <section
            style={{
              padding: 14,
              borderRadius: 16,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 750, marginBottom: 10, color: "var(--text-secondary)" }}>
              2 · Equipo extra (opcional)
            </div>
            <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--text-secondary)" }}>
              {kind === "servicio" && isServicioBridgeEmail(person?.email)
                ? "Como puente, suma a Carolina o Alejandro (día/hora ya van en el formulario)."
                : kind === "servicio"
                  ? "Solo soporte (Antonio, Carolina, Alejandro)."
                  : kind === "obra"
                    ? "Solo instaladores de campo (Joan, Israel, Juan José)."
                    : kind === "proyecto"
                      ? "Soporte e instaladores pueden colaborar en el proyecto."
                      : `El responsable es ${displayName}. Puedes sumar apoyo.`}
            </p>
            {teamForExtras.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-tertiary)" }}>
                No hay más personas en el tablero para sumar ahora.
              </p>
            ) : (
              <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {teamForExtras.map((u) => {
                  const on = extraIds.includes(u.id);
                  const src = u.avatarUrl ? resolveAssetUrl(u.avatarUrl) : null;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleExtra(u.id)}
                      title={u.nombre}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px 6px 6px",
                        borderRadius: 999,
                        border: on ? "1.5px solid var(--primary)" : "1px solid var(--border)",
                        background: on
                          ? "color-mix(in srgb, var(--primary) 12%, var(--surface))"
                          : "var(--surface)",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        color: "inherit",
                        fontSize: 12,
                        fontWeight: 650,
                      }}
                    >
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={src}
                          alt=""
                          width={28}
                          height={28}
                          style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }}
                        />
                      ) : (
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            display: "grid",
                            placeItems: "center",
                            fontSize: 10,
                            fontWeight: 800,
                            background: "color-mix(in srgb, var(--primary) 14%, var(--surface))",
                            color: "var(--primary)",
                          }}
                        >
                          {initials(u.nombre)}
                        </span>
                      )}
                      <span
                        style={{
                          maxWidth: 110,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {u.nombre.split(/\s+/).slice(0, 2).join(" ")}
                      </span>
                    </button>
                  );
                })}
              </div>
              {extraIds.length > 0 ? (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  {extraIds.map((id) => {
                    const u = teamForExtras.find((x) => x.id === id);
                    if (!u) return null;
                    return (
                      <label key={id} style={{ display: "block", fontSize: 12 }}>
                        <span style={{ fontWeight: 650, color: "var(--text-secondary)" }}>
                          Indicaciones para {u.nombre.split(/\s+/).slice(0, 2).join(" ")} (opcional)
                        </span>
                        <textarea
                          value={extraNotes[id] ?? ""}
                          onChange={(e) =>
                            setExtraNotes((prev) => ({ ...prev, [id]: e.target.value }))
                          }
                          rows={2}
                          style={{
                            width: "100%",
                            marginTop: 4,
                            padding: 8,
                            borderRadius: 10,
                            border: "1px solid var(--border)",
                            fontFamily: "inherit",
                            fontSize: 13,
                            resize: "vertical",
                            background: "var(--surface)",
                            color: "inherit",
                          }}
                          placeholder="Qué debe hacer esta persona…"
                        />
                      </label>
                    );
                  })}
                </div>
              ) : null}
              </>
            )}
          </section>

          <section
            style={{
              padding: 16,
              borderRadius: 16,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 750, marginBottom: 12, color: "var(--text-secondary)" }}>
              3 · {kindMeta.emoji} {kindMeta.title}
            </div>
            <OpsActivityForm
              key={kind}
              tone="core"
              coreKind={kind ?? undefined}
              initialResponsableId={userId}
              hideResponsableSelect
              forcedProjectMode={kindMeta.projectMode}
              hideProjectModePicker
              forcedTicketType={kindMeta.ticketType}
              forcedTicketTypeCustom={kindMeta.ticketTypeCustom}
              requireSchedule={Boolean(kindMeta.requiresSchedule)}
              onCancel={() => router.push(`/erp/pizarra/${userId}`)}
              onSuccess={(id) => void handleSuccess(id)}
            />
          </section>
        </>
      ) : (
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          Elige un tipo para continuar.
        </p>
      )}
    </div>
  );
}
