"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";
import {
  ACTIVITY_KINDS,
  ASSIGNMENT_CHARGES,
  canOfferAssignmentCharge,
  forcesDespachoOnly,
  forcesEjecucionOnly,
  formatDispatchHeadcountNote,
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
import ActivityKindIcon from "@/components/ops/ActivityKindIcon";
import { Skeleton } from "@/components/base";
import { CHARGE_LABEL, initials, shortName } from "@/lib/activity-labels";
import {
  fetchTeamBoard,
  fetchTeamBoardUser,
  type TeamBoardUser,
} from "@/lib/team-board-api";

const OpsActivityForm = dynamic(() => import("@/components/ops/OpsActivityForm"), {
  ssr: false,
  loading: () => (
    <div aria-busy="true" aria-label="Cargando formulario" style={{ display: "grid", gap: 10 }}>
      <Skeleton height={44} radius={10} />
      <Skeleton height={44} radius={10} />
      <Skeleton height={88} radius={10} />
    </div>
  ),
});

/** Ayuda de cada encargo en palabras de campo (el título se queda igual). */
const CHARGE_HELP: Record<AssignmentCharge, string> = {
  ejecucion: `${CHARGE_LABEL.ejecucion}: queda a su cargo y la realiza en persona.`,
  despacho: "La reparte a su gente: queda a su cargo coordinar quién la hace.",
};

type PasoId = "tipo" | "encargo" | "tiempo" | "equipo" | "datos";

const stepTitle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 750,
  color: "var(--text-secondary)",
};

const fieldLabel: CSSProperties = { fontSize: 13, fontWeight: 650, color: "var(--text-secondary)" };

const textareaStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  fontFamily: "inherit",
  fontSize: 16,
  lineHeight: 1.4,
  resize: "vertical",
  background: "var(--surface)",
  color: "inherit",
  boxSizing: "border-box",
};

const numberStyle: CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  font: "inherit",
  fontSize: 16,
  fontWeight: 700,
  background: "var(--surface)",
  color: "inherit",
  boxSizing: "border-box",
};

const primaryButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 44,
  padding: "10px 16px",
  border: "none",
  borderRadius: 12,
  background: "var(--primary)",
  color: "#fff",
  fontWeight: 750,
  fontSize: 14,
  cursor: "pointer",
  fontFamily: "inherit",
};

const secondaryButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  justifySelf: "start",
  minHeight: 44,
  padding: "8px 14px",
  border: "1px solid var(--border)",
  borderRadius: 12,
  background: "var(--surface)",
  color: "inherit",
  fontWeight: 650,
  fontSize: 14,
  textDecoration: "none",
  cursor: "pointer",
  fontFamily: "inherit",
};

const nextHint: CSSProperties = { fontSize: 14, color: "var(--text-secondary)", margin: 0 };

function TeamErrorBox({ error }: { error: { activityId: number; text: string } }) {
  return (
    <div
      role="alert"
      style={{
        padding: "12px 14px",
        borderRadius: 14,
        border: "1px solid color-mix(in srgb, #d97706 45%, var(--border))",
        background: "color-mix(in srgb, #d97706 9%, var(--surface))",
        display: "grid",
        gap: 8,
        fontSize: 13.5,
        lineHeight: 1.45,
      }}
    >
      <span>
        <strong>La actividad ya se creó</strong>, pero no se pudo sumar a todo el equipo: {error.text}
      </span>
      <span style={{ color: "var(--text-secondary)" }}>
        No la vuelvas a crear: abre la actividad y revisa quién quedó.
      </span>
      <Link href={`/erp/actividades/${error.activityId}`} style={secondaryButton}>
        Abrir la actividad →
      </Link>
    </div>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-grid",
        placeItems: "center",
        width: 24,
        height: 24,
        marginRight: 8,
        borderRadius: "50%",
        background: "var(--primary)",
        color: "#fff",
        fontSize: 12.5,
        fontWeight: 800,
        verticalAlign: "middle",
      }}
    >
      {n}
    </span>
  );
}

async function addTeamMember(
  token: string,
  activityId: number,
  userId: number,
  indicaciones?: string,
  rol: "LEAD" | "TECNICO" | "APOYO" = "TECNICO",
  /** Tiempo estimado de esta persona, en horas (decimal). */
  horasPlan?: number | null,
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
      ...(horasPlan != null && horasPlan > 0 ? { horasPlan } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
}

/** «2 h 30 min» → 2.5 horas (lo que guarda la API en horasPlan). */
function horasPlanDe(horas: number, minutos: number): number {
  const total = Math.max(0, horas) * 60 + Math.max(0, minutos);
  return Math.round((total / 60) * 100) / 100;
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
  const [headcount, setHeadcount] = useState(1);
  /** Tiempo estimado de la actividad (obligatorio): se guarda como horasPlan. */
  const [planHoras, setPlanHoras] = useState(1);
  const [planMinutos, setPlanMinutos] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** La actividad ya existe pero falló sumar al equipo: no se debe volver a crear. */
  const [teamError, setTeamError] = useState<{ activityId: number; text: string } | null>(null);

  const horasPlan = horasPlanDe(planHoras, planMinutos);
  const planValido = horasPlan > 0;

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
  // Luis o Antonio + servicio: despacho, sin elegir al ingeniero.
  // Luis en tarea/proyecto/comercial: ejecución directa.
  // David/Josué: eligen ejecución vs despacho; si es despacho, ellos eligen al ejecutor después.
  const despachoOnly = forcesDespachoOnly(person?.email, kind);
  const ejecucionOnly = forcesEjecucionOnly(person?.email, kind);
  const offerCharge =
    canOfferAssignmentCharge(person?.email) && !despachoOnly && !ejecucionOnly;
  const chargeReady =
    despachoOnly ||
    ejecucionOnly ||
    !canOfferAssignmentCharge(person?.email) ||
    charge != null;
  const effectiveCharge: AssignmentCharge | null = despachoOnly
    ? "despacho"
    : ejecucionOnly
      ? "ejecucion"
      : charge;

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
      charge: effectiveCharge,
    });
    if (pool.length) {
      const allow = new Set(pool.map((e) => e.toLowerCase()));
      return roster.filter((u) => allow.has((u.email || "").toLowerCase()));
    }
    return roster;
  }, [kind, person?.email, roster, effectiveCharge]);

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
    setHeadcount(1);
    setLeadNotes("");
    setExtraIds([]);
  }, [userId]);

  useEffect(() => {
    setCharge(null);
    setHeadcount(1);
    setExtraIds([]);
  }, [kind]);

  useEffect(() => {
    if (despachoOnly) setCharge("despacho");
    else if (ejecucionOnly) setCharge("ejecucion");
    else if (!offerCharge) setCharge(null);
  }, [despachoOnly, ejecucionOnly, offerCharge]);

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
    const fichaAsignada = `/erp/pizarra/${userId}?asignada=${activityId}`;
    if (!token) {
      router.push(fichaAsignada);
      return;
    }
    setTeamError(null);
    try {
      // Servicio a Luis o a Antonio: solo el LEAD. El ingeniero lo elige quien reparte.
      if (despachoOnly) {
        await addTeamMember(
          token,
          activityId,
          userId,
          formatDispatchHeadcountNote(headcount, leadNotes),
          "LEAD",
          horasPlan,
        );
        router.push(fichaAsignada);
        return;
      }

      // Despacho a otro mando: no se elige aquí a quien la ejecuta.
      if (effectiveCharge === "despacho" && canOfferAssignmentCharge(person?.email)) {
        await addTeamMember(token, activityId, userId, leadNotes.trim(), "LEAD", horasPlan);
        router.push(fichaAsignada);
        return;
      }

      // Luis + tarea/proyecto/comercial: ejecución personal, sin equipo.
      if (ejecucionOnly) {
        // Siempre se manda: aunque no haya indicaciones, el tiempo estimado sí va.
        await addTeamMember(token, activityId, userId, leadNotes.trim(), "LEAD", horasPlan);
        router.push(fichaAsignada);
        return;
      }

      await addTeamMember(
        token,
        activityId,
        userId,
        leadNotes.trim() ||
          (autoPeerCoordinators.length ? "Coordinación de su equipo en esta actividad." : undefined),
        "LEAD",
        horasPlan,
      );

      const peerIds = new Set(autoPeerCoordinators.map((u) => u.id));
      for (const peer of autoPeerCoordinators) {
        if (peer.id === userId) continue;
        if (extraIds.includes(peer.id)) continue;
        await addTeamMember(
          token,
          activityId,
          peer.id,
          "Coordinación de su equipo en esta actividad cruzada (instalación / soporte).",
          "LEAD",
          horasPlan,
        );
      }

      for (const id of extraIds) {
        const rol = peerIds.has(id) || id === userId ? "LEAD" : "TECNICO";
        await addTeamMember(token, activityId, id, extraNotes[id], rol, horasPlan);
      }
    } catch (e) {
      setTeamError({ activityId, text: formatApiError(e, "error de conexión") });
      return;
    }
    router.push(fichaAsignada);
  };

  if (!Number.isFinite(userId)) {
    return (
      <p role="alert" style={{ color: "var(--danger)", fontSize: 14 }}>
        No encontramos a esta persona.
      </p>
    );
  }

  const avatarSrc = person?.avatarUrl ? resolveAssetUrl(person.avatarUrl) : null;
  const displayName = person?.nombre ?? "Cargando…";
  const nombreCorto = person ? shortName(person.nombre) : "esta persona";

  // Pasos en el orden en que aparecen: se numeran seguidos, sin saltos.
  const verEncargo = Boolean(kind) && !bridgeNeeded && (despachoOnly || ejecucionOnly || offerCharge);
  const verTiempo = Boolean(kindMeta) && !bridgeNeeded && chargeReady;
  const despachoAMando =
    effectiveCharge === "despacho" && canOfferAssignmentCharge(person?.email);
  const verEquipo = verTiempo && planValido && !despachoOnly && !ejecucionOnly && !despachoAMando;
  const pasos: PasoId[] = [
    "tipo",
    ...(verEncargo ? (["encargo"] as const) : []),
    ...(verTiempo ? (["tiempo"] as const) : []),
    ...(verEquipo ? (["equipo"] as const) : []),
    ...(verTiempo && planValido ? (["datos"] as const) : []),
  ];
  const paso = (id: PasoId) => pasos.indexOf(id) + 1;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <button
        type="button"
        onClick={() => router.push(`/erp/pizarra/${userId}`)}
        style={{
          alignSelf: "flex-start",
          minHeight: 44,
          border: "none",
          background: "transparent",
          color: "var(--text-secondary)",
          fontWeight: 650,
          fontSize: 14,
          cursor: "pointer",
          padding: "8px 0",
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
            {person ? initials(person.nombre) : ""}
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
            Asignar actividad a
          </div>
          <h1 style={{ margin: "2px 0 0", fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>
            {displayName}
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
            {person?.puesto || "Elige el tipo y completa los datos"}
          </p>
        </div>
      </header>

      {loadError ? (
        <div
          role="alert"
          style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 14, color: "var(--danger)" }}
        >
          <span>{loadError}</span>
          <button type="button" onClick={() => void load()} style={secondaryButton}>
            Reintentar
          </button>
        </div>
      ) : null}
      {teamError ? <TeamErrorBox error={teamError} /> : null}

      <section>
        <h2 style={{ ...stepTitle, marginBottom: 10 }}>
          <StepBadge n={paso("tipo")} />
          Tipo de actividad
        </h2>
        {!person && !loadError ? (
          <div
            aria-busy="true"
            aria-label="Cargando tipos"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}
          >
            <Skeleton height={112} radius={16} />
            <Skeleton height={112} radius={16} />
            <Skeleton height={112} radius={16} />
          </div>
        ) : null}
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
                aria-pressed={selected}
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
                <ActivityKindIcon kind={opt.icon} variant="badge" size={36} />
                <div style={{ marginTop: 8, fontWeight: 800, fontSize: 14 }}>{opt.title}</div>
                <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.35 }}>
                  {opt.help}
                </div>
              </button>
            );
          })}
        </div>
        {person ? (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--text-tertiary)", lineHeight: 1.4 }}>
            Solo ves los tipos que {nombreCorto} puede recibir.
          </p>
        ) : null}
      </section>

      {kind && despachoOnly && !bridgeNeeded ? (
        <section
          style={{
            padding: 14,
            borderRadius: 16,
            border: "1px solid color-mix(in srgb, var(--primary) 35%, var(--border))",
            background: "color-mix(in srgb, var(--primary) 8%, var(--surface))",
            display: "grid",
            gap: 12,
          }}
        >
          <div>
            <h2 style={stepTitle}>
              <StepBadge n={paso("encargo")} />
              Encargo a {nombreCorto}
            </h2>
            <p style={{ margin: "8px 0 0", fontSize: 15, fontWeight: 800 }}>Despacho a equipo</p>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45 }}>
              {isServicioBridgeEmail(person?.email)
                ? `Se la dejas a ${nombreCorto}. Él elige al ingeniero de su equipo. Tú no eliges quién la ejecuta.`
                : "La reparte a su gente. En servicios le dejas la actividad y cuántas personas ocupas; él se la manda a Antonio y Antonio elige al soporte."}
            </p>
          </div>
          <label style={{ display: "grid", gap: 4, maxWidth: 220 }}>
            <span style={fieldLabel}>Personas que se ocupan *</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              value={headcount}
              onChange={(e) => setHeadcount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              style={numberStyle}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={fieldLabel}>Indicaciones para {nombreCorto} (opcional)</span>
            <textarea
              value={leadNotes}
              onChange={(e) => setLeadNotes(e.target.value)}
              rows={2}
              placeholder="Qué debe coordinar, contexto…"
              style={textareaStyle}
            />
          </label>
        </section>
      ) : null}

      {kind && ejecucionOnly && !bridgeNeeded ? (
        <section
          style={{
            padding: 14,
            borderRadius: 16,
            border: "1px solid color-mix(in srgb, var(--primary) 35%, var(--border))",
            background: "color-mix(in srgb, var(--primary) 8%, var(--surface))",
            display: "grid",
            gap: 10,
          }}
        >
          <div>
            <h2 style={stepTitle}>
              <StepBadge n={paso("encargo")} />
              Encargo a {nombreCorto}
            </h2>
            <p style={{ margin: "8px 0 0", fontSize: 15, fontWeight: 800 }}>Ejecución directa</p>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45 }}>
              {CHARGE_LABEL.ejecucion}, sin repartirla a nadie más.
            </p>
          </div>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={fieldLabel}>Indicaciones (opcional)</span>
            <textarea
              value={leadNotes}
              onChange={(e) => setLeadNotes(e.target.value)}
              rows={2}
              placeholder="Qué debe hacer…"
              style={textareaStyle}
            />
          </label>
        </section>
      ) : null}

      {kind && offerCharge && !bridgeNeeded ? (
        <section>
          <h2 style={{ ...stepTitle, marginBottom: 10 }}>
            <StepBadge n={paso("encargo")} />
            Encargo a {nombreCorto}
          </h2>
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
                  aria-pressed={selected}
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
                  <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    {CHARGE_HELP[id]}
                  </div>
                </button>
              );
            })}
          </div>
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
          <strong>Los servicios van primero a Antonio.</strong> Él agenda el día y la hora con Carolina o
          Alejandro.
          {antonioOnBoard ? (
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                onClick={() => router.push(`/erp/pizarra/${antonioOnBoard.id}/asignar`)}
                style={primaryButton}
              >
                Ir a asignar a {shortName(antonioOnBoard.nombre)} →
              </button>
            </div>
          ) : (
            <p style={{ margin: "8px 0 0", fontSize: 13 }}>
              No encontramos a Antonio en el tablero. Avísale a dirección.
            </p>
          )}
        </div>
      )}

      {kindMeta && !bridgeNeeded && chargeReady ? (
        <section
          style={{
            padding: 14,
            borderRadius: 16,
            border: planValido
              ? "1px solid var(--border)"
              : "1px solid color-mix(in srgb, #d97706 45%, var(--border))",
            background: "var(--surface)",
            display: "grid",
            gap: 10,
          }}
        >
          <div>
            <h2 style={stepTitle}>
              <StepBadge n={paso("tiempo")} />
              ¿Cuánto tiempo toma? *
            </h2>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45 }}>
              Cuánto debería tomarle. Con esto se compara el tiempo real y se avisa si se pasa.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={{ display: "grid", gap: 4, width: 130 }}>
              <span style={fieldLabel}>Horas</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={99}
                value={planHoras}
                onChange={(e) => setPlanHoras(Math.max(0, Math.min(99, Number(e.target.value) || 0)))}
                style={numberStyle}
              />
            </label>
            <label style={{ display: "grid", gap: 4, width: 130 }}>
              <span style={fieldLabel}>Minutos</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={59}
                step={5}
                value={planMinutos}
                onChange={(e) => setPlanMinutos(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
                style={numberStyle}
              />
            </label>
          </div>
          {!planValido ? (
            <p style={{ margin: 0, fontSize: 13, color: "#b45309" }}>
              Pon al menos unos minutos: sin tiempo estimado no se puede avisar si se excede.
            </p>
          ) : null}
        </section>
      ) : null}

      {kindMeta && !bridgeNeeded && chargeReady && planValido ? (
        <>
          {!despachoOnly && !ejecucionOnly ? (
          <section
            style={{
              padding: 14,
              borderRadius: 16,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <h2 style={{ ...stepTitle, marginBottom: 6 }}>
              <StepBadge n={paso("equipo")} />
              {effectiveCharge === "despacho" ? "¿Quién la hace?" : "¿Alguien más ayuda? (opcional)"}
            </h2>
            <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45 }}>
              {effectiveCharge === "despacho"
                ? kind === "proyecto"
                  ? `Puedes sumar instaladores y soporte. Si mezclas a los dos equipos, también se avisa al otro encargado (por ejemplo Antonio), además de ${nombreCorto}.`
                  : `Suma a quien la hará con ${nombreCorto}. Si no eliges a nadie, ${nombreCorto} la reparte después.`
                : kind === "servicio" && isServicioBridgeEmail(person?.email)
                ? "Suma a Carolina o Alejandro (el día y la hora van en el formulario)."
                : kind === "servicio"
                  ? "Solo soporte (Antonio, Carolina, Alejandro)."
                  : kind === "obra"
                    ? "Solo instaladores de campo (Joan, Israel, Juan José)."
                    : kind === "proyecto"
                      ? "Soporte e instaladores pueden colaborar. Si hay gente de los dos lados, se avisa a los dos encargados."
                      : effectiveCharge === "ejecucion"
                        ? `${nombreCorto} la hace. Si quieres, suma a alguien de apoyo.`
                        : `${nombreCorto} queda como responsable. Si quieres, suma a alguien de apoyo.`}
            </p>
            {autoPeerCoordinators.length > 0 ? (
              <div
                role="status"
                style={{
                  marginBottom: 10,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid color-mix(in srgb, var(--primary) 35%, var(--border))",
                  background: "color-mix(in srgb, var(--primary) 10%, var(--surface))",
                  fontSize: 12.5,
                  lineHeight: 1.45,
                }}
              >
                <strong>Se suman encargados:</strong> además de {nombreCorto}, también se avisará a{" "}
                {autoPeerCoordinators.map((u) => shortName(u.nombre)).join(", ")} para coordinar (hay gente de
                instalación y de soporte).
              </div>
            ) : null}
            {teamForExtras.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-tertiary)" }}>
                No hay más personas disponibles para sumar ahora.
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
                      aria-pressed={on}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        minHeight: 44,
                        padding: "6px 12px 6px 6px",
                        borderRadius: 999,
                        border: on ? "1.5px solid var(--primary)" : "1px solid var(--border)",
                        background: on
                          ? "color-mix(in srgb, var(--primary) 12%, var(--surface))"
                          : "var(--surface)",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        color: "inherit",
                        fontSize: 13,
                        fontWeight: 650,
                      }}
                    >
                      {on ? (
                        <span aria-hidden style={{ color: "var(--primary)", fontWeight: 800 }}>
                          ✓
                        </span>
                      ) : null}
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
                        {shortName(u.nombre)}
                      </span>
                    </button>
                  );
                })}
              </div>
              {extraIds.length > 0 ? (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={fieldLabel}>Indicaciones para {nombreCorto} (responsable, opcional)</span>
                    <textarea
                      value={leadNotes}
                      onChange={(e) => setLeadNotes(e.target.value)}
                      rows={2}
                      style={textareaStyle}
                      placeholder={`Qué debe hacer ${nombreCorto}…`}
                    />
                  </label>
                  {extraIds.map((id) => {
                    const u = teamForExtras.find((x) => x.id === id);
                    if (!u) return null;
                    return (
                      <label key={id} style={{ display: "grid", gap: 4 }}>
                        <span style={fieldLabel}>Indicaciones para {shortName(u.nombre)} (opcional)</span>
                        <textarea
                          value={extraNotes[id] ?? ""}
                          onChange={(e) =>
                            setExtraNotes((prev) => ({ ...prev, [id]: e.target.value }))
                          }
                          rows={2}
                          style={textareaStyle}
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
          ) : null}

          <section
            style={{
              padding: 16,
              borderRadius: 16,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <h2 style={{ ...stepTitle, marginBottom: 12, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
              <StepBadge n={paso("datos")} />
              <ActivityKindIcon kind={kindMeta.icon} size={16} />
              <span>
                {kindMeta.title}
                {effectiveCharge ? ` · ${CHARGE_LABEL[effectiveCharge]}` : ""}
                {despachoOnly ? ` · ${headcount} persona${headcount === 1 ? "" : "s"}` : ""}
              </span>
            </h2>
            {teamError ? (
              <div style={{ marginBottom: 12 }}>
                <TeamErrorBox error={teamError} />
              </div>
            ) : null}
            <OpsActivityForm
              key={`${kind}-${effectiveCharge ?? "none"}-${despachoOnly ? headcount : "x"}`}
              tone="core"
              coreKind={kind ?? undefined}
              assignmentCharge={effectiveCharge ?? undefined}
              initialResponsableId={userId}
              extraTeamIds={extraIds}
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
      ) : bridgeNeeded ? null : kindMeta && chargeReady && !planValido ? (
        <p style={nextHint}>Indica el tiempo estimado para continuar.</p>
      ) : kindMeta && offerCharge && !charge ? (
        <p style={nextHint}>Elige si la hace {nombreCorto} o si la reparte a su equipo para continuar.</p>
      ) : person ? (
        <p style={nextHint}>Elige un tipo para continuar.</p>
      ) : null}
    </div>
  );
}
