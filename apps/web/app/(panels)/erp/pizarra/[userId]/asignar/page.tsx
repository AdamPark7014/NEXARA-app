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
import { resolveV2RoleKey } from "@/lib/user-access";
import ActivityKindIcon from "@/components/ops/ActivityKindIcon";
import { DurationWheelPicker } from "@/components/ui/DurationWheelPicker";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Field,
  FormSection,
  Input,
  PageHead,
  PendingList,
  RequiredMark,
  Skeleton,
  SkeletonRows,
  Textarea,
  type PendingItem,
} from "@/components/base";
import { OpcionPersona, OpcionTarjeta, RejillaOpciones } from "@/components/pizarra/Opciones";
import c from "@/components/pizarra/comun.module.css";
import { CHARGE_LABEL, shortName } from "@/lib/activity-labels";
import {
  fetchTeamBoard,
  fetchTeamBoardUser,
  type TeamBoardUser,
} from "@/lib/team-board-api";
import { sumarPendientes, type PasoEquipo } from "@/lib/asignar-equipo";
import a from "./asignar.module.css";

const OpsActivityForm = dynamic(() => import("@/components/ops/OpsActivityForm"), {
  ssr: false,
  loading: () => <SkeletonRows rows={3} label="Cargando formulario" />,
});

/** Ayuda de cada encargo en palabras de campo (el título se queda igual). */
const CHARGE_HELP: Record<AssignmentCharge, string> = {
  ejecucion: `${CHARGE_LABEL.ejecucion}: queda a su cargo y la realiza en persona.`,
  despacho: "La reparte a su gente: queda a su cargo coordinar quién la hace.",
};

type PasoId = "tipo" | "encargo" | "tiempo" | "equipo" | "datos";

const ID_PASO: Record<PasoId, string> = {
  tipo: "asignar-tipo",
  encargo: "asignar-encargo",
  tiempo: "asignar-tiempo",
  equipo: "asignar-equipo",
  datos: "asignar-datos",
};

/** La actividad ya existe: mientras se suma al equipo (o si falló) el formulario no se muestra. */
function EquipoPendienteBox({
  activityId,
  sumando,
  error,
  onRetry,
}: {
  activityId: number;
  sumando: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (sumando || !error) {
    return (
      <div role="status" aria-busy={sumando} className={a.sumando}>
        <SkeletonRows rows={1} label="Sumando al equipo" />
        <span className={c.tenue}>Actividad creada. Sumando al equipo…</span>
      </div>
    );
  }
  return (
    <Alert
      tone="warning"
      role="alert"
      title="La actividad ya se creó"
      action={
        <span className={c.fila}>
          <Button variant="primary" size="sm" className={c.tap} onClick={onRetry}>
            Reintentar
          </Button>
          <ButtonLink href={`/erp/actividades/${activityId}`} size="sm" className={c.tap} iconEnd={<ArrowForwardIcon />}>
            Abrir la actividad
          </ButtonLink>
        </span>
      }
    >
      , pero no se pudo sumar a todo el equipo: {error}
      <span className={a.nota}>«Reintentar» solo suma a quien faltó; no crea otra actividad.</span>
    </Alert>
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
  /** La actividad ya existe: quién falta sumar al equipo. Mientras exista, no se vuelve a crear. */
  const [pendiente, setPendiente] = useState<{ activityId: number; pasos: PasoEquipo[] } | null>(null);
  const [sumando, setSumando] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);

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

  /** A quién se suma al equipo, en orden, según el encargo elegido. */
  const planEquipo = (): PasoEquipo[] => {
    // Servicio a Luis o a Antonio: solo el LEAD. El ingeniero lo elige quien reparte.
    if (despachoOnly) {
      return [
        {
          userId,
          indicaciones: formatDispatchHeadcountNote(headcount, leadNotes),
          rol: "LEAD",
          horasPlan,
        },
      ];
    }
    // Despacho a otro mando: no se elige aquí a quien la ejecuta.
    // Luis + tarea/proyecto/comercial: ejecución personal, sin equipo. Siempre se manda: aunque
    // no haya indicaciones, el tiempo estimado sí va.
    if ((effectiveCharge === "despacho" && canOfferAssignmentCharge(person?.email)) || ejecucionOnly) {
      return [{ userId, indicaciones: leadNotes.trim(), rol: "LEAD", horasPlan }];
    }

    const pasos: PasoEquipo[] = [
      {
        userId,
        indicaciones:
          leadNotes.trim() ||
          (autoPeerCoordinators.length ? "Coordinación de su equipo en esta actividad." : undefined),
        rol: "LEAD",
        horasPlan,
      },
    ];
    const peerIds = new Set(autoPeerCoordinators.map((u) => u.id));
    for (const peer of autoPeerCoordinators) {
      if (peer.id === userId || extraIds.includes(peer.id)) continue;
      pasos.push({
        userId: peer.id,
        indicaciones: "Coordinación de su equipo en esta actividad cruzada (instalación / soporte).",
        rol: "LEAD",
        horasPlan,
      });
    }
    for (const id of extraIds) {
      pasos.push({
        userId: id,
        indicaciones: extraNotes[id],
        rol: peerIds.has(id) || id === userId ? "LEAD" : "TECNICO",
        horasPlan,
      });
    }
    return pasos;
  };

  const correrPasos = async (activityId: number, pasos: PasoEquipo[]) => {
    const fichaAsignada = `/erp/pizarra/${userId}?asignada=${activityId}`;
    if (!token) {
      router.push(fichaAsignada);
      return;
    }
    setSumando(true);
    setTeamError(null);
    const { pendientes, error } = await sumarPendientes(pasos, (p) =>
      addTeamMember(token, activityId, p.userId, p.indicaciones, p.rol, p.horasPlan),
    );
    setSumando(false);
    if (pendientes.length) {
      setPendiente({ activityId, pasos: pendientes });
      const quien =
        pendientes[0].userId === userId
          ? person?.nombre
          : boardUsers.find((u) => u.id === pendientes[0].userId)?.nombre;
      const motivo = formatApiError(error, "error de conexión");
      setTeamError(quien ? `${shortName(quien)}: ${motivo}` : motivo);
      return;
    }
    router.push(fichaAsignada);
  };

  const handleSuccess = (activityId: number) => {
    const pasos = planEquipo();
    setPendiente({ activityId, pasos });
    void correrPasos(activityId, pasos);
  };

  const reintentarEquipo = () => {
    if (!pendiente || sumando) return;
    void correrPasos(pendiente.activityId, pendiente.pasos);
  };

  if (!Number.isFinite(userId)) {
    return (
      <div className={a.pagina}>
        <Alert tone="danger" role="alert">
          No encontramos a esta persona.
        </Alert>
      </div>
    );
  }

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

  // Lista de la derecha: qué ya quedó y qué falta, en el mismo orden que los pasos.
  const tiempoTexto = planValido
    ? [planHoras > 0 ? `${planHoras} h` : "", planMinutos > 0 ? `${planMinutos} min` : ""].filter(Boolean).join(" ")
    : "falta el tiempo estimado";
  const pendientes: PendingItem[] = [
    {
      id: "tipo",
      label: "Tipo de actividad",
      hint: kindMeta ? kindMeta.title : "elige uno",
      done: Boolean(kind),
      fieldId: ID_PASO.tipo,
    },
    ...(verEncargo
      ? [
          {
            id: "encargo",
            label: "Encargo",
            hint: effectiveCharge ? CHARGE_LABEL[effectiveCharge] : "la hace o la reparte",
            done: chargeReady,
            fieldId: ID_PASO.encargo,
          },
        ]
      : []),
    ...(verTiempo
      ? [
          {
            id: "tiempo",
            label: "Tiempo estimado",
            hint: tiempoTexto,
            done: planValido,
            error: !planValido,
            fieldId: ID_PASO.tiempo,
          },
        ]
      : []),
    ...(verEquipo
      ? [
          {
            id: "equipo",
            label: "Equipo",
            hint: extraIds.length ? `${nombreCorto} y ${extraIds.length} más` : `${nombreCorto} (sumar más es opcional)`,
            done: true,
            fieldId: ID_PASO.equipo,
          },
        ]
      : []),
    ...(verTiempo && planValido
      ? [
          {
            id: "datos",
            label: "Datos de la actividad",
            hint: "título, lugar y fecha",
            done: Boolean(pendiente),
            fieldId: ID_PASO.datos,
          },
        ]
      : []),
  ];

  return (
    <div className={a.pagina}>
      <PageHead
        breadcrumbs={[
          { label: "Actividades", href: "/erp/pizarra" },
          { label: person ? shortName(person.nombre) : "Persona", href: `/erp/pizarra/${userId}` },
          { label: "Asignar" },
        ]}
        back={{ href: `/erp/pizarra/${userId}`, label: "Volver al perfil" }}
        eyebrow="Asignar actividad a"
        icon={<Avatar name={person?.nombre ?? "?"} avatarUrl={person?.avatarUrl} size={40} />}
        title={displayName}
        description={person?.puesto || "Elige el tipo y completa los datos"}
      />

      {loadError ? (
        <Alert
          tone="danger"
          role="alert"
          className={a.aviso}
          action={
            <Button size="sm" className={c.tap} onClick={() => void load()}>
              Reintentar
            </Button>
          }
        >
          {loadError}
        </Alert>
      ) : null}

      <div className={a.disposicion}>
        <div className={a.pasos}>
          <FormSection
            id={ID_PASO.tipo}
            step={paso("tipo")}
            done={Boolean(kind)}
            title="Tipo de actividad"
            description={person ? `Solo ves los tipos que ${nombreCorto} puede recibir.` : undefined}
          >
            {!person && !loadError ? (
              <div className={a.esqueletos} aria-busy="true" aria-label="Cargando tipos">
                <Skeleton height={112} radius={16} />
                <Skeleton height={112} radius={16} />
                <Skeleton height={112} radius={16} />
              </div>
            ) : null}
            <RejillaOpciones ariaLabel="Tipo de actividad">
              {allowedKinds.map((id) => {
                const opt = ACTIVITY_KINDS[id];
                return (
                  <OpcionTarjeta
                    key={id}
                    selected={kind === id}
                    onClick={() => setKind(id)}
                    icon={<ActivityKindIcon kind={opt.icon} variant="badge" size={36} />}
                    title={opt.title}
                    help={opt.help}
                  />
                );
              })}
            </RejillaOpciones>
          </FormSection>

          {kind && despachoOnly && !bridgeNeeded ? (
            <FormSection
              id={ID_PASO.encargo}
              step={paso("encargo")}
              done
              title={`Encargo a ${nombreCorto}`}
              description={
                isServicioBridgeEmail(person?.email)
                  ? `Se la dejas a ${nombreCorto}. Él elige al ingeniero de su equipo. Tú no eliges quién la ejecuta.`
                  : "La reparte a su gente. En servicios le dejas la actividad y cuántas personas ocupas; él se la manda a Antonio y Antonio elige al soporte."
              }
              actions={
                <Badge tone="brand" dot>
                  Despacho a equipo
                </Badge>
              }
            >
              <div className={a.campos}>
                <Field label="Personas que se ocupan" required className={a.campoCorto}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={50}
                    value={headcount}
                    onChange={(e) => setHeadcount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                  />
                </Field>
                <Field label={`Indicaciones para ${nombreCorto}`} optional fullWidth>
                  <Textarea
                    value={leadNotes}
                    onChange={(e) => setLeadNotes(e.target.value)}
                    rows={2}
                    placeholder="Qué debe coordinar, contexto…"
                  />
                </Field>
              </div>
            </FormSection>
          ) : null}

          {kind && ejecucionOnly && !bridgeNeeded ? (
            <FormSection
              id={ID_PASO.encargo}
              step={paso("encargo")}
              done
              title={`Encargo a ${nombreCorto}`}
              description={`${CHARGE_LABEL.ejecucion}, sin repartirla a nadie más.`}
              actions={
                <Badge tone="brand" dot>
                  Ejecución directa
                </Badge>
              }
            >
              <Field label="Indicaciones" optional fullWidth>
                <Textarea
                  value={leadNotes}
                  onChange={(e) => setLeadNotes(e.target.value)}
                  rows={2}
                  placeholder="Qué debe hacer…"
                />
              </Field>
            </FormSection>
          ) : null}

          {kind && offerCharge && !bridgeNeeded ? (
            <FormSection
              id={ID_PASO.encargo}
              step={paso("encargo")}
              done={charge != null}
              title={`Encargo a ${nombreCorto}`}
              description="¿La hace en persona o la reparte a su gente?"
            >
              <RejillaOpciones min={220} ariaLabel={`Encargo a ${nombreCorto}`}>
                {(Object.keys(ASSIGNMENT_CHARGES) as AssignmentCharge[]).map((id) => {
                  const opt = ASSIGNMENT_CHARGES[id];
                  return (
                    <OpcionTarjeta
                      key={id}
                      selected={charge === id}
                      onClick={() => setCharge(id)}
                      title={opt.title}
                      help={CHARGE_HELP[id]}
                    />
                  );
                })}
              </RejillaOpciones>
            </FormSection>
          ) : null}

          {bridgeNeeded && (
            <Alert
              tone="warning"
              role="status"
              title="Los servicios van primero a Antonio."
              action={
                antonioOnBoard ? (
                  <Button
                    variant="primary"
                    className={c.tap}
                    iconEnd={<ArrowForwardIcon />}
                    onClick={() => router.push(`/erp/pizarra/${antonioOnBoard.id}/asignar`)}
                  >
                    Ir a asignar a {shortName(antonioOnBoard.nombre)}
                  </Button>
                ) : undefined
              }
            >
              {" "}
              Él agenda el día y la hora con Carolina o Alejandro.
              {antonioOnBoard ? null : (
                <span className={a.nota}>No encontramos a Antonio en el tablero. Avísale a dirección.</span>
              )}
            </Alert>
          )}

          {kindMeta && !bridgeNeeded && chargeReady ? (
            <FormSection
              id={ID_PASO.tiempo}
              step={paso("tiempo")}
              done={planValido}
              title={
                <>
                  ¿Cuánto tiempo toma? <RequiredMark />
                </>
              }
              description="Cuánto debería tomarle. Gira las ruedas de horas y minutos — no hace falta hacer la cuenta mental."
              className={planValido ? undefined : a.seccionAviso}
            >
              <DurationWheelPicker
                horas={planHoras}
                minutos={planMinutos}
                onChange={({ horas, minutos }) => {
                  setPlanHoras(horas);
                  setPlanMinutos(minutos);
                }}
                // Ninguna actividad dura más de 12 horas; si lleva más días, se reanuda cada día.
                maxHoras={12}
                topeMinutos={720}
                minuteStep={5}
                hint={
                  !planValido
                    ? "Pon al menos unos minutos: sin tiempo estimado no se puede avisar si se excede."
                    : "Máximo 12 h. Si lleva más días, se reanuda cada día."
                }
              />
              {!planValido ? (
                <p className={a.faltaTiempo} role="status">
                  Pon al menos unos minutos: sin tiempo estimado no se puede avisar si se excede.
                </p>
              ) : null}
            </FormSection>
          ) : null}

          {kindMeta && !bridgeNeeded && chargeReady && planValido ? (
            <>
              {!despachoOnly && !ejecucionOnly ? (
                <FormSection
                  id={ID_PASO.equipo}
                  step={paso("equipo")}
                  done={extraIds.length > 0}
                  title={effectiveCharge === "despacho" ? "¿Quién la hace?" : "¿Alguien más ayuda?"}
                  description={
                    effectiveCharge === "despacho"
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
                                : `${nombreCorto} queda como responsable. Si quieres, suma a alguien de apoyo.`
                  }
                  actions={
                    effectiveCharge === "despacho" ? undefined : (
                      <Badge tone="outline" size="sm">
                        Opcional
                      </Badge>
                    )
                  }
                >
                  <div className={c.pila}>
                    {autoPeerCoordinators.length > 0 ? (
                      <Alert tone="info" role="status" title="Se suman encargados:">
                        {" "}
                        además de {nombreCorto}, también se avisará a{" "}
                        {autoPeerCoordinators.map((u) => shortName(u.nombre)).join(", ")} para coordinar (hay gente de
                        instalación y de soporte).
                      </Alert>
                    ) : null}
                    {teamForExtras.length === 0 ? (
                      <p className={c.pista}>No hay más personas disponibles para sumar ahora.</p>
                    ) : (
                      <>
                        <div className={a.personas} role="group" aria-label="Personas para sumar">
                          {teamForExtras.map((u) => (
                            <OpcionPersona
                              key={u.id}
                              selected={extraIds.includes(u.id)}
                              onClick={() => toggleExtra(u.id)}
                              nombre={u.nombre}
                              nombreCorto={shortName(u.nombre)}
                              avatarUrl={u.avatarUrl}
                            />
                          ))}
                        </div>
                        {extraIds.length > 0 ? (
                          <div className={a.indicaciones}>
                            <Field label={`Indicaciones para ${nombreCorto} (responsable)`} optional fullWidth>
                              <Textarea
                                value={leadNotes}
                                onChange={(e) => setLeadNotes(e.target.value)}
                                rows={2}
                                placeholder={`Qué debe hacer ${nombreCorto}…`}
                              />
                            </Field>
                            {extraIds.map((id) => {
                              const u = teamForExtras.find((x) => x.id === id);
                              if (!u) return null;
                              return (
                                <Field key={id} label={`Indicaciones para ${shortName(u.nombre)}`} optional fullWidth>
                                  <Textarea
                                    value={extraNotes[id] ?? ""}
                                    onChange={(e) =>
                                      setExtraNotes((prev) => ({ ...prev, [id]: e.target.value }))
                                    }
                                    rows={2}
                                    placeholder="Qué debe hacer esta persona…"
                                  />
                                </Field>
                              );
                            })}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </FormSection>
              ) : null}

              <FormSection
                id={ID_PASO.datos}
                step={paso("datos")}
                title={
                  <span className={a.tituloDatos}>
                    <ActivityKindIcon kind={kindMeta.icon} size={18} />
                    <span>
                      {kindMeta.title}
                      {effectiveCharge ? ` · ${CHARGE_LABEL[effectiveCharge]}` : ""}
                      {despachoOnly ? ` · ${headcount} persona${headcount === 1 ? "" : "s"}` : ""}
                    </span>
                  </span>
                }
                description="Título, lugar, día y hora. Al guardar, se suma al equipo y vuelves a su ficha."
              >
                {pendiente ? (
                  <EquipoPendienteBox
                    activityId={pendiente.activityId}
                    sumando={sumando}
                    error={teamError}
                    onRetry={reintentarEquipo}
                  />
                ) : (
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
                    onSuccess={handleSuccess}
                  />
                )}
              </FormSection>
            </>
          ) : bridgeNeeded ? null : kindMeta && chargeReady && !planValido ? (
            <p className={a.siguiente}>Indica el tiempo estimado para continuar.</p>
          ) : kindMeta && offerCharge && !charge ? (
            <p className={a.siguiente}>Elige si la hace {nombreCorto} o si la reparte a su equipo para continuar.</p>
          ) : person ? (
            <p className={a.siguiente}>Elige un tipo para continuar.</p>
          ) : null}
        </div>

        <aside className={a.lateral} aria-label="Avance de la asignación">
          <PendingList items={pendientes} title="Para asignar" allDoneLabel="Lista para guardar" />
        </aside>
      </div>
    </div>
  );
}
