"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ROLES } from "@/lib/rbac/roles";
import { useUser } from "@/components/UserContext";
import { getActivity, type ActivityDetail } from "@/lib/ops-activities-api";
import { getActivitiesCanonicalPath } from "@/lib/section-views";
import { iniciarMiActividad } from "@/lib/my-activities-api";
import { formatApiError } from "@/lib/erp-api";
import { isCeoEmail } from "@/lib/activity-kinds";
import { resolveV2RoleKey } from "@/lib/user-access";
import { chargeLabel, estatusUi, kindIcon, kindLabel } from "@/lib/activity-labels";
import { countEvidenceFiles } from "@/lib/evidence-display";
import {
  ACCION_INICIAR,
  normalizarPrioridad,
  PRIORIDAD_UI,
  puedeIniciar,
  textoChipSemaforo,
  textoPlanVsReal,
} from "@/lib/actividad-tiempos";
import { formatDate, formatDateTime } from "@/components/detail/DetailFrame";
import CrossPanelLink from "@/components/CrossPanelLink";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  RecordPage,
  Skeleton,
  SkeletonRows,
  type RecordFact,
  type RecordMetaItem,
  type RecordStep,
  type Tone,
} from "@/components/base";
import ActivityKindIcon from "./ActivityKindIcon";
import { IcoCalendario, IcoCamara, IcoCliente, IcoSitio, RouteTabs, type RouteTab } from "./_piezas";
import s from "./ActivityDetailShell.module.css";

type Ctx = {
  id: number;
  activity: ActivityDetail | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Montado en Core (/erp/actividades): enlaces y pestañas no salen de /erp. */
  core: boolean;
  hrefs: { detail: string; evidences: string; back: string };
  /**
   * Hueco de acciones de la cabecera (junto al primario). Las pestañas pintan ahí sus
   * botones con `createPortal`, para que la ficha tenga una sola fila de acciones.
   */
  actionsSlot: HTMLElement | null;
};

const ActivityDetailContext = createContext<Ctx | null>(null);

export function useActivityDetail() {
  const ctx = useContext(ActivityDetailContext);
  if (!ctx) throw new Error("useActivityDetail debe usarse dentro de ActivityDetailShell");
  return ctx;
}

/* ─── Datos que pinta la cabecera y el panel ───────────────────────────── */

function corta(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function masTemprana(fechas: Array<string | null | undefined>): string | null {
  let mejor: string | null = null;
  for (const f of fechas) {
    if (!f) continue;
    const t = new Date(f).getTime();
    if (Number.isNaN(t)) continue;
    if (!mejor || t < new Date(mejor).getTime()) mejor = f;
  }
  return mejor;
}

function workTypeLabel(workType?: string | null): string {
  if (workType === "PREVENTIVE_INVENTORY") return "Inventario preventivo";
  return "Incidencia / servicio";
}

const SEMAFORO_TONO: Record<string, Tone> = { rojo: "danger", amarillo: "warning", verde: "success" };
const PRIORIDAD_TONO: Record<string, Tone> = { ALTA: "danger", MEDIA: "outline", BAJA: "outline" };

/**
 * Pasos de la ficha con lo que ya trae la actividad: Asignada → Inicio → En sitio →
 * En revisión → Completada. El paso actual es el último alcanzado; cancelada no tiene actual.
 */
export function pasosDeActividad(activity: ActivityDetail): RecordStep[] {
  const estatus = activity.estatus ?? "";
  const vivos = (activity.assignees ?? []).filter((m) => !m.retiradoAt);
  const inicioReal = masTemprana(vivos.map((m) => m.inicioRealAt));
  const llegada = masTemprana([
    activity.acsEnteredAt,
    activity.activityEvidence?.entryPhotoUploadedAt,
    ...vivos.map((m) => m.acsEnteredAt),
  ]);
  const enRevision = /validar|validaci|finaliz|complet|aprobad/i.test(estatus);
  const completada = /finaliz|complet|aprobad/i.test(estatus);
  const iniciada = Boolean(inicioReal) || /proceso|curso|rechaz/i.test(estatus) || enRevision;
  const enSitio = Boolean(llegada) || enRevision;
  const cancelada = /cancel/i.test(estatus);

  const alcanzados = [true, iniciada, enSitio, enRevision, completada];
  let fase = 0;
  alcanzados.forEach((ok, i) => {
    if (ok) fase = i;
  });

  const base: Array<{ id: string; label: string; hint: string | null }> = [
    { id: "asignada", label: "Asignada", hint: corta(activity.fechaAsignacion) },
    { id: "inicio", label: "Inicio", hint: corta(inicioReal) ?? (iniciada ? "Iniciada" : "Por iniciar") },
    { id: "sitio", label: "En sitio", hint: llegada ? `Desde ${corta(llegada)}` : enSitio ? "Llegó" : "Sin llegada" },
    {
      id: "revision",
      label: "En revisión",
      hint: enRevision ? corta(activity.activityEvidence?.completedAt) ?? "Enviada" : "Falta enviar",
    },
    { id: "completada", label: "Completada", hint: completada ? corta(activity.fechaFinalizacion) ?? "Aprobada" : null },
  ];

  return base.map((p, i) => {
    let state: RecordStep["state"] = "pending";
    if (i < fase || (i === fase && (completada || cancelada))) state = "done";
    else if (i === fase) state = "current";
    return { id: p.id, label: p.label, hint: p.hint ?? undefined, state };
  });
}

function llegadaAlSitio(activity: ActivityDetail): string | null {
  if (!activity.acsEnteredAt) return null;
  let texto: string;
  try {
    const hhmm = new Intl.DateTimeFormat("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Mexico_City",
    }).format(new Date(activity.acsEnteredAt));
    const who = activity.acsEnteredByUser?.nombre ? ` · ${activity.acsEnteredByUser.nombre}` : "";
    const door = activity.acsEntryDoor ? ` (${activity.acsEntryDoor})` : "";
    texto = `Entró por el control de acceso a las ${hhmm}${who}${door}`;
  } catch {
    texto = "Entró por el control de acceso";
  }
  if (activity.acsLeftSite && activity.acsExitedAt) texto += ` · Salió ${formatDateTime(activity.acsExitedAt)}`;
  return texto;
}

type QuienMiraUser = ReturnType<typeof useUser>["user"];

/**
 * Lo que la persona que mira puede hacer con la actividad (mismas reglas de siempre,
 * en un solo lugar para la cabecera, el detalle y las evidencias):
 * - `miFila`: su renglón vigente del equipo (inicio real, semáforo, plan vs real).
 * - `mostrarIniciar`: la recibió y aún no la inicia (`puedeIniciar`).
 * - `reparte`: en despacho, el LEAD (o el responsable sin renglón) solo la pasa.
 * - `puedeCapturar`: Core — solo quien la ejecuta captura (equipo o responsable);
 *   Christian y los superiores revisan. Fuera de Core, ingeniería de campo o soporte.
 */
export function quienMira(activity: ActivityDetail, user: QuienMiraUser, core: boolean) {
  const v2 = resolveV2RoleKey(user);
  const miFila = (activity.assignees ?? []).find((m) => (m.userId ?? m.user?.id) === user?.id && !m.retiradoAt);
  // Las evidencias identifican el renglón por `user.id` (así lo decidía su pestaña).
  const myRow = (activity.assignees ?? []).find((m) => m.user?.id === user?.id && !m.retiradoAt);
  const despacho = activity.assignmentCharge === "despacho";
  const soyResponsable = Boolean(user?.id && activity.responsable?.id === user.id);
  const reparte = despacho && (myRow?.rol === "LEAD" || (soyResponsable && !myRow));
  const puedeCapturar = core
    ? !isCeoEmail(user?.email) && !reparte && (Boolean(myRow) || soyResponsable)
    : v2 === ROLES.ING_CAMPO || v2 === ROLES.ING_SOPORTE || Boolean(user?.isSuperAdmin);
  const mostrarIniciar = Boolean(
    user?.token &&
      miFila &&
      puedeIniciar({
        aceptacion: miFila.aceptacion,
        inicioRealAt: miFila.inicioRealAt,
        despachador: despacho && miFila.rol === "LEAD",
        estatus: activity.estatus,
      }),
  );
  return { miFila, despacho, soyResponsable, reparte, puedeCapturar, mostrarIniciar };
}

/* ─── Shell ─────────────────────────────────────────────────────────────── */

export default function ActivityDetailShell({
  id,
  children,
  core = false,
}: {
  id: string;
  children: ReactNode;
  core?: boolean;
}) {
  const numericId = Number(id);
  const { user } = useUser();
  const token = user?.token ?? "";
  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const [errorInicio, setErrorInicio] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !numericId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getActivity(token, numericId);
      setActivity(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la actividad");
      // Un refresh que falla (la mutación sí llegó, el refetch no) no debe borrar lo que ya
      // se veía bien de esta misma actividad. Si es otra actividad la que nunca cargó, ahí sí
      // se limpia — seguir mostrando la anterior bajo esta URL sería peor que no mostrar nada.
      setActivity((prev) => (prev?.id === numericId ? prev : null));
    } finally {
      setLoading(false);
    }
  }, [token, numericId]);

  useEffect(() => {
    void load();
  }, [load]);

  const base = core ? `/erp/actividades/${id}` : `/ops/activities/${id}`;
  const evidencesHref = core ? `${base}/evidencias` : `${base}/evidences`;
  // Sin archivos no se pinta el contador (un «0» en la pestaña no dice nada).
  const evidenceCount = activity ? countEvidenceFiles(activity.activityEvidence) || null : null;

  const tabs: RouteTab[] = useMemo(
    () =>
      core
        ? [
            { id: "detalle", label: "Detalle", href: base },
            { id: "evidences", label: "Evidencias", href: evidencesHref, count: evidenceCount },
            { id: "historial", label: "Historial", href: `${base}/historial` },
          ]
        : [
            { id: "detalle", label: "Detalle", href: base },
            { id: "operacion", label: "Operación", href: `${base}/operacion` },
            { id: "evidences", label: "Evidencias", href: evidencesHref, count: evidenceCount },
            { id: "team", label: "Equipo", href: `${base}/team` },
            { id: "materials", label: "Materiales", href: `${base}/materials` },
            {
              id: "viatics",
              label: "Viáticos",
              href: `${base}/viatics`,
              roles: [ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN, ROLES.ADMINISTRATIVO, ROLES.ING_CAMPO],
            },
            {
              id: "approvals",
              label: "Aprobaciones",
              href: `${base}/approvals`,
              roles: [ROLES.CEO, ROLES.DIR_OPERACIONES, ROLES.DIR_ADMIN, ROLES.COORD_ADMIN, ROLES.COORD_OPERACIONES, ROLES.ARQUITECTO],
            },
            { id: "historial", label: "Historial", href: `${base}/historial` },
          ],
    [base, core, evidencesHref, evidenceCount],
  );

  const backHref = useMemo(() => (core ? "/erp/pizarra" : getActivitiesCanonicalPath(user)), [core, user]);

  const ctx = useMemo(
    () => ({
      id: numericId,
      activity,
      loading,
      error,
      reload: load,
      core,
      hrefs: { detail: base, evidences: evidencesHref, back: backHref },
      actionsSlot,
    }),
    [numericId, activity, loading, error, load, core, base, evidencesHref, backHref, actionsSlot],
  );

  // El enlace decía «Actividades» también en Core, donde vuelve a la pizarra:
  // una etiqueta que no nombra su destino hace dudar antes de pulsarla.
  const backLabel = core ? "Pizarra" : "Actividades";

  if (!activity) {
    return (
      <ActivityDetailContext.Provider value={ctx}>
        <div className={s.wrap}>
          <nav aria-label="Ruta de la página" className={s.back}>
            <Link href={backHref}>‹ {backLabel}</Link>
          </nav>
          {loading || (!error && !token) ? (
            <div className={s.loading} aria-busy="true">
              <Skeleton width="38%" height={14} />
              <Skeleton width="64%" height={24} />
              <SkeletonRows rows={5} label="Cargando actividad" />
            </div>
          ) : (
            <EmptyState
              tone="danger"
              title="No se pudo abrir la actividad"
              description={error ?? `La actividad #${id} no existe o no tienes acceso.`}
              action={
                <Button variant="primary" onClick={() => void load()}>
                  Reintentar
                </Button>
              }
              secondaryAction={
                <ButtonLink href={backHref} variant="tertiary">
                  Volver a {backLabel}
                </ButtonLink>
              }
            />
          )}
        </div>
      </ActivityDetailContext.Provider>
    );
  }

  /* Quién mira: quien ejecuta (captura), quien reparte o quien revisa. */
  const estatus = activity.estatus ?? "";
  const { miFila, despacho, mostrarIniciar, puedeCapturar: ejecuta } = quienMira(activity, user, core);
  const cerrada = /validar|validaci|finaliz|complet|aprobad|cancel/i.test(estatus);
  const porRevisar = /validar|validaci/i.test(estatus);

  const iniciar = async () => {
    if (!token) return;
    setIniciando(true);
    setErrorInicio(null);
    try {
      await iniciarMiActividad(token, activity.id);
      void load();
    } catch (e) {
      setErrorInicio(formatApiError(e, "No se pudo iniciar la actividad"));
    } finally {
      setIniciando(false);
    }
  };

  const primario = mostrarIniciar ? (
    <Button variant="primary" loading={iniciando} onClick={() => void iniciar()} iconStart={<IcoPlay />}>
      {iniciando ? "Iniciando…" : ACCION_INICIAR}
    </Button>
  ) : ejecuta && !cerrada ? (
    <ButtonLink variant="primary" href={`${evidencesHref}#captura`} iconStart={<IcoCamara />}>
      Continuar evidencias
    </ButtonLink>
  ) : porRevisar && !ejecuta ? (
    <ButtonLink variant="primary" href={`${evidencesHref}#revision`} iconStart={<IcoCamara />}>
      Revisar evidencias
    </ButtonLink>
  ) : null;

  /* Cabecera */
  const prioridad = activity.prioridad ? normalizarPrioridad(activity.prioridad) : null;
  const semaforo = miFila?.semaforo ?? activity.semaforo ?? null;
  const chipSemaforo =
    semaforo && !cerrada
      ? textoChipSemaforo(
          semaforo,
          miFila?.minutosAtraso ?? activity.minutosAtraso,
          miFila?.minutosParaVencer ?? activity.minutosParaVencer,
          miFila?.motivoSemaforo ?? activity.motivoSemaforo,
        )
      : null;
  const branch = [activity.branchName, activity.branchCity, activity.branchState].filter(Boolean).join(" · ");
  const sitio = branch || activity.branchAddress || null;
  const horario = activity.periodo?.etiqueta
    ? activity.periodo.etiqueta
    : activity.fechaInicio
      ? `${formatDateTime(activity.fechaInicio)}${activity.fechaEntregaEsperada ? ` · entrega ${formatDate(activity.fechaEntregaEsperada)}` : ""}`
      : activity.fechaEntregaEsperada
        ? `Entrega ${formatDate(activity.fechaEntregaEsperada)}`
        : null;

  const meta: RecordMetaItem[] = [];
  if (activity.client?.name) meta.push({ icon: <IcoCliente />, label: activity.client.name });
  if (sitio) meta.push({ icon: <IcoSitio />, label: sitio });
  if (horario) meta.push({ icon: <IcoCalendario />, label: horario });

  const responsable = activity.responsable as ({ id: number; nombre: string; avatarUrl?: string | null } | null | undefined);

  /* Datos clave: solo lo que la API devuelve. */
  const nombres = (rows: NonNullable<typeof activity.assignees>) =>
    rows.filter((m) => !m.retiradoAt).map((m) => m.user?.nombre).filter((n): n is string => Boolean(n));
  const coordinan = nombres((activity.assignees ?? []).filter((m) => m.rol === "LEAD"));
  const ejecutores = nombres((activity.assignees ?? []).filter((m) => m.rol !== "LEAD"));
  const planVsReal = textoPlanVsReal(miFila?.minutosPlan ?? activity.minutosPlan, miFila?.minutosReales ?? activity.minutosReales);
  const excedida = Boolean(miFila?.excedida ?? activity.excedida);
  const llegada = llegadaAlSitio(activity);

  const facts: RecordFact[] = [];
  const push = (label: string, value: ReactNode, hint?: ReactNode) => {
    if (value == null || value === "" || value === "—") return;
    facts.push({ label, value, hint });
  };
  push(
    "Cliente",
    activity.client?.id && !core ? (
      <CrossPanelLink
        className={s.factLink}
        href={
          activity.client.salesClients?.[0]?.id
            ? `/crm/clients/${activity.client.salesClients[0].id}`
            : `/ops/service-clients/${activity.client.id}`
        }
      >
        {activity.client.name} →
      </CrossPanelLink>
    ) : (
      activity.client?.name
    ),
  );
  push("Sucursal", sitio);
  if (despacho) {
    push("La reparte", coordinan.join(" → ") || activity.responsable?.nombre);
    push("La hace", ejecutores.length ? ejecutores.join(", ") : "Por asignar");
  } else {
    push("Responsable", activity.responsable?.nombre);
    if (ejecutores.length > 1) push("Equipo", ejecutores.join(", "));
  }
  push("Encargo", chargeLabel(activity.assignmentCharge));
  push(
    "Proyecto",
    activity.project?.id && core ? (
      activity.project.title
    ) : activity.project?.id ? (
      <Link href={`/ops/projects/${activity.project.id}`} className={s.factLink}>
        {activity.project.title} →
      </Link>
    ) : (
      "Sin proyecto operativo"
    ),
  );
  push("Tipo", activity.ticketTypeCustom || activity.ticketType);
  push("Tipo de trabajo", workTypeLabel(activity.workType));
  push("Creador", activity.creador?.nombre);
  push("Asignación", activity.fechaAsignacion ? formatDateTime(activity.fechaAsignacion) : null);
  push("Inicio", activity.fechaInicio ? formatDateTime(activity.fechaInicio) : null);
  if (activity.periodo) {
    push(
      activity.projectMilestone ? `Periodo · ${activity.projectMilestone.name}` : "Periodo",
      activity.periodo.estado === "vencida" ? (
        <Badge tone="danger" size="sm" dot>
          {activity.periodo.etiqueta}
        </Badge>
      ) : (
        activity.periodo.etiqueta
      ),
    );
  }
  push("Llegada al sitio", llegada ? <span className={s.factOk}>{llegada}</span> : null);
  push("Entrega esperada", activity.fechaEntregaEsperada ? formatDate(activity.fechaEntregaEsperada) : null);
  push("Finalización", activity.fechaFinalizacion ? formatDateTime(activity.fechaFinalizacion) : null);
  push(
    "Tiempo",
    planVsReal ? <span className={excedida ? s.factBad : undefined}>{planVsReal}</span> : null,
    planVsReal ? (excedida ? "Excedió el tiempo estimado" : chipSemaforo ?? "Estimado vs real") : undefined,
  );

  const kind = String(activity.coreKind ?? "").toLowerCase() === "obra" ? "obra" : undefined;

  return (
    <ActivityDetailContext.Provider value={ctx}>
      <div className={s.wrap}>
        <RecordPage
          breadcrumbs={[{ label: backLabel, href: backHref }, { label: activity.anNumber || `#${activity.id}` }]}
          icon={<ActivityKindIcon kind={kindIcon(activity)} size={24} />}
          kind={kind}
          code={activity.anNumber}
          status={estatus}
          statusLabel={estatusUi(estatus).label}
          badges={
            <>
              {chipSemaforo && semaforo ? (
                <Badge tone={SEMAFORO_TONO[semaforo] ?? "neutral"} dot>
                  {chipSemaforo}
                </Badge>
              ) : null}
              {prioridad ? (
                <Badge tone={PRIORIDAD_TONO[prioridad] ?? "outline"} title={PRIORIDAD_UI[prioridad].hint}>
                  Prioridad {PRIORIDAD_UI[prioridad].label.toLowerCase()}
                </Badge>
              ) : null}
              <Badge tone="neutral">{kindLabel(activity)}</Badge>
            </>
          }
          title={activity.titulo}
          person={
            responsable?.nombre
              ? {
                  name: responsable.nombre,
                  avatarUrl: responsable.avatarUrl ?? null,
                  role: despacho ? "la reparte" : "responsable",
                }
              : undefined
          }
          meta={meta}
          secondaryActions={<span ref={setActionsSlot} className={s.slot} />}
          primaryAction={primario}
          steps={pasosDeActividad(activity)}
          tabs={<RouteTabs items={tabs} ariaLabel="Secciones de la actividad" />}
          facts={facts}
          factsTitle="Datos clave"
        >
          {errorInicio ? (
            <Alert tone="danger" role="alert" onDismiss={() => setErrorInicio(null)}>
              {errorInicio}
            </Alert>
          ) : null}
          {loading ? <span className="ui-sr-only" role="status">Actualizando…</span> : null}
          {children}
        </RecordPage>
      </div>
    </ActivityDetailContext.Provider>
  );
}

function IcoPlay() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.6 5.6v4.8L10.4 8z" fill="currentColor" />
    </svg>
  );
}
