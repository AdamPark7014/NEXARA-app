"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import {
  ACTIVITY_KINDS,
  ASSIGNMENT_CHARGES,
  canOfferAssignmentCharge,
  isServicioBridgeEmail,
  kindsForAssignment,
  metaForKind,
  ORG_EMAILS,
  peerCoordinatorEmails,
  servicioDelegateEmails,
  servicioShouldGoToBridge,
  teamPoolEmailsForAssignment,
  type ActivityKind,
  type AssignmentCharge,
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
  rol: "LEAD" | "TECNICO" | "APOYO" = "TECNICO",
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
      rol,
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
  const [charge, setCharge] = useState<AssignmentCharge | null>(null);
  const [person, setPerson] = useState<TeamBoardUser | null>(null);
  const [roster, setRoster] = useState<TeamBoardUser[]>([]);
  const [boardUsers, setBoardUsers] = useState<TeamBoardUser[]>([]);
  const [extraIds, setExtraIds] = useState<number[]>([]);
  const [extraNotes, setExtraNotes] = useState<Record<number, string>>({});
  /** Indicaciones personales del responsable (primer asignado de /asignar). */
  const [leadNotes, setLeadNotes] = useState("");
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
  const offerCharge = canOfferAssignmentCharge(person?.email);
  const chargeReady = !offerCharge || charge != null;
  const chargeMeta = charge ? ASSIGNMENT_CHARGES[charge] : null;

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
    // Despacho / tipo: pool unido (p. ej. Proyecto = instaladores + soporte).
    const pool = teamPoolEmailsForAssignment({
      managerEmail: person?.email,
      kind,
      charge,
    });
    if (pool.length) {
      const allow = new Set(pool.map((e) => e.toLowerCase()));
      return roster.filter((u) => allow.has((u.email || "").toLowerCase()));
    }
    return roster;
  }, [kind, person?.email, roster, charge]);

  const autoPeerCoordinators = useMemo(() => {
    const selectedEmails = extraIds
      .map((id) => {
        const u = teamForExtras.find((x) => x.id === id) ?? boardUsers.find((x) => x.id === id);
        return (u?.email || "").toLowerCase();
      })
      .filter(Boolean);
    const peerEmails = peerCoordinatorEmails({
      primaryEmail: person?.email,
      memberEmails: selectedEmails,
    });
    return peerEmails
      .map((email) => boardUsers.find((u) => (u.email || "").toLowerCase() === email) ?? null)
      .filter((u): u is TeamBoardUser => Boolean(u));
  }, [extraIds, teamForExtras, boardUsers, person?.email]);

  useEffect(() => {
    setCharge(null);
  }, [userId]);

  useEffect(() => {
    if (!offerCharge) setCharge(null);
  }, [offerCharge]);

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
      const needPrimaryLead =
        Boolean(leadNotes.trim()) ||
        autoPeerCoordinators.length > 0 ||
        (charge === "despacho" && extraIds.length > 0);

      if (needPrimaryLead) {
        await addTeamMember(
          token,
          activityId,
          userId,
          leadNotes.trim() ||
            (autoPeerCoordinators.length
              ? "Coordinación de su equipo en esta actividad."
              : undefined),
          "LEAD",
        );
      }

      const peerIds = new Set(autoPeerCoordinators.map((u) => u.id));
      for (const peer of autoPeerCoordinators) {
        if (peer.id === userId) continue;
        // Si también está en extras, ya se suma abajo como LEAD con sus notas.
        if (extraIds.includes(peer.id)) continue;
        await addTeamMember(
          token,
          activityId,
          peer.id,
          "Coordinación de su equipo en esta actividad cruzada (instalación / soporte).",
          "LEAD",
        );
      }

      for (const id of extraIds) {
        const rol = peerIds.has(id) || id === userId ? "LEAD" : "TECNICO";
        await addTeamMember(token, activityId, id, extraNotes[id], rol);
      }
    } catch (e) {
      setTeamError(formatApiError(e, "Actividad creada, pero falló al sumar el equipo"));
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

      {kind && offerCharge && !bridgeNeeded ? (
        <section>
          <div style={{ fontSize: 13, fontWeight: 750, marginBottom: 10, color: "var(--text-secondary)" }}>
            2 · Encargo a {displayName.split(/\s+/).slice(0, 2).join(" ")}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 10,
            }}
          >
            {(Object.keys(ASSIGNMENT_CHARGES) as AssignmentCharge[]).map((id) => {
              const opt = ASSIGNMENT_CHARGES[id];
              const selected = charge === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCharge(id)}
                  style={{
                    textAlign: "left",
                    padding: "14px 14px",
                    borderRadius: 16,
                    border: selected ? "2px solid var(--primary)" : "1px solid var(--border)",
                    background: selected
                      ? "color-mix(in srgb, var(--primary) 10%, var(--surface))"
                      : "var(--surface)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    color: "inherit",
                    minHeight: 96,
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{opt.title}</div>
                  <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    {opt.help}
                  </div>
                </button>
              );
            })}
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.4 }}>
            <strong>Ejecución directa</strong>: la hace él. <strong>Despacho a equipo</strong>: él la
            coordina y la asigna a alguien de su subordinación (puedes dejarla pendiente o sumar ya al
            ejecutor abajo).
          </p>
        </section>
      ) : null}

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

      {kindMeta && !bridgeNeeded && chargeReady ? (
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
              {offerCharge ? "3" : "2"} · Equipo{" "}
              {charge === "despacho" ? "(ejecutor / apoyo)" : "extra (opcional)"}
            </div>
            <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--text-secondary)" }}>
              {charge === "despacho"
                ? kind === "proyecto"
                  ? `Despacho: puedes sumar instaladores y soporte. Si mezclas ambos, se asigna también al otro coordinador (p. ej. Antonio) además de ${displayName.split(/\s+/).slice(0, 2).join(" ")} y a los subordinados elegidos.`
                  : `Como despacho, suma a quien debe ejecutarla bajo ${displayName.split(/\s+/).slice(0, 2).join(" ")}. Si no eliges a nadie, queda pendiente de que él la asigne.`
                : kind === "servicio" && isServicioBridgeEmail(person?.email)
                ? "Como puente, suma a Carolina o Alejandro (día/hora ya van en el formulario)."
                : kind === "servicio"
                  ? "Solo soporte (Antonio, Carolina, Alejandro)."
                  : kind === "obra"
                    ? "Solo instaladores de campo (Joan, Israel, Juan José)."
                    : kind === "proyecto"
                      ? "Soporte e instaladores pueden colaborar en el proyecto. Si hay ambos lados, se suman ambos coordinadores."
                      : charge === "ejecucion"
                        ? `Ejecución directa de ${displayName.split(/\s+/).slice(0, 2).join(" ")}. Puedes sumar apoyo opcional.`
                        : `El responsable es ${displayName}. Puedes sumar apoyo.`}
            </p>
            {autoPeerCoordinators.length > 0 ? (
              <div
                role="status"
                style={{
                  marginBottom: 10,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid color-mix(in srgb, #16a34a 35%, var(--border))",
                  background: "color-mix(in srgb, #16a34a 10%, var(--surface))",
                  fontSize: 12.5,
                  lineHeight: 1.45,
                }}
              >
                <strong>Coordinadores automáticos:</strong> además del responsable, se asignará como LEAD a{" "}
                {autoPeerCoordinators.map((u) => u.nombre.split(/\s+/).slice(0, 2).join(" ")).join(", ")}{" "}
                (por el equipo cruzado instaladores / soporte).
              </div>
            ) : null}
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
                  <label style={{ display: "block", fontSize: 12 }}>
                    <span style={{ fontWeight: 650, color: "var(--text-secondary)" }}>
                      Indicaciones para {displayName.split(/\s+/).slice(0, 2).join(" ")}{" "}
                      (responsable, opcional)
                    </span>
                    <textarea
                      value={leadNotes}
                      onChange={(e) => setLeadNotes(e.target.value)}
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
                      placeholder={`Qué debe hacer ${displayName.split(/\s+/).slice(0, 2).join(" ")}…`}
                    />
                  </label>
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
              {offerCharge ? "4" : "3"} · {kindMeta.emoji} {kindMeta.title}
              {chargeMeta ? ` · ${chargeMeta.badge}` : ""}
            </div>
            <OpsActivityForm
              key={`${kind}-${charge ?? "none"}`}
              tone="core"
              coreKind={kind ?? undefined}
              assignmentCharge={charge ?? undefined}
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
      ) : kindMeta && !bridgeNeeded && offerCharge && !charge ? (
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          Elige el encargo (ejecución directa o despacho a equipo) para continuar.
        </p>
      ) : (
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          Elige un tipo para continuar.
        </p>
      )}
    </div>
  );
}
