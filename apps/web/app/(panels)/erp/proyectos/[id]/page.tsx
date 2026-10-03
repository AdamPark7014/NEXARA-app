"use client";

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import { useUser } from "@/components/UserContext";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  DateInput,
  EmptyState,
  Field,
  LinkButton,
  Progress,
  RecordPage,
  Skeleton,
  Tabs,
  Textarea,
  type KindId,
  type RecordFact,
  type RecordStep,
} from "@/components/base";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { formatApiError } from "@/lib/erp-api";
import {
  ESTADO_PROYECTO_LABEL,
  ESTADO_TONO,
  SALUD_TONO,
  formatoFecha,
  formatoMoneda,
  obtenerProyecto,
  type ProyectoDetalle,
} from "@/lib/proyectos-api";
import { accionesDeEstado, hoyISO, type AccionDeEstado } from "@/lib/proyecto-plan";
import { getServiceProjectTypeLabel } from "@/lib/service-project-types";
import { cambiarEstado } from "../_componentes/acciones";
import { usePersonasAsignables } from "../_componentes/personas";
import { toneDe } from "../_componentes/tono";
import type { SeccionProps } from "../_componentes/tipos";
import SeccionResumen from "../_componentes/SeccionResumen";
import SeccionCronograma from "../_componentes/SeccionCronograma";
import SeccionAlcance from "../_componentes/SeccionAlcance";
import SeccionRequerimientos from "../_componentes/SeccionRequerimientos";
import SeccionEquipo from "../_componentes/SeccionEquipo";
import SeccionDocumentos from "../_componentes/SeccionDocumentos";
import SeccionActividades from "../_componentes/SeccionActividades";
import styles from "../ficha.module.css";

const PESTANAS = [
  { id: "resumen", titulo: "Resumen" },
  { id: "cronograma", titulo: "Cronograma" },
  { id: "alcance", titulo: "Alcance" },
  { id: "requerimientos", titulo: "Requerimientos" },
  { id: "equipo", titulo: "Equipo" },
  { id: "documentos", titulo: "Documentos" },
  { id: "actividades", titulo: "Actividades" },
] as const;

type Pestana = (typeof PESTANAS)[number]["id"];

/** Color de categoría del icono según el tipo de proyecto (nunca de estado). */
const KIND_POR_TIPO: Record<string, KindId> = {
  INSTALACION_CCTV: "cctv",
  CONTROL_ACCESO: "acceso",
  REDES_WIFI: "red",
  CABLEADO_ESTRUCTURADO: "red",
  AUDITORIA_NODOS: "red",
  PROYECTO_INTEGRAL: "obra",
};

function conteoDe(p: ProyectoDetalle, pestana: Pestana): number | undefined {
  switch (pestana) {
    case "cronograma":
      return p.milestones.length;
    case "alcance":
      return p.scopeItems.length;
    case "requerimientos":
      return p.requirements.length;
    case "equipo":
      return p.members.length;
    case "documentos":
      return p.documents.length;
    case "actividades":
      return p.activities.length;
    default:
      return undefined;
  }
}

function mensajeDeConfirmacion(p: ProyectoDetalle, accion: AccionDeEstado): string {
  switch (accion.hacia) {
    case "ACTIVE":
      if (p.status === "COMPLETED") return "Se reabre el proyecto y se borra su fecha real de entrega.";
      return p.actualStartDate
        ? "El proyecto pasa a «En curso»."
        : "El proyecto pasa a «En curso» y se anota hoy como su inicio real.";
    case "ON_HOLD":
      return "El proyecto queda en pausa. Ojo: el calendario sigue corriendo contra el fin planeado.";
    case "PLANNED":
      return "El proyecto regresa a «Planeado»: todavía no arranca.";
    default:
      return `El proyecto pasa a «${ESTADO_PROYECTO_LABEL[accion.hacia]}».`;
  }
}

function esPestana(valor: string | null): valor is Pestana {
  return PESTANAS.some((t) => t.id === valor);
}

/** La acción que hace avanzar el proyecto es la principal (una sola por pantalla). */
function esPrincipal(p: ProyectoDetalle, a: AccionDeEstado): boolean {
  return !a.peligro && (a.hacia === "COMPLETED" || (a.hacia === "ACTIVE" && p.status === "PLANNED"));
}

/** Planeado → En curso → Entregado, con las fechas que ya se conocen. */
function pasosDe(p: ProyectoDetalle): RecordStep[] | undefined {
  if (p.status === "CANCELLED") return undefined;
  const arranco = p.status !== "PLANNED";
  const termino = p.status === "COMPLETED";
  return [
    {
      id: "planeado",
      label: "Planeado",
      hint: p.startDate ? `Inicio ${formatoFecha(p.startDate)}` : "Sin fecha de inicio",
      state: arranco ? "done" : "current",
    },
    {
      id: "curso",
      label: p.status === "ON_HOLD" ? "En pausa" : "En curso",
      hint: p.actualStartDate ? `Desde ${formatoFecha(p.actualStartDate)}` : "Aún no arranca",
      state: termino ? "done" : arranco ? "current" : "pending",
    },
    {
      id: "entregado",
      label: "Entregado",
      hint: p.actualEndDate
        ? formatoFecha(p.actualEndDate)
        : p.endDate
          ? `Plan ${formatoFecha(p.endDate)}`
          : "Sin fecha de fin",
      state: termino ? "done" : "pending",
    },
  ];
}

export default function ProyectoDetallePage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const router = useRouter();
  const { user, token } = useUser();
  const hoy = useMemo(() => hoyISO(), []);

  const [pestana, setPestana] = useState<Pestana>("resumen");
  const [proyecto, setProyecto] = useState<ProyectoDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<ConfirmState | null>(null);
  const [cambio, setCambio] = useState<{ accion: AccionDeEstado; motivo: string; fecha: string } | null>(null);
  const [errorCambio, setErrorCambio] = useState<string | null>(null);

  // ?tab=cronograma abre directo en esa sección.
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (esPestana(tab)) setPestana(tab);
  }, []);

  const cargar = useCallback(async () => {
    if (!token || !Number.isInteger(id) || id <= 0) return;
    setCargando(true);
    setErrorCarga(null);
    try {
      setProyecto(await obtenerProyecto(token, id));
    } catch (e) {
      setErrorCarga(formatApiError(e, "No se pudo cargar el proyecto"));
    } finally {
      setCargando(false);
    }
  }, [token, id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // El aviso de «guardado» se va solo; el error se queda hasta la siguiente acción.
  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), 4000);
    return () => window.clearTimeout(t);
  }, [aviso]);

  const yo = useMemo(() => (user?.id ? { id: user.id, nombre: user.nombre } : null), [user?.id, user?.nombre]);
  const extras = useMemo(
    () =>
      proyecto
        ? [
            proyecto.responsable,
            ...proyecto.members.map((m) => m.user),
            ...proyecto.milestones.map((h) => h.responsable),
            ...proyecto.requirements.map((r) => r.responsable),
          ]
        : [],
    [proyecto],
  );
  const { personas } = usePersonasAsignables(token, yo, extras);

  const mutar = useCallback<SeccionProps["mutar"]>(async (accion, exito) => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const detalle = await accion();
      setProyecto(detalle);
      if (exito) setAviso(exito);
      return true;
    } catch (e) {
      setError(formatApiError(e, "No se pudo guardar el cambio"));
      return false;
    } finally {
      setOcupado(false);
    }
  }, []);

  function elegirPestana(destino: Pestana) {
    setPestana(destino);
    const qs = new URLSearchParams(window.location.search);
    if (destino === "resumen") qs.delete("tab");
    else qs.set("tab", destino);
    const texto = qs.toString();
    router.replace(`/erp/proyectos/${id}${texto ? `?${texto}` : ""}`, { scroll: false });
  }

  /** Flechas, Inicio y Fin mueven entre pestañas, como en cualquier lista de pestañas. */
  function teclaEnPestanas(e: KeyboardEvent<HTMLDivElement>) {
    const actual = PESTANAS.findIndex((t) => t.id === pestana);
    let siguiente = actual;
    if (e.key === "ArrowRight") siguiente = (actual + 1) % PESTANAS.length;
    else if (e.key === "ArrowLeft") siguiente = (actual - 1 + PESTANAS.length) % PESTANAS.length;
    else if (e.key === "Home") siguiente = 0;
    else if (e.key === "End") siguiente = PESTANAS.length - 1;
    else return;
    e.preventDefault();
    elegirPestana(PESTANAS[siguiente].id);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[siguiente]?.focus();
  }

  if (!Number.isInteger(id) || id <= 0) {
    return (
      <div className={styles.pagina}>
        <EmptyState
          icon={<ErrorOutlineRoundedIcon />}
          title="Ese proyecto no existe"
          description="El enlace está incompleto o el proyecto ya no está disponible."
          action={<ButtonLink href="/erp/proyectos">Volver a proyectos</ButtonLink>}
          size="page"
        />
      </div>
    );
  }

  if (cargando && !proyecto) {
    return (
      <div className={styles.pagina} aria-busy="true" aria-label="Cargando proyecto">
        <div className={styles.esqueletoCabeza}>
          <Skeleton width={120} height={12} />
          <Skeleton width="45%" height={26} />
          <Skeleton width={260} height={14} />
          <Skeleton height={44} radius={12} />
        </div>
        <div className={styles.esqueletoCuerpo}>
          <Skeleton height={360} radius={16} />
          <Skeleton height={260} radius={16} />
        </div>
      </div>
    );
  }

  if (!proyecto) {
    return (
      <div className={styles.pagina}>
        <ButtonLink href="/erp/proyectos" variant="tertiary" size="sm">
          ← Proyectos
        </ButtonLink>
        <div role="alert">
          <EmptyState
            icon={<ErrorOutlineRoundedIcon />}
            title="No pudimos abrir el proyecto"
            description={errorCarga ?? "Revisa tu conexión e inténtalo de nuevo."}
            tone="danger"
            size="page"
            action={
              <Button variant="primary" onClick={() => void cargar()}>
                Reintentar
              </Button>
            }
            secondaryAction={<ButtonLink href="/erp/proyectos">Volver a proyectos</ButtonLink>}
          />
        </div>
      </div>
    );
  }

  const p = proyecto;
  // Orden del sistema: peligro → secundarias → la principal al final.
  const acciones = [...accionesDeEstado(p.status)].sort((a, b) => {
    const peso = (x: AccionDeEstado) => (x.peligro ? 0 : esPrincipal(p, x) ? 2 : 1);
    return peso(a) - peso(b);
  });
  const seccion: SeccionProps | null = token
    ? { proyecto: p, token, hoy, ocupado, personas, mutar, confirmar: setConfirmacion }
    : null;

  function pedirCambio(accion: AccionDeEstado) {
    setError(null);
    setErrorCambio(null);
    if (accion.pide) {
      setCambio({ accion, motivo: "", fecha: hoy });
      return;
    }
    setConfirmacion({
      title: accion.etiqueta,
      message: mensajeDeConfirmacion(p, accion),
      confirmLabel: accion.etiqueta,
      danger: false,
      fn: async () => {
        if (!token) return;
        await mutar(
          () => cambiarEstado(token, p, accion.hacia, {}, hoy),
          `Proyecto ${ESTADO_PROYECTO_LABEL[accion.hacia].toLowerCase()}.`,
        );
      },
    });
  }

  async function confirmarCambio() {
    if (!cambio || !token) return;
    const { accion } = cambio;
    if (accion.pide === "motivo" && !cambio.motivo.trim()) {
      setErrorCambio("Escribe por qué se cancela: queda en el historial del proyecto.");
      return;
    }
    if (accion.pide === "fechaDeEntrega" && !cambio.fecha) {
      setErrorCambio("Pon la fecha real de entrega.");
      return;
    }
    const ok = await mutar(
      () =>
        cambiarEstado(
          token,
          p,
          accion.hacia,
          accion.pide === "motivo" ? { cancelReason: cambio.motivo.trim() } : { actualEndDate: cambio.fecha },
          hoy,
        ),
      accion.hacia === "CANCELLED" ? "Proyecto cancelado." : "Proyecto terminado.",
    );
    if (ok) setCambio(null);
  }

  const etapasSinCumplir = p.milestones.filter(
    (h) => h.status !== "CUMPLIDO" && h.status !== "CANCELADO" && !h.actualDate,
  ).length;
  const pendientesAlTerminar = [
    p.resumen.avance.abiertas ? `${p.resumen.avance.abiertas} actividad(es) abierta(s)` : null,
    p.resumen.requerimientos.pendientes ? `${p.resumen.requerimientos.pendientes} requerimiento(s) pendiente(s)` : null,
    etapasSinCumplir ? `${etapasSinCumplir} etapa(s) sin cumplir` : null,
  ].filter(Boolean);

  const avance = p.resumen.avance.porcentaje;
  const r = p.resumen;
  const comoVa = p.actualEndDate
    ? `Entregado ${formatoFecha(p.actualEndDate)}`
    : r.diasDeRetraso > 0
      ? `${r.diasDeRetraso} día${r.diasDeRetraso === 1 ? "" : "s"} de retraso`
      : r.diasRestantes !== null
        ? `Faltan ${r.diasRestantes} día${r.diasRestantes === 1 ? "" : "s"}`
        : undefined;

  const datosClave: RecordFact[] = [
    {
      label: "Avance",
      value:
        avance === null ? (
          <span className={styles.tenue}>Sin datos todavía</span>
        ) : (
          <Progress value={avance} max={100} label={`${avance} %`} ariaLabel="Avance" tone={avance >= 100 ? "success" : "brand"} />
        ),
    },
    {
      label: "Entrega",
      value: p.endDate ? formatoFecha(p.endDate) : <span className={styles.tenue}>Sin fecha</span>,
      hint: comoVa ? <span className={r.diasDeRetraso > 0 && !p.actualEndDate ? styles.vencido : undefined}>{comoVa}</span> : undefined,
    },
    { label: "Cliente", value: p.client?.name ?? <span className={styles.tenue}>Sin cliente</span> },
    {
      label: "Presupuesto",
      value: p.budgetAmount == null ? <span className={styles.tenue}>Sin capturar</span> : formatoMoneda(p.budgetAmount, p.currency ?? "MXN"),
      hint: p.cotizacion ? `Cotización ${p.cotizacion.folioEnviado || p.cotizacion.quoteNumber}` : undefined,
    },
    { label: "Equipo", value: `${p.members.length} persona${p.members.length === 1 ? "" : "s"}` },
  ];

  return (
    <>
      <RecordPage
        className={styles.pagina}
        breadcrumbs={[{ label: "Proyectos", href: "/erp/proyectos" }, { label: p.title }]}
        icon={<AccountTreeOutlinedIcon />}
        kind={p.projectType ? KIND_POR_TIPO[p.projectType] : undefined}
        statusLabel={ESTADO_PROYECTO_LABEL[p.status] ?? "Sin estado"}
        statusTone={toneDe(ESTADO_TONO[p.status])}
        badges={
          r.etiqueta !== ESTADO_PROYECTO_LABEL[p.status] ? (
            <Badge tone={toneDe(SALUD_TONO[r.salud])} dot title={r.motivo}>
              {r.etiqueta}
            </Badge>
          ) : null
        }
        title={p.title}
        person={p.responsable ? { name: p.responsable.nombre, role: "Responsable" } : undefined}
        meta={[
          ...(p.client?.name ? [{ icon: <BusinessOutlinedIcon fontSize="inherit" />, label: p.client.name }] : []),
          { icon: <CategoryOutlinedIcon fontSize="inherit" />, label: getServiceProjectTypeLabel(p.projectType) },
          ...(p.siteCount != null
            ? [{ icon: <PlaceOutlinedIcon fontSize="inherit" />, label: `${p.siteCount} sitio${p.siteCount === 1 ? "" : "s"}` }]
            : []),
        ]}
        primaryAction={
          acciones.length ? (
            <div className={styles.acciones} role="group" aria-label="Cambiar estado del proyecto">
              {acciones.map((a) => (
                <Button
                  key={a.hacia}
                  variant={a.peligro ? "danger-ghost" : esPrincipal(p, a) ? "primary" : "secondary"}
                  disabled={ocupado}
                  onClick={() => pedirCambio(a)}
                >
                  {a.etiqueta}
                </Button>
              ))}
            </div>
          ) : null
        }
        steps={pasosDe(p)}
        tabs={
          <div onKeyDown={teclaEnPestanas} className={styles.pestanas}>
            <Tabs<Pestana>
              ariaLabel="Secciones del proyecto"
              items={PESTANAS.map((t) => ({ id: t.id, label: t.titulo, count: conteoDe(p, t.id) }))}
              value={pestana}
              onChange={elegirPestana}
            />
          </div>
        }
        factsTitle="Datos clave"
        facts={datosClave}
      >
        {cambio ? (
          <div className={styles.estadoPanel} role="region" aria-label={cambio.accion.etiqueta} data-peligro={cambio.accion.peligro ? "true" : undefined}>
            {cambio.accion.pide === "motivo" ? (
              <Field
                label="¿Por qué se cancela el proyecto?"
                required
                error={errorCambio}
                hint="Queda guardado en el proyecto. Se puede reactivar después si hace falta."
              >
                <Textarea
                  id="motivo-cancelacion"
                  rows={3}
                  maxLength={500}
                  value={cambio.motivo}
                  onChange={(e) => setCambio({ ...cambio, motivo: e.target.value })}
                  placeholder="Ej. El cliente pospuso la obra para el próximo año."
                  autoFocus
                />
              </Field>
            ) : (
              <Field
                label="Fecha real de entrega"
                required
                error={errorCambio}
                hint={pendientesAlTerminar.length ? `Todavía queda: ${pendientesAlTerminar.join(", ")}.` : undefined}
              >
                <DateInput
                  id="fecha-entrega"
                  className={styles.fechaCorta}
                  value={cambio.fecha}
                  max={hoy}
                  onChange={(e) => setCambio({ ...cambio, fecha: e.target.value })}
                  autoFocus
                />
              </Field>
            )}
            <div className={styles.estadoAcciones}>
              <Button variant="tertiary" disabled={ocupado} onClick={() => setCambio(null)}>
                {cambio.accion.pide === "motivo" ? "No cancelar" : "Volver"}
              </Button>
              <Button variant={cambio.accion.peligro ? "danger" : "primary"} loading={ocupado} onClick={() => void confirmarCambio()}>
                {cambio.accion.etiqueta}
              </Button>
            </div>
          </div>
        ) : null}

        {errorCarga ? (
          <Alert tone="warning" action={<LinkButton onClick={() => void cargar()}>Reintentar</LinkButton>}>
            No se pudo actualizar el proyecto; ves la última versión cargada.
          </Alert>
        ) : null}
        {error ? (
          <Alert tone="danger" role="alert" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        ) : null}
        {aviso ? (
          <Alert tone="success" role="status">
            {aviso}
          </Alert>
        ) : null}

        <div role="tabpanel" aria-label={PESTANAS.find((t) => t.id === pestana)?.titulo}>
          {!seccion ? (
            <p className={styles.tenue}>Inicia sesión para ver el proyecto.</p>
          ) : pestana === "resumen" ? (
            <SeccionResumen {...seccion} />
          ) : pestana === "cronograma" ? (
            <SeccionCronograma {...seccion} />
          ) : pestana === "alcance" ? (
            <SeccionAlcance {...seccion} />
          ) : pestana === "requerimientos" ? (
            <SeccionRequerimientos {...seccion} />
          ) : pestana === "equipo" ? (
            <SeccionEquipo {...seccion} />
          ) : pestana === "documentos" ? (
            <SeccionDocumentos {...seccion} />
          ) : (
            <SeccionActividades {...seccion} />
          )}
        </div>
      </RecordPage>
      <ConfirmDialog state={confirmacion} onClose={() => setConfirmacion(null)} />
    </>
  );
}
