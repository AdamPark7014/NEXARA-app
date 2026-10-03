"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import LoginIcon from "@mui/icons-material/Login";
import LogoutIcon from "@mui/icons-material/Logout";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import AddIcon from "@mui/icons-material/Add";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import WorkOutlineIcon from "@mui/icons-material/WorkOutline";
import ScheduleIcon from "@mui/icons-material/Schedule";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import HistoryIcon from "@mui/icons-material/History";
import PersonOffOutlinedIcon from "@mui/icons-material/PersonOffOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import { IconLabel } from "@/components/ui/IconBadge";
import {
  Alert,
  AsideCard,
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  RecordPage,
  RecordSection,
  Skeleton,
  StatusBadge,
  Tabs,
  buttonClass,
  type RecordFact,
  type RecordMetaItem,
} from "@/components/base";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import { resolveAssetUrl } from "@/lib/evidence-display";
import {
  STATUS_LABELS,
  fetchTeamBoardHistory,
  fetchTeamBoardUser,
  formatClock,
  formatMinutes,
  type BoardRange,
  type RangoPreset,
  type TeamBoardHistoryItem,
  type TeamBoardUser,
} from "@/lib/team-board-api";
import { KpiStrip, PrioridadChip, RangoSelector, SemaforoDot } from "@/components/pizarra/PizarraKpi";
import { AvatarAro } from "@/components/pizarra/EquipoPersonaCard";
import { ARO_DE_ESTADO } from "@/components/pizarra/equipo-estado";
import { ESTADO_EQUIPO_TONE } from "@/components/pizarra/tonos";
import { digitalFormLabels } from "@/lib/evidence-flow-helpers";
import { chargeLabel, estatusUi, formatHourMinute, kindLabel } from "@/lib/activity-labels";
import DespachoPendingPanel from "@/components/pizarra/DespachoPendingPanel";
import { PausarDeEquipo } from "@/components/pizarra/SesionActividad";
import { textoPausa } from "@/lib/sesion-actividad";
import { FotoProtegida, VisorPdf } from "@/components/ops/EquipoEvidencias";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getActivitiesSectionConfig } from "@/lib/section-views";
import c from "@/components/pizarra/comun.module.css";
import f from "./ficha.module.css";

type Pestana = "ahora" | "historial";

/** `FotoProtegida` pide su estilo como prop: la miniatura llena su marco de 104 px. */
const FOTO_MINIATURA: CSSProperties = { width: "100%", height: "100%", objectFit: "cover", display: "block" };

function FichaCargando() {
  return (
    <div className={f.cargando} aria-busy="true" aria-label="Cargando perfil">
      <Skeleton width={180} height={14} />
      <Card>
        <div className={f.cargandoCabeza}>
          <Skeleton width={52} height={52} radius={26} />
          <div className={f.cargandoTexto}>
            <Skeleton width="40%" height={12} />
            <Skeleton width="60%" height={22} />
            <Skeleton width="30%" height={12} />
          </div>
        </div>
      </Card>
      <div className={f.cargandoCuerpo}>
        <Skeleton height={320} radius={16} />
        <Skeleton height={320} radius={16} />
      </div>
    </div>
  );
}

export default function PizarraPersonaPage() {
  const params = useParams();
  const { token, user: me } = useUser();
  const userId = Number(params?.userId);
  const isSelf = me?.id != null && me.id === userId;
  const [user, setUser] = useState<TeamBoardUser | null>(null);
  const [history, setHistory] = useState<TeamBoardHistoryItem[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [pdfAbierto, setPdfAbierto] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [asignada, setAsignada] = useState(false);
  const [preset, setPreset] = useState<RangoPreset>("hoy");
  const [rango, setRango] = useState<BoardRange>({});
  const [pestana, setPestana] = useState<Pestana>("ahora");
  const hayDatos = useRef(false);
  const desde = rango.desde ?? null;
  const hasta = rango.hasta ?? null;

  // Al volver de asignar (`?asignada=<id>`). Sin useSearchParams: evita el error de Suspense en build.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("asignada")) setAsignada(true);
  }, []);

  const cerrarAviso = () => {
    setAsignada(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("asignada");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    } catch {
      /* sin History API: basta con ocultarlo */
    }
  };

  useEffect(() => {
    hayDatos.current = false;
    setUser(null);
  }, [userId]);

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(userId)) {
      setLoading(false);
      setError("No encontramos a esta persona.");
      return;
    }
    setLoading(true);
    try {
      const [card, hist] = await Promise.all([
        fetchTeamBoardUser(token, userId, { desde, hasta }),
        fetchTeamBoardHistory(token, userId).then(
          (h) => ({ ok: true as const, items: Array.isArray(h) ? h : [] }),
          (e: unknown) => ({ ok: false as const, error: formatApiError(e, "No se pudo cargar el historial") }),
        ),
      ]);
      hayDatos.current = true;
      setUser(card);
      if (hist.ok) {
        setHistory(hist.items);
        setHistoryError(null);
      } else {
        setHistoryError(hist.error);
      }
      setError(null);
      setRefreshError(null);
      setUpdatedAt(Date.now());
    } catch (e) {
      const msg = formatApiError(e, "No se pudo cargar el perfil");
      if (hayDatos.current) setRefreshError(msg);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }, [token, userId, desde, hasta]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token) return;
    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };
    const id = window.setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [token, load]);

  if (loading && !user && !error) return <FichaCargando />;

  if (!user) {
    return (
      <div className={f.noEncontrada}>
        <Card>
          <EmptyState
            icon={<PersonOffOutlinedIcon />}
            tone="danger"
            titleAs="h2"
            title="No pudimos abrir este perfil"
            description={error || "No encontramos a esta persona."}
            action={
              <Button variant="primary" className={c.tap} onClick={() => void load()} loading={loading}>
                {loading ? "Cargando…" : "Reintentar"}
              </Button>
            }
            secondaryAction={
              <ButtonLink href="/erp/pizarra" className={c.tap}>
                Volver al equipo
              </ButtonLink>
            }
          />
        </Card>
      </div>
    );
  }

  const act = user.currentActivity;
  const actEstatus = act ? estatusUi(act.estatus) : null;
  // Sesiones de trabajo: la fila completa de lo que está haciendo (corre / en pausa) y
  // lo demás que tenga con el reloj corriendo. Solo su jefe (o dirección) lo pausa.
  const abiertas = user.openActivities ?? [];
  const actAbierta = act ? abiertas.find((a) => a.id === act.id) : undefined;
  const otrasCorriendo = abiertas.filter((a) => a.enCurso && a.id !== act?.id);
  const puedoPausar = Boolean(!isSelf && token && user.puedePausar);
  const actCfg = getActivitiesSectionConfig(me);
  const canAssign =
    hasPermission(me, PERMISSIONS.ACTIVITIES_MANAGE) && actCfg.canCreate && actCfg.canAssign;
  const espera = user.enEsperaAprobacion ?? 0;

  const meta: RecordMetaItem[] = [
    { icon: <WorkOutlineIcon aria-hidden="true" />, label: user.puesto || "Equipo NEXARA" },
    {
      icon: <LoginIcon aria-hidden="true" />,
      label: user.clockInAt ? `Entrada ${formatClock(user.clockInAt)}` : "Sin entrada registrada",
    },
    ...(updatedAt
      ? [{ icon: <ScheduleIcon aria-hidden="true" />, label: `Actualizado ${formatHourMinute(updatedAt)}` }]
      : []),
  ];

  const facts: RecordFact[] = [
    {
      label: preset === "hoy" ? "Entrada hoy" : "Última entrada",
      value: formatClock(user.clockInAt),
      hint: user.clockInAt ? "Entrada registrada" : "Sin registro",
    },
    { label: "Horas trabajadas", value: formatMinutes(user.workedMinutes), hint: "Entrada a salida, sin la comida" },
    {
      label: "En actividad",
      value: formatMinutes(user.activityElapsedMinutes),
      hint: actAbierta?.enPausa
        ? "En pausa"
        : user.activityStartedAt
          ? `Desde las ${formatClock(user.activityStartedAt)}`
          : "Sin actividad iniciada",
    },
    ...(user.kpis
      ? [
          {
            label: "Horas productivas",
            value: formatMinutes(user.kpis.minutosEnActividad),
            hint: "Con una actividad corriendo, dentro de su jornada",
          },
        ]
      : []),
  ];

  const pestanas = (
    <div className={f.pestanas}>
      <Tabs
        ariaLabel="Secciones de la ficha"
        items={[
          { id: "ahora" as const, label: "Ahora", icon: BoltOutlinedIcon, count: abiertas.length || undefined },
          { id: "historial" as const, label: "Historial", icon: HistoryIcon, count: history.length },
        ]}
        value={pestana}
        onChange={setPestana}
      />
      <div className={f.rango}>
        <RangoSelector
          preset={preset}
          rango={rango}
          onChange={(p, r) => {
            setPreset(p);
            setRango(p === "hoy" ? {} : r);
          }}
        />
      </div>
    </div>
  );

  const avisos =
    asignada || refreshError ? (
      <div className={c.pila}>
        {asignada ? (
          <Alert tone="success" role="status" onDismiss={cerrarAviso} dismissLabel="Cerrar aviso">
            Actividad asignada
          </Alert>
        ) : null}
        {refreshError ? (
          <Alert
            tone="warning"
            role="status"
            action={
              <Button size="sm" className={c.tap} onClick={() => void load()} disabled={loading}>
                Reintentar
              </Button>
            }
          >
            No se pudo actualizar. Ves lo de las {formatHourMinute(updatedAt)}.
          </Alert>
        ) : null}
      </div>
    ) : null;

  const ahora = (
    <>
      {isSelf && token ? (
        <DespachoPendingPanel
          token={token}
          managerEmail={me?.email ?? user.email}
          managerUserId={user.id}
          pending={user.openActivities ?? []}
          onDone={() => void load()}
        />
      ) : null}

      <RecordSection title="Actividad en curso">
        {act && actEstatus ? (
          <div className={f.actual}>
            <div className={c.filaEntre}>
              <div className={f.actualTexto}>
                <h3 className={f.actualTitulo}>{act.titulo}</h3>
                <span className={c.folio}>{act.anNumber}</span>
              </div>
              <ButtonLink
                href={`/erp/actividades/${act.id}`}
                size="sm"
                className={c.tap}
                iconEnd={<ArrowForwardIcon />}
              >
                Abrir actividad
              </ButtonLink>
            </div>
            <div className={f.insignias}>
              <StatusBadge size="sm" label={actEstatus.label} tone={actEstatus.tone ?? "neutral"} />
              {actAbierta?.enPausa ? (
                <Badge size="sm" dot tone="warning">
                  En pausa
                </Badge>
              ) : actAbierta?.enCurso ? (
                <Badge size="sm" dot tone="success">
                  Reloj corriendo
                </Badge>
              ) : null}
              {act.periodo ? (
                <span className={act.periodo.estado === "vencida" ? f.vencida : c.tenue}>{act.periodo.etiqueta}</span>
              ) : null}
            </div>
            {actAbierta?.enPausa ? (
              <p className={c.cita}>{textoPausa(actAbierta, { miId: me?.id, propia: isSelf })}</p>
            ) : null}
            {puedoPausar && token && actAbierta?.enCurso ? (
              <PausarDeEquipo
                token={token}
                userId={user.id}
                activityId={act.id}
                nombre={user.nombre}
                onDone={() => void load()}
              />
            ) : null}
          </div>
        ) : (
          <p className={c.tenue}>No tiene nada abierto en este momento.</p>
        )}
      </RecordSection>

      {puedoPausar && token && otrasCorriendo.length ? (
        <RecordSection title="También tiene el reloj corriendo en" subtitle={`${otrasCorriendo.length} más`}>
          <div className={f.otras}>
            {otrasCorriendo.map((a) => (
              <div key={a.id} className={f.otra}>
                <div>
                  <h3 className={c.tituloFila}>{a.titulo}</h3>
                  <span className={c.folio}>{a.anNumber}</span>
                </div>
                <PausarDeEquipo token={token} userId={user.id} activityId={a.id} nombre={user.nombre} onDone={() => void load()} />
              </div>
            ))}
          </div>
        </RecordSection>
      ) : null}
    </>
  );

  const historial = (
    <RecordSection title="Historial de actividades" subtitle={history.length ? `${history.length} en total` : undefined}>
      {historyError && history.length === 0 ? (
        <Alert
          tone="danger"
          role="alert"
          action={
            <Button size="sm" className={c.tap} onClick={() => void load()} disabled={loading}>
              Reintentar
            </Button>
          }
        >
          No se pudo cargar el historial.
        </Alert>
      ) : history.length === 0 ? (
        <EmptyState
          icon={<HistoryIcon />}
          tone="neutral"
          title="Todavía no tiene actividades registradas"
          description="Cuando cierre su primera actividad, aquí quedan sus fotos, su hoja y sus tiempos."
        />
      ) : (
        <ul className={f.historial}>
          {historyError ? (
            <li>
              <Alert tone="warning" role="status" dense>
                {historyError}. Se muestra lo último que cargó.
              </Alert>
            </li>
          ) : null}
          {history.map((h) => {
            const ev = h.evidence;
            const open = Boolean(ev) && expandedId === h.id;
            const est = estatusUi(h.estatus);
            const encargo = chargeLabel(h.assignmentCharge);
            const labels = digitalFormLabels(h.coreKind);
            const formData =
              ev?.serviceSheetData && typeof ev.serviceSheetData === "object"
                ? (ev.serviceSheetData as Record<string, string>)
                : {};
            const meta = [
              ev ? `Avance ${ev.progressPct}%` : null,
              h.minutosPlan != null ? `Plan ${formatMinutes(h.minutosPlan)}` : null,
              h.minutosReales != null ? `Real ${formatMinutes(h.minutosReales)}` : null,
            ].filter(Boolean);
            const resumen = (
              <>
                <span className={f.itemCabeza}>
                  <span className={f.itemSemaforo}>
                    <SemaforoDot semaforo={h.semaforo} />
                  </span>
                  <span className={f.itemTexto}>
                    <span className={f.itemTitulo}>{h.titulo}</span>
                    <span className={c.folio}>
                      {h.anNumber} · {kindLabel(h)}
                    </span>
                  </span>
                  {ev ? (
                    <span className={f.itemFlecha} aria-hidden="true">
                      {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </span>
                  ) : null}
                </span>
                <span className={f.insignias}>
                  <StatusBadge size="sm" label={est.label} tone={est.tone ?? "neutral"} />
                  {encargo ? (
                    <Badge size="sm" tone="outline">
                      {encargo}
                    </Badge>
                  ) : null}
                  <PrioridadChip prioridad={h.prioridad} />
                  {h.retirado ? (
                    <Badge size="sm" tone="neutral" title="La sacaron del equipo de esta actividad">
                      Ya no está en el equipo
                    </Badge>
                  ) : null}
                  {meta.length ? <span className={c.pista}>{meta.join(" · ")}</span> : null}
                </span>
              </>
            );
            return (
              <li key={h.id} className={f.item} data-abierto={open ? "true" : undefined}>
                {ev ? (
                  <button
                    type="button"
                    className={f.itemBoton}
                    onClick={() => setExpandedId(open ? null : h.id)}
                    aria-expanded={open}
                  >
                    {resumen}
                  </button>
                ) : (
                  <div className={f.itemEstatico}>{resumen}</div>
                )}
                {open && ev ? (
                  <div className={f.detalle}>
                    <div className={f.fotos}>
                      {[
                        ...(ev.entryPhotoUrl ? [{ url: ev.entryPhotoUrl, label: "Entrada", icon: LoginIcon }] : []),
                        ...(ev.evidencePhotos || []).map((url, i) => ({
                          url,
                          label: `Evidencia ${i + 1}`,
                          icon: PhotoCameraOutlinedIcon,
                        })),
                        ...(ev.exitPhotoUrl ? [{ url: ev.exitPhotoUrl, label: "Salida", icon: LogoutIcon }] : []),
                      ].map((foto, i) => (
                        <figure key={`${h.id}-foto-${i}`} className={f.foto}>
                          <div className={f.fotoMarco}>
                            <FotoProtegida
                              url={foto.url}
                              alt={`${foto.label} · ${h.titulo}`}
                              alto={104}
                              style={FOTO_MINIATURA}
                            />
                          </div>
                          <figcaption className={f.fotoPie}>
                            <IconLabel icon={foto.icon} size={14} gap={4}>
                              {foto.label}
                            </IconLabel>
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                    {labels.some((l) => formData[l.key]) ? (
                      <dl className={f.hoja}>
                        {labels.map((l) =>
                          formData[l.key] ? (
                            <div key={l.key} className={f.hojaFila}>
                              <dt>{l.label}</dt>
                              <dd>{formData[l.key]}</dd>
                            </div>
                          ) : null,
                        )}
                      </dl>
                    ) : null}
                    <div className={c.fila}>
                      {ev.serviceSheetPdfUrl ? (
                        <>
                          <a
                            href={resolveAssetUrl(ev.serviceSheetPdfUrl) ?? ev.serviceSheetPdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={[buttonClass("secondary", { size: "sm" }), f.enlaceBoton, c.tap].join(" ")}
                          >
                            <DescriptionOutlinedIcon aria-hidden="true" />
                            Abrir hoja de servicio
                          </a>
                          <Button
                            size="sm"
                            variant="ghost"
                            className={c.tap}
                            aria-expanded={pdfAbierto === h.id}
                            onClick={() => setPdfAbierto(pdfAbierto === h.id ? null : h.id)}
                          >
                            {pdfAbierto === h.id ? "Ocultar vista previa" : "Ver aquí"}
                          </Button>
                        </>
                      ) : null}
                      <ButtonLink
                        href={`/erp/actividades/${h.id}`}
                        size="sm"
                        variant="ghost"
                        className={c.tap}
                        iconEnd={<ArrowForwardIcon />}
                      >
                        Abrir actividad
                      </ButtonLink>
                    </div>
                    {ev.serviceSheetPdfUrl && pdfAbierto === h.id ? (
                      <VisorPdf url={ev.serviceSheetPdfUrl} alto="500px" />
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </RecordSection>
  );

  return (
    <div className={f.ficha}>
      <RecordPage
        breadcrumbs={[
          { label: "Actividades", href: "/erp/pizarra" },
          { label: "Mi equipo", href: "/erp/pizarra?vista=equipo" },
          { label: user.nombre },
        ]}
        icon={
          <AvatarAro
            nombre={user.nombre}
            avatarUrl={user.avatarUrl}
            estado={ARO_DE_ESTADO[user.status] ?? null}
            atrasada={user.status === "atrasado"}
            size={52}
            className={f.fotoHero}
          />
        }
        statusLabel={STATUS_LABELS[user.status]}
        statusTone={ESTADO_EQUIPO_TONE[user.status]}
        badges={
          isSelf || user.enCorreccion || espera > 0 ? (
            <>
              {isSelf ? (
                <Badge size="sm" tone="brand">
                  Tú
                </Badge>
              ) : null}
              {user.enCorreccion ? (
                <Badge size="sm" tone="warning" title="Está corrigiendo evidencia devuelta">
                  Corrigiendo
                </Badge>
              ) : null}
              {espera > 0 ? (
                <Badge size="sm" tone="violet" title="Entregadas que nadie ha aprobado">
                  {espera > 1 ? `${espera} en espera` : "En espera"}
                </Badge>
              ) : null}
            </>
          ) : undefined
        }
        title={user.nombre}
        meta={meta}
        tertiaryActions={
          <Button
            variant="ghost"
            className={c.tap}
            iconStart={<RefreshIcon className={loading ? f.girando : undefined} />}
            onClick={() => void load()}
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? "Actualizando…" : "Actualizar"}
          </Button>
        }
        primaryAction={
          !isSelf && canAssign ? (
            <ButtonLink
              href={`/erp/pizarra/${user.id}/asignar`}
              variant="primary"
              className={c.tap}
              iconStart={<AddIcon />}
            >
              Asignar actividad
            </ButtonLink>
          ) : isSelf ? (
            <ButtonLink href="/erp/pizarra?vista=mias" className={c.tap} iconEnd={<ArrowForwardIcon />}>
              Ver mis actividades
            </ButtonLink>
          ) : undefined
        }
        tabs={pestanas}
        facts={facts}
        factsTitle="Jornada"
        aside={
          user.kpis ? (
            <AsideCard title="Rendimiento del periodo">
              <KpiStrip kpis={user.kpis} />
            </AsideCard>
          ) : undefined
        }
      >
        {avisos}
        {pestana === "ahora" ? ahora : historial}
      </RecordPage>
    </div>
  );
}
