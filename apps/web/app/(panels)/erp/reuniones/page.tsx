"use client";

/**
 * NEXARA · Ritmo operativo
 * -------------------------
 * La diaria de las 10:00, la planeación del lunes, la revisión del miércoles y
 * la junta de cierre del viernes. Antes este pulso vivía fuera del ERP, así que
 * los acuerdos y las lecciones aprendidas no quedaban ligados a las actividades
 * de las que se hablaba.
 *
 * Quien conduce abre en **Reuniones**, con «Comenzar a grabar reunión»: un toque crea la junta y
 * graba; la IA toma notas mientras hablan y al «Concluir reunión» escribe la minuta completa (PDF)
 * con los acuerdos listos para caer como actividades de sus responsables.
 * El resto del personal abre en **Mis acuerdos**: lo que le toca, no el archivo de juntas.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import MetricStrip from "@/components/ui/MetricStrip";
import PanelTabs from "@/components/ui/PanelTabs";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import InlineAlert from "@/components/ui/InlineAlert";
import { Tag } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { toast } from "@/components/Toast";
import { formatApiError } from "@/lib/erp-api";
import { listUsers, type ApiUserRow } from "@/lib/users-api";
import { resolveV2RoleKey } from "@/lib/rbac";
import {
  AGREEMENT_KIND_LABEL,
  canLeadMeetings,
  AGREEMENT_STATUS_LABEL,
  MEETING_STATUS_LABEL,
  MEETING_TYPE_CADENCE,
  MEETING_TYPE_LABEL,
  MEETING_TYPES,
  addAgreement,
  closeMeeting,
  createMeeting,
  downloadMeetingPdf,
  formatMeetingDate,
  getMeeting,
  listLessons,
  listMeetings,
  listMyAgreements,
  listOverdueAgreements,
  setAttendance,
  suggestedTypeForToday,
  todayInput,
  updateAgreement,
  updateMeeting,
  updateMyAgreement,
  type Agreement,
  type AgreementKind,
  type AgreementStatus,
  type MeetingDetail,
  type MeetingRow,
  type MeetingType,
} from "@/lib/meetings-api";
import PersonalCalendar from "@/components/calendar/PersonalCalendar";
import ActaIA from "./ActaIA";
import GrabarReunion, { type SesionGrabacion } from "./GrabarReunion";
import { abrirMicrofono } from "@/lib/use-grabadora";
import { pedirPermisoMicrofono, usePermisoMicrofono } from "@/lib/use-permiso-microfono";
import PermisoMicrofono from "./PermisoMicrofono";
import s from "./reuniones.module.css";

type Tab = "mios" | "reuniones" | "agenda";

const TAB_IDS: Tab[] = ["mios", "reuniones", "agenda"];

type FiltroMios = "abiertos" | "fuera" | "todos-fuera";

const FILTROS_MIOS: Array<{ key: FiltroMios; label: string }> = [
  { key: "abiertos", label: "Abiertos" },
  { key: "fuera", label: "Míos tarde" },
  { key: "todos-fuera", label: "Todos fuera de fecha" },
];

/** Hora local `HH:MM` para la junta que empieza ya. */
const horaAhora = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const KIND_ICON: Record<AgreementKind, string> = {
  ACUERDO: "🤝",
  LECCION: "💡",
  RIESGO: "⚠️",
};

const STATUS_ACTION_LABEL: Record<AgreementStatus, string> = {
  PENDIENTE: "Marcar pendiente",
  EN_PROCESO: "Marcar en proceso",
  CUMPLIDO: "Marcar cumplido",
  CANCELADO: "Cancelar",
};

const MEETING_STATUS_VARIANT: Record<string, "positive" | "neutral" | "accent"> = {
  REALIZADA: "positive",
  CANCELADA: "neutral",
  PROGRAMADA: "accent",
};

const nuevaJuntaVacia = () => ({
  tipo: suggestedTypeForToday(),
  fecha: todayInput(),
  titulo: "",
  horaInicio: "",
  asistentes: [] as number[],
});

const acuerdoVacio = {
  tipo: "ACUERDO" as AgreementKind,
  descripcion: "",
  responsableId: "",
  fechaCompromiso: "",
  crearActividad: true,
};

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("es-MX")} ${n === 1 ? one : many}`;

function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className={s.list} aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => <div key={i} className={s.skeleton} />)}
    </div>
  );
}

export default function ReunionesPage() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const [mios, setMios] = useState<Agreement[]>([]);
  const [miosVencidos, setMiosVencidos] = useState(0);
  const [reuniones, setReuniones] = useState<MeetingRow[]>([]);
  const [vencidos, setVencidos] = useState<Agreement[] | null>(null);
  const [lecciones, setLecciones] = useState<Agreement[] | null>(null);
  const [busquedaLeccion, setBusquedaLeccion] = useState("");

  const [detalle, setDetalle] = useState<MeetingDetail | null>(null);
  const [detalleAbierto, setDetalleAbierto] = useState(false);
  const [detalleCargando, setDetalleCargando] = useState(false);
  const [bajandoPdf, setBajandoPdf] = useState<number | null>(null);

  const [personas, setPersonas] = useState<ApiUserRow[]>([]);
  const puedeConvocar = useMemo(() => canLeadMeetings(resolveV2RoleKey(user)), [user]);
  const [tabElegida, setTabElegida] = useState<Tab | null>(null);
  const tab: Tab = tabElegida ?? (puedeConvocar ? "reuniones" : "mios");
  const [filtroMios, setFiltroMios] = useState<FiltroMios>("abiertos");
  const [verLecciones, setVerLecciones] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    // Enlaces viejos: «vencidos» y «lecciones» eran pestañas; ahora son filtros.
    if (t === "vencidos") {
      setTabElegida("mios");
      setFiltroMios("todos-fuera");
    } else if (t === "lecciones") {
      setTabElegida("reuniones");
      setVerLecciones(true);
    } else if (t && (TAB_IDS as string[]).includes(t)) {
      setTabElegida(t as Tab);
    }
  }, []);

  const cambiarTab = useCallback((next: Tab) => {
    setTabElegida(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
  }, []);

  // ── Carga ───────────────────────────────────────────────────────────────

  const cargar = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [propios, juntas] = await Promise.all([listMyAgreements(token), listMeetings(token)]);
      setMios(propios?.acuerdos ?? []);
      setMiosVencidos(propios?.vencidos ?? 0);
      setReuniones(juntas);
      setLoaded(true);
    } catch (e) {
      setError(formatApiError(e, "No pudimos cargar tus reuniones y acuerdos."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /**
   * La lista de personas sólo hace falta para convocar y para asignar
   * responsables. Quien no conduce reuniones no puede listar usuarios, así que
   * ni se pide: un 403 en la consola no aporta nada.
   */
  useEffect(() => {
    if (!token || !puedeConvocar) return;
    let vivo = true;
    listUsers(token, { limit: 200 })
      .then((lista) => {
        if (vivo) setPersonas(lista.filter((u) => u.isActive !== false));
      })
      .catch(() => {
        /* Sin lista no se puede convocar con asistentes; el resto sigue usable. */
      });
    return () => {
      vivo = false;
    };
  }, [token, puedeConvocar]);

  useEffect(() => {
    if (!token) return;
    if (tab === "mios" && filtroMios === "todos-fuera" && vencidos === null) {
      listOverdueAgreements(token)
        .then((r) => setVencidos(r?.acuerdos ?? []))
        .catch((e) => {
          setVencidos([]);
          setError(formatApiError(e, "No pudimos cargar los acuerdos fuera de fecha."));
        });
    }
    if (tab === "reuniones" && verLecciones && lecciones === null) {
      listLessons(token)
        .then(setLecciones)
        .catch((e) => {
          setLecciones([]);
          setError(formatApiError(e, "No pudimos cargar las lecciones aprendidas."));
        });
    }
  }, [tab, filtroMios, verLecciones, token, vencidos, lecciones]);

  const abrirDetalle = async (id: number) => {
    if (!token) return;
    setDetalleAbierto(true);
    setDetalleCargando(true);
    try {
      setDetalle(await getMeeting(token, id));
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo abrir la reunión."));
      setDetalleAbierto(false);
    } finally {
      setDetalleCargando(false);
    }
  };

  const bajarPdf = async (id: number) => {
    if (!token || bajandoPdf) return;
    setBajandoPdf(id);
    try {
      await downloadMeetingPdf(token, id);
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo generar el acta en PDF."));
    } finally {
      setBajandoPdf(null);
    }
  };

  const cerrarDetalle = () => {
    setEditandoAsistentes(null);
    setEditandoTitulo(null);
    setDetalleAbierto(false);
    setDetalle(null);
    setNuevoAcuerdo(acuerdoVacio);
  };

  const refrescarDetalle = async () => {
    if (detalle) {
      try {
        setDetalle(await getMeeting(token, detalle.id));
      } catch {
        /* El detalle anterior sigue visible; la lista se refresca abajo. */
      }
    }
    await cargar();
  };

  // ── Convocar ────────────────────────────────────────────────────────────

  const [convocando, setConvocando] = useState(false);
  const [guardandoJunta, setGuardandoJunta] = useState(false);
  const [nueva, setNueva] = useState(nuevaJuntaVacia);
  const [filtroPersonas, setFiltroPersonas] = useState("");

  const personasVisibles = useMemo(() => {
    const q = filtroPersonas.trim().toLowerCase();
    return q ? personas.filter((p) => p.nombre.toLowerCase().includes(q)) : personas;
  }, [personas, filtroPersonas]);

  const convocar = async () => {
    if (!token) return;
    setGuardandoJunta(true);
    try {
      const creada = await createMeeting(token, {
        tipo: nueva.tipo,
        fecha: nueva.fecha,
        titulo: nueva.titulo.trim() || undefined,
        horaInicio: nueva.horaInicio.trim() || undefined,
        asistentes: nueva.asistentes.length ? nueva.asistentes : undefined,
      });
      toast.success("Reunión convocada");
      setConvocando(false);
      setNueva(nuevaJuntaVacia());
      setFiltroPersonas("");
      await cargar();
      cambiarTab("reuniones");
      await abrirDetalle(creada.id);
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo convocar la reunión."));
    } finally {
      setGuardandoJunta(false);
    }
  };

  /**
   * «Comenzar a grabar reunión»: pide el micrófono en el mismo toque (Safari lo exige), crea la
   * junta de hoy con la hora de ahora (título y asistentes se editan después) y graba. Con
   * `existente`, graba (o retoma) esa reunión.
   */
  const [empezando, setEmpezando] = useState(false);
  const [sesion, setSesion] = useState<SesionGrabacion | null>(null);
  type Existente = { id: number; titulo: string; baseMs?: number; baseParte?: number };

  // Permiso del micrófono como el de notificaciones: tarjeta antes de grabar si falta.
  const permisoMic = usePermisoMicrofono();
  const [tarjetaMic, setTarjetaMic] = useState<{ pendiente: Existente | null; grabar: boolean } | null>(null);
  const [micPospuesto, setMicPospuesto] = useState(false);
  useEffect(() => {
    if (!puedeConvocar || micPospuesto || tarjetaMic || sesion) return;
    if (permisoMic.estado === "prompt" || permisoMic.estado === "denied") setTarjetaMic({ pendiente: null, grabar: false });
  }, [permisoMic.estado, puedeConvocar, micPospuesto, tarjetaMic, sesion]);
  useEffect(() => {
    // Se permitió (desde la tarjeta o desde el candado del navegador): la tarjeta sobra.
    if (permisoMic.estado === "granted" && tarjetaMic && !tarjetaMic.grabar) setTarjetaMic(null);
  }, [permisoMic.estado, tarjetaMic]);

  const comenzarGrabacion = async (existente?: Existente, opciones: { desdeTarjeta?: boolean } = {}) => {
    if (!token || empezando) return;
    if (sesion) {
      toast.error("Ya hay una reunión grabándose: concluye esa primero.");
      return;
    }
    if (!opciones.desdeTarjeta && (permisoMic.estado === "prompt" || permisoMic.estado === "denied")) {
      setTarjetaMic({ pendiente: existente ?? null, grabar: true });
      return;
    }
    setEmpezando(true);
    const { stream, error: errorMic } = await abrirMicrofono();
    if (!stream) {
      setEmpezando(false);
      const estado = await permisoMic.reconsultar();
      if (estado === "denied") setTarjetaMic({ pendiente: existente ?? null, grabar: true });
      else toast.error(errorMic ?? "No se pudo abrir el micrófono.");
      return;
    }
    setTarjetaMic(null);
    try {
      const reunion =
        existente ??
        (await createMeeting(token, { tipo: suggestedTypeForToday(), fecha: todayInput(), horaInicio: horaAhora() }));
      setSesion({ meetingId: reunion.id, titulo: reunion.titulo, stream, baseMs: existente?.baseMs, baseParte: existente?.baseParte });
      cerrarDetalle();
      cambiarTab("reuniones");
      setVerLecciones(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
      void cargar();
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      toast.error(formatApiError(e, "No se pudo empezar la reunión."));
    } finally {
      setEmpezando(false);
    }
  };

  // ── Asistentes (se pueden marcar después de empezar) ────────────────────

  const [editandoTitulo, setEditandoTitulo] = useState<string | null>(null);
  const guardarTitulo = async () => {
    if (!token || !detalle || !editandoTitulo?.trim()) return;
    try {
      await updateMeeting(token, detalle.id, { titulo: editandoTitulo.trim() });
      setEditandoTitulo(null);
      await refrescarDetalle();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo cambiar el título."));
    }
  };

  const [editandoAsistentes, setEditandoAsistentes] = useState<number[] | null>(null);
  const [guardandoAsistentes, setGuardandoAsistentes] = useState(false);
  const guardarAsistentes = async () => {
    if (!token || !detalle || !editandoAsistentes) return;
    setGuardandoAsistentes(true);
    try {
      await setAttendance(token, detalle.id, editandoAsistentes.map((userId) => ({ userId, asistio: true })));
      setEditandoAsistentes(null);
      await refrescarDetalle();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudieron guardar los asistentes."));
    } finally {
      setGuardandoAsistentes(false);
    }
  };

  // ── Registrar acuerdo / lección / riesgo ────────────────────────────────

  const [nuevoAcuerdo, setNuevoAcuerdo] = useState(acuerdoVacio);
  const [guardandoAcuerdo, setGuardandoAcuerdo] = useState(false);

  const registrarAcuerdo = async () => {
    if (!token || !detalle) return;
    setGuardandoAcuerdo(true);
    try {
      const esAcuerdo = nuevoAcuerdo.tipo === "ACUERDO";
      const r = await addAgreement(token, detalle.id, {
        tipo: nuevoAcuerdo.tipo,
        descripcion: nuevoAcuerdo.descripcion,
        responsableId: nuevoAcuerdo.responsableId ? Number(nuevoAcuerdo.responsableId) : null,
        fechaCompromiso: nuevoAcuerdo.fechaCompromiso || null,
        crearActividad: esAcuerdo && Boolean(nuevoAcuerdo.responsableId) && nuevoAcuerdo.crearActividad,
      });
      if (r.avisoActividad) toast.error(r.avisoActividad);
      setNuevoAcuerdo(acuerdoVacio);
      setLecciones(null);
      await refrescarDetalle();
      toast.success(
        `${AGREEMENT_KIND_LABEL[nuevoAcuerdo.tipo]} registrado${r.activity?.id && nuevoAcuerdo.crearActividad ? " y asignado como actividad" : ""}`,
      );
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo registrar."));
    } finally {
      setGuardandoAcuerdo(false);
    }
  };

  const cambiarEstadoPropio = async (a: Agreement, estado: AgreementStatus) => {
    if (!token) return;
    try {
      await updateMyAgreement(token, a.id, estado);
      toast.success(`Acuerdo: ${AGREEMENT_STATUS_LABEL[estado].toLowerCase()}`);
      await cargar();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo actualizar el acuerdo."));
    }
  };

  const cambiarEstadoEnJunta = async (a: Agreement, estado: AgreementStatus) => {
    if (!token || !detalle) return;
    try {
      await updateAgreement(token, detalle.id, a.id, { estado });
      setVencidos(null);
      await refrescarDetalle();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo actualizar el acuerdo."));
    }
  };

  const [cerrandoJunta, setCerrandoJunta] = useState(false);
  const cerrarJunta = async () => {
    if (!token || !detalle) return;
    setCerrandoJunta(true);
    try {
      const cerrada = await closeMeeting(token, detalle.id, detalle.notas ?? undefined);
      setDetalle(cerrada);
      toast.success("Reunión marcada como realizada");
      await cargar();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo cerrar la reunión."));
    } finally {
      setCerrandoJunta(false);
    }
  };

  // ── Derivados ───────────────────────────────────────────────────────────

  const proximas = useMemo(() => reuniones.filter((r) => r.estado === "PROGRAMADA").length, [reuniones]);
  const miosVisibles = useMemo(() => (filtroMios === "fuera" ? mios.filter((a) => a.vencido) : mios), [mios, filtroMios]);

  const buscarLecciones = async () => {
    if (!token) return;
    try {
      setLecciones(await listLessons(token, busquedaLeccion));
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo buscar."));
    }
  };

  if (!token) {
    return <EmptyState title="Inicia sesión" description="Necesitas iniciar sesión para ver tus reuniones y acuerdos." />;
  }

  const primeraCarga = !loaded && loading;

  return (
    <>
      <PageHeader
        eyebrow="Hoy"
        title="Reuniones y acuerdos"
        subtitle="La diaria de las 10:00, la planeación del lunes, la revisión del miércoles y la junta de cierre del viernes."
        actions={
          puedeConvocar ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant="secondary" onClick={() => setConvocando(true)}>Programar</Button>
              <Button variant="primary" iconLeft="●" onClick={() => void comenzarGrabacion()} loading={empezando} disabled={Boolean(sesion)}>
                Comenzar a grabar reunión
              </Button>
            </div>
          ) : null
        }
      />

      {error && (
        <InlineAlert
          variant={loaded ? "warning" : "danger"}
          message={error}
          onDismiss={() => setError(null)}
          action={<Button size="sm" variant="secondary" onClick={() => void cargar()}>Reintentar</Button>}
        />
      )}

      {sesion ? (
        <GrabarReunion
          key={sesion.meetingId}
          token={token}
          sesion={sesion}
          onConcluida={(id) => {
            setSesion(null);
            void cargar();
            void abrirDetalle(id);
          }}
          onDescartar={() => {
            setSesion(null);
            void cargar();
          }}
        />
      ) : null}

      {loaded && (
        <div className={s.metrics}>
          <MetricStrip
            ariaLabel="Resumen de reuniones"
            metrics={[
              { label: "mis acuerdos abiertos", value: mios.length, onClick: () => cambiarTab("mios") },
              {
                label: "míos fuera de fecha",
                value: miosVencidos,
                tone: miosVencidos > 0 ? "danger" : "default",
                onClick: () => {
                  setFiltroMios("fuera");
                  cambiarTab("mios");
                },
              },
              { label: "reuniones programadas", value: proximas, onClick: () => cambiarTab("reuniones") },
              { label: "reuniones registradas", value: reuniones.length, onClick: () => cambiarTab("reuniones") },
            ]}
          />
        </div>
      )}

      <PanelTabs
        ariaLabel="Secciones de reuniones"
        value={tab}
        onChange={cambiarTab}
        tabs={[
          { key: "reuniones", label: "Reuniones" },
          { key: "mios", label: "Mis acuerdos", badge: miosVencidos > 0 ? `${miosVencidos} tarde` : mios.length || undefined },
          { key: "agenda", label: "Agenda" },
        ]}
      />

      {tab === "agenda" ? (
        <PersonalCalendar embedded />
      ) : tab === "mios" ? (
        <Section
          title={filtroMios === "todos-fuera" ? "Acuerdos fuera de fecha" : "Lo que me toca"}
          subtitle={
            filtroMios === "todos-fuera"
              ? "De todo el equipo: el tablero con el que arranca la junta de cierre."
              : "Acuerdos a tu nombre que siguen abiertos."
          }
          actions={
            <div className={s.chips} role="group" aria-label="Filtrar acuerdos">
              {FILTROS_MIOS.map((f) => (
                <Button
                  key={f.key}
                  size="sm"
                  variant={filtroMios === f.key ? "primary" : "ghost"}
                  aria-pressed={filtroMios === f.key}
                  onClick={() => setFiltroMios(f.key)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          }
        >
          {filtroMios === "todos-fuera" ? (
            vencidos === null ? (
              <SkeletonList />
            ) : vencidos.length === 0 ? (
              <EmptyState icon="🎯" title="Nada fuera de fecha" description="Todos los acuerdos van en tiempo." />
            ) : (
              <ListaAcuerdos acuerdos={vencidos} mostrarReunion mostrarResponsable />
            )
          ) : primeraCarga ? (
            <SkeletonList />
          ) : miosVisibles.length === 0 ? (
            <EmptyState
              icon="✅"
              title={filtroMios === "fuera" ? "Nada tarde" : "Nada pendiente"}
              description={filtroMios === "fuera" ? "Tus acuerdos van en tiempo." : "No tienes acuerdos abiertos a tu nombre."}
            />
          ) : (
            <ListaAcuerdos acuerdos={miosVisibles} mostrarReunion onEstado={cambiarEstadoPropio} estadosDisponibles={["EN_PROCESO", "CUMPLIDO"]} />
          )}
        </Section>
      ) : verLecciones ? (
        <Section
          title="Lecciones aprendidas"
          subtitle="Lo que se dijo el viernes y antes se olvidaba el lunes."
          actions={
            <form
              role="search"
              style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
              onSubmit={(e) => {
                e.preventDefault();
                void buscarLecciones();
              }}
            >
              <input
                className={s.input}
                type="search"
                aria-label="Buscar lecciones"
                value={busquedaLeccion}
                onChange={(e) => setBusquedaLeccion(e.target.value)}
                placeholder="Buscar lecciones…"
                style={{ width: 220, maxWidth: "100%" }}
              />
              <Button size="sm" variant="secondary" type="submit">Buscar</Button>
              <Button size="sm" variant="ghost" onClick={() => setVerLecciones(false)}>Ver reuniones</Button>
            </form>
          }
        >
          {lecciones === null ? (
            <SkeletonList />
          ) : lecciones.length === 0 ? (
            <EmptyState
              icon="💡"
              title={busquedaLeccion ? "Sin coincidencias" : "Sin lecciones registradas"}
              description={
                busquedaLeccion
                  ? "Prueba con otras palabras."
                  : "En la junta de cierre, registra lo aprendido: queda escrito y ligado al servicio del que salió."
              }
            />
          ) : (
            <ListaAcuerdos acuerdos={lecciones} mostrarReunion />
          )}
        </Section>
      ) : (
        <Section
          title="Reuniones"
          subtitle="De la más reciente a la más antigua. Cada una baja su acta en PDF."
          actions={<Button size="sm" variant="ghost" onClick={() => setVerLecciones(true)}>💡 Lecciones aprendidas</Button>}
        >
          {primeraCarga ? (
            <SkeletonList />
          ) : reuniones.length === 0 ? (
            <EmptyState
              icon="📅"
              title="Todavía no hay reuniones"
              description={
                puedeConvocar
                  ? "Toca «Comenzar a grabar reunión»: la IA toma notas mientras hablan y al concluir escribe la minuta en PDF."
                  : "Aquí verás las juntas a las que te convoquen."
              }
              action={
                puedeConvocar ? (
                  <Button variant="primary" onClick={() => void comenzarGrabacion()} loading={empezando} disabled={Boolean(sesion)}>
                    Comenzar a grabar reunión
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className={s.list}>
              {reuniones.map((r) => (
                <li key={r.id} className={s.meetingRow}>
                  <button type="button" className={s.meeting} onClick={() => void abrirDetalle(r.id)}>
                    <span className={s.meetingIcon} aria-hidden="true">📅</span>
                    <span style={{ minWidth: 0 }}>
                      <span className={s.meetingTitle}>{r.titulo}</span>
                      <span className={s.meetingMeta}>
                        {MEETING_TYPE_LABEL[r.tipo]} · {formatMeetingDate(r.fecha)}
                        {r.horaInicio ? ` · ${r.horaInicio}` : ""}
                        {r.facilitador ? ` · ${r.facilitador.nombre}` : ""}
                      </span>
                    </span>
                    <span className={s.meetingSide}>
                      <Tag variant={MEETING_STATUS_VARIANT[r.estado] ?? "neutral"}>{MEETING_STATUS_LABEL[r.estado]}</Tag>
                      <span className={s.count}>
                        {plural(r.acuerdos, "acuerdo", "acuerdos")} · {plural(r.asistentes, "persona", "personas")}
                      </span>
                    </span>
                  </button>
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={`Descargar acta en PDF: ${r.titulo}`}
                    loading={bajandoPdf === r.id}
                    onClick={() => void bajarPdf(r.id)}
                  >
                    PDF
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* ── Convocar ─────────────────────────────────────────────────── */}
      <Modal
        open={convocando}
        onClose={() => setConvocando(false)}
        title="Convocar reunión"
        maxWidth={560}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConvocando(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => void convocar()} loading={guardandoJunta} disabled={!nueva.fecha}>
              Convocar
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 14 }}>
          <label>
            <span className={s.fieldLabel}>Tipo de reunión</span>
            <select className={s.input} value={nueva.tipo} onChange={(e) => setNueva({ ...nueva, tipo: e.target.value as MeetingType })}>
              {MEETING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MEETING_TYPE_LABEL[t]} — {MEETING_TYPE_CADENCE[t]}
                </option>
              ))}
            </select>
            <p className={s.hint}>Si dejas en blanco el título o la hora, se toman del tipo de reunión junto con la agenda.</p>
          </label>

          <div className={s.row2}>
            <label>
              <span className={s.fieldLabel}>Fecha</span>
              <input className={s.input} type="date" value={nueva.fecha} onChange={(e) => setNueva({ ...nueva, fecha: e.target.value })} />
            </label>
            <label>
              <span className={s.fieldLabel}>Hora · opcional</span>
              <input className={s.input} type="time" value={nueva.horaInicio} onChange={(e) => setNueva({ ...nueva, horaInicio: e.target.value })} />
            </label>
          </div>

          <label>
            <span className={s.fieldLabel}>Título · opcional</span>
            <input className={s.input} value={nueva.titulo} onChange={(e) => setNueva({ ...nueva, titulo: e.target.value })} placeholder={MEETING_TYPE_LABEL[nueva.tipo]} />
          </label>

          {personas.length > 0 && (
            <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
              <legend className={s.fieldLabel}>
                Convocados · {nueva.asistentes.length} {nueva.asistentes.length === 1 ? "persona" : "personas"}
              </legend>
              <input
                className={s.input}
                type="search"
                aria-label="Buscar persona"
                placeholder="Buscar persona…"
                value={filtroPersonas}
                onChange={(e) => setFiltroPersonas(e.target.value)}
              />
              <div className={s.people}>
                {personasVisibles.length === 0 ? (
                  <p className={s.hint} style={{ padding: 8 }}>Nadie coincide con la búsqueda.</p>
                ) : (
                  personasVisibles.map((p) => (
                    <label key={p.id} className={s.person}>
                      <input
                        type="checkbox"
                        checked={nueva.asistentes.includes(p.id)}
                        onChange={(e) =>
                          setNueva({
                            ...nueva,
                            asistentes: e.target.checked ? [...nueva.asistentes, p.id] : nueva.asistentes.filter((x) => x !== p.id),
                          })
                        }
                      />
                      {p.nombre}
                    </label>
                  ))
                )}
              </div>
            </fieldset>
          )}
        </div>
      </Modal>

      {/* ── Detalle de reunión ───────────────────────────────────────── */}
      <Modal
        open={detalleAbierto}
        onClose={cerrarDetalle}
        title={detalle?.titulo ?? "Reunión"}
        maxWidth={720}
        footer={
          <>
            <Button variant="secondary" onClick={cerrarDetalle}>Cerrar</Button>
            {detalle && (
              <Button variant="secondary" loading={bajandoPdf === detalle.id} onClick={() => void bajarPdf(detalle.id)}>
                Descargar acta (PDF)
              </Button>
            )}
            {detalle?.estado === "PROGRAMADA" && (
              <Button variant="primary" onClick={() => void cerrarJunta()} loading={cerrandoJunta}>
                Marcar como realizada
              </Button>
            )}
          </>
        }
      >
        {detalleCargando || !detalle ? (
          <SkeletonList rows={3} />
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>
              {MEETING_TYPE_LABEL[detalle.tipo]} · {formatMeetingDate(detalle.fecha)}
              {detalle.horaInicio ? ` · ${detalle.horaInicio}` : ""}
              {detalle.facilitador ? ` · conduce ${detalle.facilitador.nombre}` : ""}
              {puedeConvocar && editandoTitulo === null ? (
                <>
                  {" · "}
                  <Button size="xs" variant="link" onClick={() => setEditandoTitulo(detalle.titulo)}>
                    Editar título
                  </Button>
                </>
              ) : null}
            </p>

            {editandoTitulo !== null ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  className={s.input}
                  style={{ flex: "1 1 280px" }}
                  aria-label="Título de la reunión"
                  value={editandoTitulo}
                  maxLength={200}
                  onChange={(e) => setEditandoTitulo(e.target.value)}
                />
                <Button size="sm" variant="primary" onClick={() => void guardarTitulo()} disabled={!editandoTitulo.trim()}>
                  Guardar
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setEditandoTitulo(null)}>
                  Cancelar
                </Button>
              </div>
            ) : null}

            {detalle.agenda && (
              <div>
                <span className={s.fieldLabel}>Agenda</span>
                <pre className={s.agenda}>{detalle.agenda}</pre>
              </div>
            )}

            {detalle.notas && (
              <div>
                <span className={s.fieldLabel}>Minuta</span>
                <pre className={s.agenda}>{detalle.notas}</pre>
              </div>
            )}

            {puedeConvocar && (
              <div>
                <span className={s.fieldLabel}>
                  Asistentes · {detalle.asistentes.length}{" "}
                  {editandoAsistentes === null && personas.length > 0 ? (
                    <Button size="xs" variant="link" onClick={() => setEditandoAsistentes(detalle.asistentes.map((a) => a.userId))}>
                      {detalle.asistentes.length ? "Editar" : "Agregar"}
                    </Button>
                  ) : null}
                </span>
                {editandoAsistentes === null ? (
                  <p className={s.hint} style={{ margin: 0 }}>
                    {detalle.asistentes.length
                      ? detalle.asistentes.map((a) => a.user?.nombre).filter(Boolean).join(" · ")
                      : "Sin asistentes registrados. Agrégalos para enviarles la minuta."}
                  </p>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    <div className={s.people}>
                      {personas.map((p) => (
                        <label key={p.id} className={s.person}>
                          <input
                            type="checkbox"
                            checked={editandoAsistentes.includes(p.id)}
                            onChange={(e) =>
                              setEditandoAsistentes((prev) =>
                                prev ? (e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id)) : prev,
                              )
                            }
                          />
                          {p.nombre}
                        </label>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button size="sm" variant="primary" onClick={() => void guardarAsistentes()} loading={guardandoAsistentes}>
                        Guardar asistentes
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditandoAsistentes(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Grabar y la minuta con IA: solo encargados de área (Adam, 12-10). */}
            {puedeConvocar && detalle.estado !== "CANCELADA" && sesion?.meetingId !== detalle.id && (
              <ActaIA
                key={detalle.id}
                token={token}
                meetingId={detalle.id}
                personas={personas}
                onGrabar={(base) => void comenzarGrabacion({ id: detalle.id, titulo: detalle.titulo, ...base })}
                onGuardada={refrescarDetalle}
              />
            )}

            <div>
              <span className={s.fieldLabel}>Acuerdos, lecciones y riesgos · {detalle.acuerdos.length}</span>
              {detalle.acuerdos.length === 0 ? (
                <p className={s.hint}>Todavía no se registró nada de esta reunión.</p>
              ) : (
                <ListaAcuerdos
                  acuerdos={detalle.acuerdos}
                  mostrarResponsable
                  onEstado={cambiarEstadoEnJunta}
                  estadosDisponibles={["EN_PROCESO", "CUMPLIDO", "CANCELADO"]}
                />
              )}
            </div>

            <div className={s.divider}>
              <span className={s.fieldLabel} style={{ marginBottom: 0 }}>Registrar algo nuevo</span>
              <div className={s.rowKind}>
                <select
                  className={s.input}
                  aria-label="Tipo de registro"
                  value={nuevoAcuerdo.tipo}
                  onChange={(e) => setNuevoAcuerdo({ ...nuevoAcuerdo, tipo: e.target.value as AgreementKind })}
                >
                  {(Object.keys(AGREEMENT_KIND_LABEL) as AgreementKind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_ICON[k]} {AGREEMENT_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
                <input
                  className={s.input}
                  aria-label="Descripción"
                  value={nuevoAcuerdo.descripcion}
                  onChange={(e) => setNuevoAcuerdo({ ...nuevoAcuerdo, descripcion: e.target.value })}
                  placeholder={
                    nuevoAcuerdo.tipo === "ACUERDO" ? "Qué se acordó hacer" : nuevoAcuerdo.tipo === "LECCION" ? "Qué aprendimos" : "Qué riesgo detectamos"
                  }
                />
              </div>

              {nuevoAcuerdo.tipo === "ACUERDO" && (
                <>
                  <div className={s.rowOwner}>
                    <select
                      className={s.input}
                      aria-label="Responsable"
                      value={nuevoAcuerdo.responsableId}
                      onChange={(e) => setNuevoAcuerdo({ ...nuevoAcuerdo, responsableId: e.target.value })}
                    >
                      <option value="">Responsable…</option>
                      {personas.map((p) => (
                        <option key={p.id} value={p.id}>{p.nombre}</option>
                      ))}
                    </select>
                    <input
                      className={s.input}
                      type="date"
                      aria-label="Fecha compromiso"
                      value={nuevoAcuerdo.fechaCompromiso}
                      onChange={(e) => setNuevoAcuerdo({ ...nuevoAcuerdo, fechaCompromiso: e.target.value })}
                    />
                  </div>
                  <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={nuevoAcuerdo.crearActividad}
                      onChange={(e) => setNuevoAcuerdo({ ...nuevoAcuerdo, crearActividad: e.target.checked })}
                    />
                    Asignarlo como actividad al responsable
                  </label>
                  <p className={s.hint} style={{ margin: 0 }}>
                    Un acuerdo necesita responsable. Una lección o un riesgo no: son conocimiento, no tarea.
                  </p>
                </>
              )}

              <div>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => void registrarAcuerdo()}
                  loading={guardandoAcuerdo}
                  disabled={!nuevoAcuerdo.descripcion.trim()}
                >
                  Registrar
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {tarjetaMic && (permisoMic.estado === "prompt" || permisoMic.estado === "denied") ? (
        <PermisoMicrofono
          estado={permisoMic.estado}
          onPermitir={async () => {
            if (tarjetaMic.grabar) {
              await comenzarGrabacion(tarjetaMic.pendiente ?? undefined, { desdeTarjeta: true });
            } else {
              const ok = await pedirPermisoMicrofono();
              const estado = await permisoMic.reconsultar();
              if (ok || estado === "granted") setTarjetaMic(null);
            }
          }}
          onReconsultar={async () => {
            const estado = await permisoMic.reconsultar();
            if (estado === "granted") {
              const pendiente = tarjetaMic.grabar ? tarjetaMic : null;
              setTarjetaMic(null);
              if (pendiente) await comenzarGrabacion(pendiente.pendiente ?? undefined, { desdeTarjeta: true });
            } else {
              toast.error("El navegador sigue bloqueando el micrófono. Revisa el candado junto a la dirección y recarga.");
            }
          }}
          onCerrar={() => {
            setTarjetaMic(null);
            setMicPospuesto(true);
          }}
        />
      ) : null}
    </>
  );
}

// ── Piezas ────────────────────────────────────────────────────────────────

function ListaAcuerdos({
  acuerdos,
  mostrarReunion = false,
  mostrarResponsable = false,
  onEstado,
  estadosDisponibles = [],
}: {
  acuerdos: Agreement[];
  mostrarReunion?: boolean;
  mostrarResponsable?: boolean;
  onEstado?: (a: Agreement, estado: AgreementStatus) => void;
  estadosDisponibles?: AgreementStatus[];
}) {
  return (
    <ul className={s.list}>
      {acuerdos.map((a) => (
        <li key={a.id} className={`${s.item} ${a.vencido ? s.itemLate : ""}`}>
          <span className={s.itemIcon} aria-label={AGREEMENT_KIND_LABEL[a.tipo]} role="img">{KIND_ICON[a.tipo]}</span>

          <div style={{ minWidth: 0 }}>
            <p className={s.itemText}>{a.descripcion}</p>
            <div className={s.itemMeta}>
              {mostrarResponsable && a.responsable && <span>👤 {a.responsable.nombre}</span>}
              {a.fechaCompromiso && <span>📆 Para el {formatMeetingDate(a.fechaCompromiso)}</span>}
              {a.activity && <span>🔧 {a.activity.anNumber} · {a.activity.titulo}</span>}
              {mostrarReunion && a.meeting && <span>📅 {a.meeting.titulo} · {formatMeetingDate(a.meeting.fecha)}</span>}
            </div>
          </div>

          <div className={s.itemSide}>
            {a.vencido && <Tag variant="danger">{a.diasVencido === 1 ? "1 día tarde" : `${a.diasVencido} días tarde`}</Tag>}
            {a.tipo === "ACUERDO" && (
              <Tag variant={a.estado === "CUMPLIDO" ? "positive" : a.estado === "CANCELADO" ? "neutral" : "accent"}>
                {AGREEMENT_STATUS_LABEL[a.estado]}
              </Tag>
            )}
            {onEstado &&
              estadosDisponibles
                .filter((e) => e !== a.estado)
                .map((e) => (
                  <Button key={e} size="sm" variant="ghost" onClick={() => onEstado(a, e)}>
                    {STATUS_ACTION_LABEL[e]}
                  </Button>
                ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
