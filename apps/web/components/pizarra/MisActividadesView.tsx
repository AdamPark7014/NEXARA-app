"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import AddIcon from "@mui/icons-material/Add";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import VerticalAlignTopIcon from "@mui/icons-material/VerticalAlignTop";
import ListAltOutlinedIcon from "@mui/icons-material/ListAltOutlined";
import PriorityHighIcon from "@mui/icons-material/PriorityHigh";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHead,
  EmptyState,
  SkeletonRows,
  Stat,
  StatRow,
  StatusBadge,
  Textarea,
  type Tone,
} from "@/components/base";
import { useUser } from "@/components/UserContext";
import { isCeoEmail } from "@/lib/activity-kinds";
import { formatApiError } from "@/lib/erp-api";
import ReprogramarDespacho from "@/components/pizarra/ReprogramarDespacho";
import IniciarActividad from "@/components/pizarra/IniciarActividad";
import { SesionPropia } from "@/components/pizarra/SesionActividad";
import { SemaforoBadge } from "@/components/pizarra/PizarraKpi";
import { puedeIniciar, textoChipSemaforo, textoPlanVsReal } from "@/lib/actividad-tiempos";
import {
  estatusUi,
  formatMinutes,
  formatWhen,
  kindIcon,
  kindLabel,
  priorityUi,
  shortName,
} from "@/lib/activity-labels";
import ActivityKindIcon from "@/components/ops/ActivityKindIcon";
import {
  fetchMyActivities,
  reorderMyActivities,
  type MyActivitiesResponse,
  type MyActivityItem,
} from "@/lib/my-activities-api";
import c from "./comun.module.css";
import m from "./MisActividadesView.module.css";

const MIN_REASON = 10;

/** Avance de quien ejecuta, según su evidencia. */
function avanceUi(status?: string | null): { label: string; tone: Tone } {
  switch (status) {
    case "COMPLETED":
      return { label: "Evidencia lista", tone: "success" };
    case "EXIT_PHOTO":
      return { label: "Por cerrar", tone: "info" };
    case "SERVICE_SHEET_PDF":
    case "SERVICE_SHEET_DATA":
      return { label: "Llenando hoja", tone: "info" };
    case "EVIDENCE_PHOTOS":
      return { label: "Trabajando en sitio", tone: "info" };
    default:
      return { label: "Sin empezar", tone: "neutral" };
  }
}

/** Franja de la tarjeta: rojo atrasada, ámbar por vencer, azul sin iniciar, verde en tiempo. */
function franja(a: MyActivityItem): "rojo" | "amarillo" | "sinIniciar" | "verde" {
  if (a.semaforo === "rojo") return "rojo";
  if (a.semaforo === "amarillo") return "amarillo";
  if (!a.inicioRealAt) return "sinIniciar";
  return "verde";
}

function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
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
  const atrasadas = open.filter((a) => a.semaforo === "rojo").length;
  const porVencer = open.filter((a) => a.semaforo === "amarillo").length;
  const enTiempo = open.length - atrasadas - porVencer;

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
      <Card>
        <EmptyState
          icon={<GroupsOutlinedIcon />}
          titleAs="h2"
          title="Mis actividades es para el equipo"
          description="Cada quien ve y ordena su propia cola. Para ver a todos entra a Actividades."
          action={
            <ButtonLink href="/erp/pizarra" variant="primary" className={c.tap}>
              Ir a Actividades
            </ButtonLink>
          }
        />
      </Card>
    );
  }

  const autoAsignarme = () => router.push("/erp/mis-actividades/nueva");

  return (
    <div className={m.vista}>
      <header className={m.saludo}>
        <div className={m.saludoTexto}>
          <h2 className={m.hola}>{firstName ? `Hola, ${firstName}` : "Tu día"}</h2>
          <p className={c.tenue}>
            {loading
              ? "Cargando tus actividades…"
              : open.length === 0
                ? "No tienes pendientes por ahora."
                : `Tienes ${open.length} por hacer. Empieza por la #1.`}
          </p>
        </div>
        <div className={m.saludoAcciones}>
          <Button variant="ghost" className={c.tap} iconStart={<RefreshIcon />} onClick={() => void load()}>
            Actualizar
          </Button>
          {data?.canSelfAssign ? (
            <Button variant="primary" className={c.tap} iconStart={<AddIcon />} onClick={autoAsignarme}>
              Auto-asignarme
            </Button>
          ) : null}
        </div>
      </header>

      {data ? (
        <StatRow cols={seguimiento.length ? 4 : 3} ariaLabel="Resumen de tu día">
          <Stat
            label="Por hacer"
            value={open.length}
            icon={<ListAltOutlinedIcon />}
            meter={
              open.length
                ? [
                    { value: enTiempo, tone: "success", label: `${enTiempo} en tiempo` },
                    { value: porVencer, tone: "warning", label: `${porVencer} por vencer` },
                    { value: atrasadas, tone: "danger", label: `${atrasadas} atrasadas` },
                  ]
                : undefined
            }
            meterMax={open.length || undefined}
            hint={open.length ? undefined : "nada pendiente"}
          />
          <Stat
            label="Urgentes"
            value={urgentes}
            tone={urgentes ? "danger" : "default"}
            hint={atrasadas ? `${atrasadas} ya van tarde` : "ninguna va tarde"}
            icon={<PriorityHighIcon />}
            iconTone={urgentes ? "danger" : "neutral"}
            semaforo={atrasadas ? "rojo" : porVencer ? "ambar" : "verde"}
          />
          <Stat
            label="Hechas hoy"
            value={done.length}
            tone={done.length ? "brand" : "default"}
            hint={done.length ? "bien hecho" : "todavía ninguna"}
            icon={<TaskAltIcon />}
            iconTone="success"
          />
          {seguimiento.length ? (
            <Stat
              label="En seguimiento"
              value={seguimiento.length}
              hint="ya las repartiste"
              icon={<VisibilityOutlinedIcon />}
              iconTone="info"
            />
          ) : null}
        </StatRow>
      ) : null}

      {error ? (
        <Alert
          tone={data ? "warning" : "danger"}
          role="alert"
          action={
            <Button size="sm" className={c.tap} onClick={() => void load()}>
              Reintentar
            </Button>
          }
        >
          {data ? `${error}. Sigues viendo lo último que cargó.` : error}
        </Alert>
      ) : null}

      {canReorder ? (
        <Alert tone="brand" title="Tú decides el orden.">
          Usa «Subir» y «Bajar». Cada cambio te pide un motivo corto de por qué la harás en ese lugar.
        </Alert>
      ) : !loading && open.length > 1 && !data?.canReorder ? (
        <p className={c.pista}>El orden sale de la prioridad y la fecha. Si algo no cuadra, avísale a tu encargado.</p>
      ) : null}

      {loading && !data ? (
        <Card>
          <SkeletonRows rows={4} label="Cargando tus actividades" />
        </Card>
      ) : null}

      {!loading && open.length === 0 && !error ? (
        <Card>
          <EmptyState
            icon={<CelebrationIcon />}
            tone="success"
            titleAs="h2"
            title="Todo al día"
            description="Cuando te asignen algo aparecerá aquí."
            action={
              data?.canSelfAssign ? (
                <Button className={c.tap} iconStart={<AddIcon />} onClick={autoAsignarme}>
                  Auto-asignarme una actividad
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : null}

      {open.length ? (
        <section className={m.cola} aria-label="Por hacer">
          {open.map((a, i) => {
            const pr = priorityUi(a.prioridad);
            const est = estatusUi(a.estatus);
            // Varios días: «Día 3 de 10 · termina vie 25 sep» en vez de la hora del primer día.
            const when = a.periodo?.etiqueta ?? formatWhen(a.fechaInicio ?? a.fechaMaxima);
            const estimado = formatMinutes(a.tiempoEstimadoMin);
            const max = formatMinutes(a.tiempoMaximoMin);
            // «Plan 2 h · real 2 h 35 min» (el tiempo estimado por persona manda sobre el viejo).
            const plan = textoPlanVsReal(a.minutosPlan, a.minutosReales);
            const lugar = a.cliente || a.proyecto;
            const first = i === 0;
            const highlighted = highlightId === a.id;
            return (
              <article
                key={a.id}
                className={m.tarea}
                data-primera={first ? "true" : undefined}
                data-resaltada={highlighted ? "true" : undefined}
                data-franja={franja(a)}
              >
                <div className={m.lugar} aria-label={`Lugar ${i + 1}`}>
                  {i + 1}
                </div>
                <div className={m.cuerpo}>
                  {first ? <span className={m.empieza}>Empieza por aquí</span> : null}
                  <div className={c.filaEntre}>
                    <div className={m.cabeza}>
                      <span className={m.tipo} aria-hidden="true">
                        <ActivityKindIcon kind={kindIcon(a)} size={18} />
                      </span>
                      <div className={m.cabezaTexto}>
                        <h3 className={c.tituloFila}>{a.titulo}</h3>
                        <span className={c.folio}>
                          {a.anNumber} · {kindLabel(a)}
                        </span>
                      </div>
                    </div>
                    <div className={m.acciones}>
                      {a.porRepartir && myId ? (
                        <ButtonLink
                          href={`/erp/pizarra/${myId}`}
                          variant="tonal"
                          size="sm"
                          className={c.tap}
                          iconStart={<SendOutlinedIcon />}
                        >
                          Repartir
                        </ButtonLink>
                      ) : null}
                      <ButtonLink
                        href={`/erp/actividades/${a.id}`}
                        size="sm"
                        className={c.tap}
                        iconEnd={<ArrowForwardIcon />}
                      >
                        Abrir
                      </ButtonLink>
                    </div>
                  </div>

                  <div className={m.insignias}>
                    {a.porRepartir ? (
                      <Badge size="sm" tone="warning" icon={<SendOutlinedIcon />}>
                        Te toca repartirla
                      </Badge>
                    ) : null}
                    <StatusBadge size="sm" label={est.label} tone={est.tone ?? "neutral"} />
                    <Badge size="sm" dot tone={pr.tone}>
                      {pr.label}
                    </Badge>
                    {a.semaforo ? (
                      <SemaforoBadge
                        semaforo={a.semaforo}
                        label={textoChipSemaforo(a.semaforo, a.minutosAtraso, a.minutosParaVencer, a.motivoSemaforo)}
                      />
                    ) : null}
                    {puedeIniciar(a) && a.semaforo === "verde" ? (
                      <Badge size="sm" tone="info">
                        Sin iniciar
                      </Badge>
                    ) : null}
                    {a.enPausa ? (
                      <Badge size="sm" tone="warning" icon={<PauseCircleOutlineIcon />}>
                        En pausa
                      </Badge>
                    ) : null}
                    <Badge size="sm" tone="outline" icon={a.autoAsignada ? <PanToolOutlinedIcon /> : undefined}>
                      {a.autoAsignada
                        ? "Auto-asignada"
                        : a.asignadaPor
                          ? `De ${shortName(a.asignadaPor.nombre)}`
                          : "Asignada"}
                    </Badge>
                  </div>

                  <div className={c.datos}>
                    <span className={c.dato}>
                      <EventOutlinedIcon aria-hidden="true" />
                      {when ?? "Sin fecha"}
                    </span>
                    {plan ? (
                      <span className={[c.dato, a.excedida ? m.excedida : ""].filter(Boolean).join(" ")}>
                        <TimerOutlinedIcon aria-hidden="true" />
                        {plan}
                        {a.excedida ? " · excedida" : ""}
                      </span>
                    ) : estimado ? (
                      <span className={c.dato}>
                        <TimerOutlinedIcon aria-hidden="true" />
                        {estimado}
                        {max ? ` · tope ${max}` : ""}
                      </span>
                    ) : null}
                    {lugar ? (
                      <span className={c.dato}>
                        <PlaceOutlinedIcon aria-hidden="true" />
                        {lugar}
                      </span>
                    ) : null}
                  </div>

                  {a.indicaciones ? <p className={c.cita}>{a.indicaciones}</p> : null}
                  {a.ordenJustificacion ? (
                    <p className={[c.tenue, m.porque].join(" ")}>
                      <EditNoteOutlinedIcon aria-hidden="true" />
                      <span>
                        <strong>Por qué va aquí:</strong> {a.ordenJustificacion}
                      </span>
                    </p>
                  ) : null}

                  {/* Quien la recibe no la acepta ni la rechaza: únicamente la inicia. */}
                  {token && puedeIniciar(a) ? (
                    <IniciarActividad
                      token={token}
                      activityId={a.id}
                      variant={first ? "primary" : "tonal"}
                      onDone={() => void load()}
                    />
                  ) : null}
                  {/* Ya iniciada: su reloj corre (Pausar) o está detenido (En pausa · Reanudar). */}
                  {token && !puedeIniciar(a) ? (
                    <SesionPropia token={token} activityId={a.id} actividad={a} miId={myId} onDone={() => void load()} />
                  ) : null}

                  {canReorder ? (
                    <div className={m.orden} role="group" aria-label={`Cambiar el lugar de «${a.titulo}»`}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={c.tap}
                        iconStart={<ArrowUpwardIcon />}
                        disabled={i === 0}
                        onClick={() => askMove(i, i - 1)}
                      >
                        Subir
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={c.tap}
                        iconStart={<ArrowDownwardIcon />}
                        disabled={i === open.length - 1}
                        onClick={() => askMove(i, i + 1)}
                      >
                        Bajar
                      </Button>
                      {i > 1 ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className={c.tap}
                          iconStart={<VerticalAlignTopIcon />}
                          onClick={() => askMove(i, 0)}
                        >
                          Hacerla primero
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      {seguimiento.length ? (
        <Card pad={false} className={m.bloque}>
          <div className={m.bloqueCabeza}>
            <CardHead
              title={`En seguimiento (${seguimiento.length})`}
              subtitle="Ya las repartiste: aquí ves a quién se las pasaste y cómo va quien las ejecuta."
            />
          </div>
          <div className={m.renglones}>
            {seguimiento.map((s) => {
              const est = estatusUi(s.estatus);
              const ejecutor = [...s.pasadaA].reverse().find((p) => p.rol !== "LEAD") ?? null;
              const avance = ejecutor ? avanceUi(ejecutor.evidenceStatus) : null;
              const primera = s.pasadaA[0];
              return (
                <article key={s.id} className={m.renglon}>
                  <div className={c.filaEntre}>
                    <div className={m.cabeza}>
                      <span className={m.tipo} aria-hidden="true">
                        <ActivityKindIcon kind={kindIcon(s)} size={18} />
                      </span>
                      <div className={m.cabezaTexto}>
                        <h3 className={c.tituloFila}>{s.titulo}</h3>
                        <span className={c.folio}>
                          {s.anNumber} · {kindLabel(s)}
                        </span>
                      </div>
                    </div>
                    <ButtonLink
                      href={`/erp/actividades/${s.id}/historial`}
                      size="sm"
                      variant="ghost"
                      className={c.tap}
                      iconEnd={<ArrowForwardIcon />}
                    >
                      Ver registro
                    </ButtonLink>
                  </div>
                  <div className={m.insignias}>
                    <StatusBadge size="sm" label={est.label} tone={est.tone ?? "neutral"} />
                    {avance ? (
                      <Badge size="sm" dot tone={avance.tone}>
                        {shortName(ejecutor?.nombre)}: {avance.label}
                      </Badge>
                    ) : (
                      <Badge size="sm" dot tone="warning">
                        Falta que la asignen
                      </Badge>
                    )}
                  </div>
                  <div className={c.datos}>
                    <span className={c.dato}>
                      <SendOutlinedIcon aria-hidden="true" />
                      Enviada a {s.pasadaA.map((p) => shortName(p.nombre)).join(" → ")}
                      {primera ? ` · ${formatWhen(primera.at) ?? ""}` : ""}
                    </span>
                    {s.ultimaReprogramacion ? (
                      <span className={c.dato}>
                        <EventRepeatIcon aria-hidden="true" />
                        Reprogramada por {shortName(s.ultimaReprogramacion.por) || "alguien"} ·{" "}
                        {formatWhen(s.ultimaReprogramacion.at) ?? ""}
                      </span>
                    ) : null}
                  </div>
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
          </div>
        </Card>
      ) : null}

      {done.length ? (
        <Card pad={false} className={m.bloque}>
          <Button
            variant="ghost"
            fullWidth
            className={m.plegable}
            iconStart={<TaskAltIcon />}
            iconEnd={showDone ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
          >
            <span className={m.plegableTexto}>Hechas hoy</span>
            <Badge size="sm" tone="success">
              {done.length}
            </Badge>
          </Button>
          {showDone ? (
            <ul className={m.hechas}>
              {done.map((a) => (
                <li key={a.id}>
                  <Link className={m.hecha} href={`/erp/actividades/${a.id}`}>
                    <CheckIcon aria-hidden="true" className={m.hechaIco} />
                    <span className={m.hechaTitulo}>{a.titulo}</span>
                    <span className={m.hechaHora}>{a.fechaFinalizacion ? horaCorta(a.fechaFinalizacion) : a.estatus}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      {pending ? (
        <div
          className={m.velo}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mover-titulo"
          onKeyDown={(e) => {
            if (e.key === "Escape" && !saving) setPending(null);
          }}
        >
          <div className={m.dialogo}>
            <div>
              <span className={m.dialogoEyebrow}>Cambiar orden</span>
              <h2 id="mover-titulo" className={m.dialogoTitulo}>
                «{pending.item.titulo}» pasa del lugar #{pending.from + 1} al #{pending.to + 1}
              </h2>
            </div>
            <div className={m.campo}>
              <label className={m.etiqueta} htmlFor="mover-motivo">
                ¿Por qué la harás en ese lugar? <span className={m.req}>*</span>
              </label>
              <Textarea
                id="mover-motivo"
                autoFocus
                rows={3}
                maxLength={500}
                value={reason}
                invalid={Boolean(moveError)}
                aria-describedby="mover-ayuda"
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej. El cliente la necesita antes de las 12; la otra puede esperar a la tarde."
              />
              {moveError ? (
                <span id="mover-ayuda" className={c.error} role="alert">
                  {moveError}
                </span>
              ) : (
                <span id="mover-ayuda" className={c.pista}>
                  {Math.min(reason.trim().length, MIN_REASON)}/{MIN_REASON} caracteres mínimo · queda guardado junto a
                  la actividad.
                </span>
              )}
            </div>
            <div className={m.dialogoPie}>
              <Button variant="ghost" className={c.tap} onClick={() => setPending(null)} disabled={saving}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                className={c.tap}
                loading={saving}
                onClick={() => void confirmMove()}
                disabled={reason.trim().length < MIN_REASON}
              >
                {saving ? "Guardando…" : "Guardar orden"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
