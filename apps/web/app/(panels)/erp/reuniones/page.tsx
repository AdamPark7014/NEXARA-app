"use client";

/**
 * NEXARA · Ritmo operativo
 * -------------------------
 * La diaria de las 10:00, la planeación del lunes, la revisión del miércoles y
 * la junta de cierre del viernes. Antes este pulso vivía fuera del ERP, así que
 * los acuerdos y las lecciones aprendidas no quedaban ligados a las actividades
 * de las que se hablaba.
 *
 * La pantalla abre en **Mis acuerdos**, no en el listado de reuniones: lo que
 * cada persona necesita al entrar es qué le toca, no el archivo de juntas.
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
  formatMeetingDate,
  getMeeting,
  listLessons,
  listMeetings,
  listMyAgreements,
  listOverdueAgreements,
  suggestedTypeForToday,
  todayInput,
  updateAgreement,
  updateMyAgreement,
  type Agreement,
  type AgreementKind,
  type AgreementStatus,
  type MeetingDetail,
  type MeetingRow,
  type MeetingType,
} from "@/lib/meetings-api";
import PersonalCalendar from "@/components/calendar/PersonalCalendar";
import s from "./reuniones.module.css";

type Tab = "mios" | "reuniones" | "vencidos" | "lecciones" | "agenda";

const TAB_IDS: Tab[] = ["mios", "reuniones", "agenda", "vencidos", "lecciones"];

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

const acuerdoVacio = { tipo: "ACUERDO" as AgreementKind, descripcion: "", responsableId: "", fechaCompromiso: "" };

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

  const [tab, setTab] = useState<Tab>("mios");
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

  const [personas, setPersonas] = useState<ApiUserRow[]>([]);
  const puedeConvocar = useMemo(() => canLeadMeetings(resolveV2RoleKey(user)), [user]);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t && TAB_IDS.includes(t)) setTab(t);
  }, []);

  const cambiarTab = useCallback((next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "mios") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
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
    if (tab === "vencidos" && vencidos === null) {
      listOverdueAgreements(token)
        .then((r) => setVencidos(r?.acuerdos ?? []))
        .catch((e) => {
          setVencidos([]);
          setError(formatApiError(e, "No pudimos cargar los acuerdos fuera de fecha."));
        });
    }
    if (tab === "lecciones" && lecciones === null) {
      listLessons(token)
        .then(setLecciones)
        .catch((e) => {
          setLecciones([]);
          setError(formatApiError(e, "No pudimos cargar las lecciones aprendidas."));
        });
    }
  }, [tab, token, vencidos, lecciones]);

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

  const cerrarDetalle = () => {
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

  // ── Registrar acuerdo / lección / riesgo ────────────────────────────────

  const [nuevoAcuerdo, setNuevoAcuerdo] = useState(acuerdoVacio);
  const [guardandoAcuerdo, setGuardandoAcuerdo] = useState(false);

  const registrarAcuerdo = async () => {
    if (!token || !detalle) return;
    setGuardandoAcuerdo(true);
    try {
      await addAgreement(token, detalle.id, {
        tipo: nuevoAcuerdo.tipo,
        descripcion: nuevoAcuerdo.descripcion,
        responsableId: nuevoAcuerdo.responsableId ? Number(nuevoAcuerdo.responsableId) : null,
        fechaCompromiso: nuevoAcuerdo.fechaCompromiso || null,
      });
      setNuevoAcuerdo(acuerdoVacio);
      setLecciones(null);
      await refrescarDetalle();
      toast.success(`${AGREEMENT_KIND_LABEL[nuevoAcuerdo.tipo]} registrado`);
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
        actions={puedeConvocar ? <Button variant="primary" iconLeft="＋" onClick={() => setConvocando(true)}>Convocar reunión</Button> : null}
      />

      {error && (
        <InlineAlert
          variant={loaded ? "warning" : "danger"}
          message={error}
          onDismiss={() => setError(null)}
          action={<Button size="sm" variant="secondary" onClick={() => void cargar()}>Reintentar</Button>}
        />
      )}

      {loaded && (
        <div className={s.metrics}>
          <MetricStrip
            ariaLabel="Resumen de reuniones"
            metrics={[
              { label: "mis acuerdos abiertos", value: mios.length, onClick: () => cambiarTab("mios") },
              { label: "míos fuera de fecha", value: miosVencidos, tone: miosVencidos > 0 ? "danger" : "default", onClick: () => cambiarTab("mios") },
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
          { key: "mios", label: "Mis acuerdos", badge: miosVencidos > 0 ? `${miosVencidos} tarde` : mios.length || undefined },
          { key: "reuniones", label: "Reuniones" },
          { key: "agenda", label: "Agenda" },
          { key: "vencidos", label: "Fuera de fecha" },
          { key: "lecciones", label: "Lecciones aprendidas" },
        ]}
      />

      {tab === "agenda" ? (
        <PersonalCalendar embedded />
      ) : tab === "mios" ? (
        <Section title="Lo que me toca" subtitle="Acuerdos a tu nombre que siguen abiertos.">
          {primeraCarga ? (
            <SkeletonList />
          ) : mios.length === 0 ? (
            <EmptyState icon="✅" title="Nada pendiente" description="No tienes acuerdos abiertos a tu nombre." />
          ) : (
            <ListaAcuerdos acuerdos={mios} mostrarReunion onEstado={cambiarEstadoPropio} estadosDisponibles={["EN_PROCESO", "CUMPLIDO"]} />
          )}
        </Section>
      ) : tab === "reuniones" ? (
        <Section title="Reuniones" subtitle="De la más reciente a la más antigua.">
          {primeraCarga ? (
            <SkeletonList />
          ) : reuniones.length === 0 ? (
            <EmptyState
              icon="📅"
              title="Todavía no hay reuniones"
              description="Convoca la primera: la agenda se genera sola según el tipo."
              action={puedeConvocar ? <Button variant="primary" onClick={() => setConvocando(true)}>Convocar reunión</Button> : undefined}
            />
          ) : (
            <ul className={s.list}>
              {reuniones.map((r) => (
                <li key={r.id}>
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
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : tab === "vencidos" ? (
        <Section title="Acuerdos fuera de fecha" subtitle="El tablero con el que arranca la junta de cierre.">
          {vencidos === null ? (
            <SkeletonList />
          ) : vencidos.length === 0 ? (
            <EmptyState icon="🎯" title="Nada fuera de fecha" description="Todos los acuerdos van en tiempo." />
          ) : (
            <ListaAcuerdos acuerdos={vencidos} mostrarReunion mostrarResponsable />
          )}
        </Section>
      ) : (
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
            </p>

            {detalle.agenda && (
              <div>
                <span className={s.fieldLabel}>Agenda</span>
                <pre className={s.agenda}>{detalle.agenda}</pre>
              </div>
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
