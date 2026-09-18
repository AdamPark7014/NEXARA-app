"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { SvgIconComponent } from "@mui/icons-material";
import CelebrationIcon from "@mui/icons-material/Celebration";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import PanToolOutlinedIcon from "@mui/icons-material/PanToolOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import EditNoteOutlinedIcon from "@mui/icons-material/EditNoteOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CheckIcon from "@mui/icons-material/Check";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import { useUser } from "@/components/UserContext";
import { ACTIVITY_KINDS, isCeoEmail, type ActivityIconKey, type ActivityKind } from "@/lib/activity-kinds";
import { formatApiError } from "@/lib/erp-api";
import ReprogramarDespacho from "@/components/pizarra/ReprogramarDespacho";
import IniciarActividad from "@/components/pizarra/IniciarActividad";
import { normalizarPrioridad, puedeIniciar, SEMAFORO_UI, textoPlanVsReal } from "@/lib/actividad-tiempos";
import ActivityKindIcon from "@/components/ops/ActivityKindIcon";
import { IconBadge, IconLabel } from "@/components/ui/IconBadge";
import {
  fetchMyActivities,
  reorderMyActivities,
  type MyActivitiesResponse,
  type MyActivityItem,
} from "@/lib/my-activities-api";

const PRIORITY_UI: Record<string, { color: string; label: string }> = {
  ALTA: { color: "#dc2626", label: "Urgente" },
  MEDIA: { color: "#d97706", label: "Esta semana" },
  BAJA: { color: "#16a34a", label: "Puede esperar" },
};

const MIN_REASON = 10;

/** Estatus del backend → etiqueta clara para campo. */
const ESTATUS_UI: Array<[RegExp, { label: string; color?: string }]> = [
  [/proceso/i, { label: "En curso", color: "#2563eb" }],
  [/validar/i, { label: "En revisión", color: "#7c3aed" }],
  [/rechazada/i, { label: "Te la regresaron", color: "#dc2626" }],
  [/finalizada|completada|aprobada/i, { label: "Terminada", color: "#16a34a" }],
  [/cancelada/i, { label: "Cancelada" }],
];

function estatusUi(estatus: string): { label: string; color?: string } {
  for (const [re, ui] of ESTATUS_UI) if (re.test(estatus)) return ui;
  return { label: "Por empezar" };
}

/** Avance de quien ejecuta, según su evidencia. */
function avanceUi(status?: string | null): { label: string; color?: string } {
  switch (status) {
    case "COMPLETED":
      return { label: "Evidencia lista", color: "#16a34a" };
    case "EXIT_PHOTO":
      return { label: "Por cerrar", color: "#2563eb" };
    case "SERVICE_SHEET_PDF":
    case "SERVICE_SHEET_DATA":
      return { label: "Llenando hoja", color: "#2563eb" };
    case "EVIDENCE_PHOTOS":
      return { label: "Trabajando en sitio", color: "#2563eb" };
    default:
      return { label: "Sin empezar" };
  }
}

function priorityUi(p?: string | null) {
  return PRIORITY_UI[normalizarPrioridad(p)] ?? PRIORITY_UI.MEDIA;
}

function kindLabel(item: MyActivityItem): string {
  const meta = item.coreKind ? ACTIVITY_KINDS[item.coreKind as ActivityKind] : null;
  const base = meta ? meta.title : "Actividad";
  return item.coreKind === "tarea" && item.ticketTypeCustom ? `${base} · ${item.ticketTypeCustom}` : base;
}

/** Clave de icono del tipo (sin tipo → icono genérico en ActivityKindIcon). */
function kindIcon(item: MyActivityItem): ActivityIconKey | null {
  const meta = item.coreKind ? ACTIVITY_KINDS[item.coreKind as ActivityKind] : null;
  return meta ? meta.icon : null;
}

/** Icono en línea con texto corrido (se alinea con la línea base). */
const INLINE_ICON_SX = { fontSize: 16, verticalAlign: "-0.22em", mr: "5px" } as const;

function formatWhen(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMinutes(min?: number | null): string | null {
  if (min == null || !Number.isFinite(min) || min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function shortName(name?: string | null): string {
  return (name || "").split(/\s+/).slice(0, 2).join(" ");
}

const btnPrimary: CSSProperties = {
  border: "none",
  background: "var(--primary)",
  color: "#fff",
  fontWeight: 750,
  fontSize: 13.5,
  padding: "10px 16px",
  borderRadius: 12,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};

const btnSecondary: CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "inherit",
  fontWeight: 650,
  fontSize: 13,
  padding: "8px 14px",
  minHeight: 40,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 10,
  cursor: "pointer",
  fontFamily: "inherit",
  textDecoration: "none",
  whiteSpace: "nowrap",
};

function Chip({ children, color, icon: Icon }: { children: ReactNode; color?: string; icon?: SvgIconComponent }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 650,
        border: `1px solid ${color ? `color-mix(in srgb, ${color} 35%, var(--border))` : "var(--border)"}`,
        background: color ? `color-mix(in srgb, ${color} 10%, var(--surface))` : "var(--surface)",
        color: color ?? "var(--text-secondary)",
      }}
    >
      {Icon ? <Icon aria-hidden="true" sx={{ fontSize: 15, flex: "0 0 auto" }} /> : null}
      {children}
    </span>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 800, color: color ?? "inherit", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

type PendingMove = { item: MyActivityItem; from: number; to: number };

export default function MisActividadesPage() {
  const router = useRouter();
  const { user, token } = useUser();
  const [data, setData] = useState<MyActivitiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [showDone, setShowDone] = useState(false);

  const isCeo = isCeoEmail(user?.email);
  const myId = user?.id;
  const firstName = ((user as { nombre?: string | null } | null)?.nombre || "").split(/\s+/)[0];

  const load = useCallback(async () => {
    if (!token || isCeo) return;
    try {
      setData(await fetchMyActivities(token));
      setError(null);
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar tus actividades"));
    } finally {
      setLoading(false);
    }
  }, [token, isCeo]);

  useEffect(() => {
    void load();
  }, [load]);

  // Al volver de «Auto-asignarme», resalta la actividad recién creada.
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("nueva"));
    if (Number.isFinite(id) && id > 0) setHighlightId(id);
  }, []);

  const open = data?.open ?? [];
  const done = data?.doneToday ?? [];
  const seguimiento = data?.seguimiento ?? [];
  const urgentes = open.filter((a) => priorityUi(a.prioridad).label === "Urgente").length;
  const canReorder = Boolean(data?.canReorder) && open.length > 1;

  const askMove = (from: number, to: number) => {
    const item = open[from];
    if (!item || to < 0 || to >= open.length || to === from) return;
    setPending({ item, from, to });
    setReason("");
    setMoveError(null);
  };

  const confirmMove = async () => {
    if (!pending || !token) return;
    const text = reason.trim();
    if (text.length < MIN_REASON) {
      setMoveError(`Escribe al menos ${MIN_REASON} caracteres: por qué la harás en ese lugar.`);
      return;
    }
    const ids = open.map((a) => a.id);
    const [moved] = ids.splice(pending.from, 1);
    ids.splice(pending.to, 0, moved);
    setSaving(true);
    try {
      const next = await reorderMyActivities(token, {
        activityIds: ids,
        movedActivityId: moved,
        justificacion: text,
      });
      setData(next);
      setHighlightId(moved);
      setPending(null);
    } catch (e) {
      setMoveError(formatApiError(e, "No se pudo guardar el orden"));
    } finally {
      setSaving(false);
    }
  };

  if (isCeo) {
    return (
      <div style={{ maxWidth: 620, margin: "40px auto", textAlign: "center", display: "grid", gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Mis actividades</h1>
        <p style={{ margin: 0, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          Este módulo es para el equipo: cada quien ve y ordena su propia cola. Para ver a todos entra a{" "}
          <Link href="/erp/pizarra" style={{ color: "var(--primary)", fontWeight: 700 }}>
            Actividades
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          padding: 18,
          borderRadius: 20,
          border: "1px solid var(--border)",
          background: "color-mix(in srgb, var(--primary) 6%, var(--surface))",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 750,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--text-tertiary)",
            }}
          >
            Mis actividades
          </div>
          <h1 style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>
            {firstName ? `Hola, ${firstName}` : "Tu día"}
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--text-secondary)" }}>
            {loading
              ? "Cargando tus actividades…"
              : open.length === 0
                ? "No tienes pendientes por ahora."
                : `Tienes ${open.length} por hacer. Empieza por la #1.`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={btnSecondary} onClick={() => void load()}>
            ↻ Actualizar
          </button>
          {data?.canSelfAssign ? (
            <button type="button" style={btnPrimary} onClick={() => router.push("/erp/mis-actividades/nueva")}>
              ＋ Auto-asignarme
            </button>
          ) : null}
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
        <Stat label="Por hacer" value={open.length} />
        <Stat label="Urgentes" value={urgentes} color={urgentes ? "#dc2626" : undefined} />
        <Stat label="Hechas hoy" value={done.length} color={done.length ? "#16a34a" : undefined} />
        {seguimiento.length ? <Stat label="En seguimiento" value={seguimiento.length} /> : null}
      </div>

      {error ? <p style={{ margin: 0, color: "#dc2626", fontSize: 13 }}>{error}</p> : null}

      {canReorder ? (
        <div
          role="note"
          style={{
            padding: "10px 14px",
            borderRadius: 14,
            border: "1px solid color-mix(in srgb, var(--primary) 30%, var(--border))",
            background: "color-mix(in srgb, var(--primary) 7%, var(--surface))",
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          <strong>Tú decides el orden.</strong> Usa «Subir» y «Bajar». Cada cambio te pide un motivo corto de por
          qué la harás en ese lugar.
        </div>
      ) : !loading && open.length > 1 && !data?.canReorder ? (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-tertiary)" }}>
          El orden sale de la prioridad y la fecha. Si algo no cuadra, avísale a tu encargado.
        </p>
      ) : null}

      {!loading && open.length === 0 && !error ? (
        <div
          style={{
            padding: "32px 20px",
            textAlign: "center",
            borderRadius: 20,
            border: "1px dashed var(--border)",
            background: "var(--surface)",
            display: "grid",
            gap: 8,
            justifyItems: "center",
          }}
        >
          <IconBadge icon={CelebrationIcon} size={56} />
          <div style={{ fontWeight: 800, fontSize: 16 }}>Todo al día</div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
            Cuando te asignen algo aparecerá aquí.
          </p>
          {data?.canSelfAssign ? (
            <button type="button" style={btnPrimary} onClick={() => router.push("/erp/mis-actividades/nueva")}>
              ＋ Auto-asignarme una actividad
            </button>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 12 }}>
        {open.map((a, i) => {
          const pr = priorityUi(a.prioridad);
          const when = formatWhen(a.fechaInicio ?? a.fechaMaxima);
          const est = formatMinutes(a.tiempoEstimadoMin);
          const max = formatMinutes(a.tiempoMaximoMin);
          // «Plan 2 h · real 2 h 35 min» (el tiempo estimado por persona manda sobre el viejo).
          const plan = textoPlanVsReal(a.minutosPlan, a.minutosReales);
          const lugar = a.cliente || a.proyecto;
          const first = i === 0;
          const highlighted = highlightId === a.id;
          return (
            <article
              key={a.id}
              style={{
                display: "grid",
                gridTemplateColumns: "auto minmax(0, 1fr)",
                gap: 14,
                padding: 16,
                borderRadius: 18,
                border: highlighted
                  ? "2px solid var(--primary)"
                  : first
                    ? "1.5px solid color-mix(in srgb, var(--primary) 40%, var(--border))"
                    : "1px solid var(--border)",
                background: first ? "color-mix(in srgb, var(--primary) 5%, var(--surface))" : "var(--surface)",
                boxShadow: `inset 5px 0 0 ${pr.color}`,
              }}
            >
              <div
                aria-label={`Lugar ${i + 1}`}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 800,
                  fontSize: 16,
                  background: first ? "var(--primary)" : "color-mix(in srgb, var(--primary) 12%, var(--surface))",
                  color: first ? "#fff" : "var(--primary)",
                }}
              >
                {i + 1}
              </div>
              <div style={{ minWidth: 0, display: "grid", gap: 8 }}>
                {first ? (
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--primary)",
                    }}
                  >
                    Empieza por aquí
                  </div>
                ) : null}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.3 }}>{a.titulo}</div>
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                      Folio {a.anNumber}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {a.porRepartir && myId ? (
                      <Link href={`/erp/pizarra/${myId}`} style={{ ...btnPrimary, textDecoration: "none" }}>
                        Repartir →
                      </Link>
                    ) : null}
                    <Link href={`/erp/actividades/${a.id}`} style={btnSecondary}>
                      Abrir →
                    </Link>
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {a.porRepartir ? (
                    <Chip color="#d97706" icon={SendOutlinedIcon}>
                      Te toca repartirla
                    </Chip>
                  ) : null}
                  <Chip color={estatusUi(a.estatus).color}>{estatusUi(a.estatus).label}</Chip>
                  <Chip color={pr.color}>
                    <FiberManualRecordIcon aria-hidden="true" sx={{ fontSize: 9 }} />
                    {pr.label}
                  </Chip>
                  {a.semaforo ? (
                    <Chip color={SEMAFORO_UI[a.semaforo].color}>
                      <FiberManualRecordIcon aria-hidden="true" sx={{ fontSize: 9 }} />
                      {SEMAFORO_UI[a.semaforo].label}
                    </Chip>
                  ) : null}
                  {puedeIniciar(a) ? <Chip color="#d97706">Sin iniciar</Chip> : null}
                  <Chip>
                    <ActivityKindIcon kind={kindIcon(a)} size={15} />
                    {kindLabel(a)}
                  </Chip>
                  <Chip icon={a.autoAsignada ? PanToolOutlinedIcon : undefined}>
                    {a.autoAsignada
                      ? "Auto-asignada"
                      : a.asignadaPor
                        ? `De ${shortName(a.asignadaPor.nombre)}`
                        : "Asignada"}
                  </Chip>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "4px 14px",
                    fontSize: 13,
                    color: "var(--text-secondary)",
                  }}
                >
                  <IconLabel icon={EventOutlinedIcon} gap={5}>
                    {when ?? "Sin fecha"}
                  </IconLabel>
                  {plan ? (
                    <IconLabel icon={TimerOutlinedIcon} gap={5}>
                      <span style={a.excedida ? { color: "#dc2626", fontWeight: 700 } : undefined}>
                        {plan}
                        {a.excedida ? " · excedida" : ""}
                      </span>
                    </IconLabel>
                  ) : est ? (
                    <IconLabel icon={TimerOutlinedIcon} gap={5}>
                      {est}
                      {max ? ` · tope ${max}` : ""}
                    </IconLabel>
                  ) : null}
                  {lugar ? (
                    <IconLabel icon={PlaceOutlinedIcon} gap={5}>
                      {lugar}
                    </IconLabel>
                  ) : null}
                </div>
                {a.indicaciones ? (
                  <p
                    style={{
                      margin: 0,
                      padding: "8px 10px",
                      borderRadius: 10,
                      background: "color-mix(in srgb, var(--text-secondary) 7%, var(--surface))",
                      fontSize: 13,
                      lineHeight: 1.4,
                    }}
                  >
                    {a.indicaciones}
                  </p>
                ) : null}
                {a.ordenJustificacion ? (
                  <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    <EditNoteOutlinedIcon aria-hidden="true" sx={INLINE_ICON_SX} />
                    <strong>Por qué va aquí:</strong> {a.ordenJustificacion}
                  </p>
                ) : null}
                {/* Quien la recibe no la acepta ni la rechaza: únicamente la inicia. */}
                {token && puedeIniciar(a) ? (
                  <IniciarActividad token={token} activityId={a.id} onDone={() => void load()} />
                ) : null}
                {canReorder ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <button
                      type="button"
                      style={{ ...btnSecondary, opacity: i === 0 ? 0.45 : 1 }}
                      disabled={i === 0}
                      onClick={() => askMove(i, i - 1)}
                    >
                      ↑ Subir
                    </button>
                    <button
                      type="button"
                      style={{ ...btnSecondary, opacity: i === open.length - 1 ? 0.45 : 1 }}
                      disabled={i === open.length - 1}
                      onClick={() => askMove(i, i + 1)}
                    >
                      ↓ Bajar
                    </button>
                    {i > 1 ? (
                      <button type="button" style={btnSecondary} onClick={() => askMove(i, 0)}>
                        ⤒ Hacerla primero
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {seguimiento.length ? (
        <section style={{ display: "grid", gap: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
              <IconLabel icon={VisibilityOutlinedIcon} size={18}>
                En seguimiento ({seguimiento.length})
              </IconLabel>
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.4 }}>
              Ya las repartiste: aquí ves a quién se las pasaste y cómo va quien las ejecuta.
            </p>
          </div>
          {seguimiento.map((s) => {
            const est = estatusUi(s.estatus);
            const ejecutor = [...s.pasadaA].reverse().find((p) => p.rol !== "LEAD") ?? null;
            const avance = ejecutor ? avanceUi(ejecutor.evidenceStatus) : null;
            const primera = s.pasadaA[0];
            return (
              <article
                key={s.id}
                style={{
                  padding: 14,
                  borderRadius: 16,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.3 }}>{s.titulo}</div>
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>Folio {s.anNumber}</div>
                  </div>
                  <Link href={`/erp/actividades/${s.id}/historial`} style={btnSecondary}>
                    Ver registro →
                  </Link>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <Chip color={est.color}>{est.label}</Chip>
                  <Chip>
                    <ActivityKindIcon kind={kindIcon(s)} size={15} />
                    {kindLabel(s)}
                  </Chip>
                  {avance ? (
                    <Chip color={avance.color}>
                      {shortName(ejecutor?.nombre)}: {avance.label}
                    </Chip>
                  ) : (
                    <Chip color="#d97706">Falta que la asignen</Chip>
                  )}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  <SendOutlinedIcon aria-hidden="true" sx={INLINE_ICON_SX} />
                  Enviada a {s.pasadaA.map((p) => shortName(p.nombre)).join(" → ")}
                  {primera ? ` · ${formatWhen(primera.at) ?? ""}` : ""}
                </div>
                {s.ultimaReprogramacion ? (
                  <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                    <EventRepeatIcon aria-hidden="true" sx={INLINE_ICON_SX} />
                    Reprogramada por {shortName(s.ultimaReprogramacion.por) || "alguien"} ·{" "}
                    {formatWhen(s.ultimaReprogramacion.at) ?? ""}
                  </div>
                ) : null}
                {token ? (
                  <ReprogramarDespacho
                    token={token}
                    activityId={s.id}
                    fechaActual={s.fechaInicio}
                    onDone={() => void load()}
                  />
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}

      {done.length ? (
        <section style={{ display: "grid", gap: 8 }}>
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            style={{ ...btnSecondary, justifySelf: "start", fontSize: 13, gap: 6 }}
            aria-expanded={showDone}
          >
            <TaskAltIcon aria-hidden="true" sx={{ fontSize: 16 }} />
            <span>Hechas hoy ({done.length})</span>
            {showDone ? (
              <ExpandLessIcon aria-hidden="true" sx={{ fontSize: 18 }} />
            ) : (
              <ExpandMoreIcon aria-hidden="true" sx={{ fontSize: 18 }} />
            )}
          </button>
          {showDone
            ? done.map((a) => (
                <Link
                  key={a.id}
                  href={`/erp/actividades/${a.id}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "inherit",
                    textDecoration: "none",
                    fontSize: 13,
                  }}
                >
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <CheckIcon aria-hidden="true" sx={{ ...INLINE_ICON_SX, fontSize: 15, mr: "6px" }} />
                    {a.titulo}
                  </span>
                  <span style={{ color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                    {a.fechaFinalizacion
                      ? new Date(a.fechaFinalizacion).toLocaleTimeString("es-MX", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : a.estatus}
                  </span>
                </Link>
              ))
            : null}
        </section>
      ) : null}

      {pending ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mover-titulo"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            zIndex: 9999,
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 460,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 18,
              padding: 20,
              display: "grid",
              gap: 12,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 750,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--text-tertiary)",
                }}
              >
                Cambiar orden
              </div>
              <h2 id="mover-titulo" style={{ margin: "4px 0 0", fontSize: 17, lineHeight: 1.35 }}>
                «{pending.item.titulo}» pasa del lugar #{pending.from + 1} al #{pending.to + 1}
              </h2>
            </div>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 650 }}>¿Por qué la harás en ese lugar? *</span>
              <textarea
                autoFocus
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej. El cliente la necesita antes de las 12; la otra puede esperar a la tarde."
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  fontFamily: "inherit",
                  fontSize: 14,
                  resize: "vertical",
                  background: "var(--surface)",
                  color: "inherit",
                }}
              />
              <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                {Math.min(reason.trim().length, MIN_REASON)}/{MIN_REASON} caracteres mínimo · queda guardado junto a
                la actividad.
              </span>
            </label>
            {moveError ? <p style={{ margin: 0, color: "#dc2626", fontSize: 13 }}>{moveError}</p> : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" style={btnSecondary} onClick={() => setPending(null)} disabled={saving}>
                Cancelar
              </button>
              <button
                type="button"
                style={{ ...btnPrimary, opacity: saving || reason.trim().length < MIN_REASON ? 0.6 : 1 }}
                onClick={() => void confirmMove()}
                disabled={saving || reason.trim().length < MIN_REASON}
              >
                {saving ? "Guardando…" : "Guardar orden"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
