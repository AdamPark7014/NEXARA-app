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
import KpiCard from "@/components/ui/KpiCard";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import InlineAlert from "@/components/ui/InlineAlert";
import { useUser } from "@/components/UserContext";
import { toast } from "@/components/Toast";
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

type Tab = "mios" | "reuniones" | "vencidos" | "lecciones";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "mios", label: "Mis acuerdos" },
  { id: "reuniones", label: "Reuniones" },
  { id: "vencidos", label: "Vencidos" },
  { id: "lecciones", label: "Lecciones aprendidas" },
];

const KIND_ICON: Record<AgreementKind, string> = {
  ACUERDO: "🤝",
  LECCION: "💡",
  RIESGO: "⚠️",
};

const inp: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--surface)",
  color: "var(--foreground)",
  fontSize: 13,
  boxSizing: "border-box",
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: 11.5,
  fontWeight: 600,
  color: "var(--muted-foreground)",
  marginBottom: 4,
};

export default function ReunionesPage() {
  const { user } = useUser();
  const token = user?.token ?? "";

  const [tab, setTab] = useState<Tab>("mios");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [mios, setMios] = useState<Agreement[]>([]);
  const [miosVencidos, setMiosVencidos] = useState(0);
  const [reuniones, setReuniones] = useState<MeetingRow[]>([]);
  const [vencidos, setVencidos] = useState<Agreement[]>([]);
  const [lecciones, setLecciones] = useState<Agreement[]>([]);
  const [busquedaLeccion, setBusquedaLeccion] = useState("");

  const [detalle, setDetalle] = useState<MeetingDetail | null>(null);
  const [detalleCargando, setDetalleCargando] = useState(false);

  const [personas, setPersonas] = useState<ApiUserRow[]>([]);
  const puedeConvocar = useMemo(() => canLeadMeetings(resolveV2RoleKey(user)), [user]);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el ritmo operativo");
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
    if (tab === "vencidos" && vencidos.length === 0) {
      listOverdueAgreements(token)
        .then((r) => setVencidos(r?.acuerdos ?? []))
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }
    if (tab === "lecciones" && lecciones.length === 0) {
      listLessons(token)
        .then(setLecciones)
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }
    // Sólo al cambiar de pestaña: recargar en cada render pediría lo mismo sin parar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, token]);

  const abrirDetalle = async (id: number) => {
    if (!token) return;
    setDetalleCargando(true);
    try {
      setDetalle(await getMeeting(token, id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo abrir la reunión");
    } finally {
      setDetalleCargando(false);
    }
  };

  const refrescarDetalle = async () => {
    if (detalle) await abrirDetalle(detalle.id);
    await cargar();
  };

  // ── Convocar ────────────────────────────────────────────────────────────

  const [convocando, setConvocando] = useState(false);
  const [guardandoJunta, setGuardandoJunta] = useState(false);
  const [nueva, setNueva] = useState<{
    tipo: MeetingType;
    fecha: string;
    titulo: string;
    horaInicio: string;
    asistentes: number[];
  }>({ tipo: suggestedTypeForToday(), fecha: todayInput(), titulo: "", horaInicio: "", asistentes: [] });

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
      setNueva({
        tipo: suggestedTypeForToday(),
        fecha: todayInput(),
        titulo: "",
        horaInicio: "",
        asistentes: [],
      });
      await cargar();
      setTab("reuniones");
      await abrirDetalle(creada.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo convocar");
    } finally {
      setGuardandoJunta(false);
    }
  };

  // ── Registrar acuerdo / lección / riesgo ────────────────────────────────

  const [nuevoAcuerdo, setNuevoAcuerdo] = useState<{
    tipo: AgreementKind;
    descripcion: string;
    responsableId: string;
    fechaCompromiso: string;
  }>({ tipo: "ACUERDO", descripcion: "", responsableId: "", fechaCompromiso: "" });
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
      setNuevoAcuerdo({ tipo: "ACUERDO", descripcion: "", responsableId: "", fechaCompromiso: "" });
      setLecciones([]);
      await refrescarDetalle();
      toast.success("Registrado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar");
    } finally {
      setGuardandoAcuerdo(false);
    }
  };

  const cambiarEstadoPropio = async (a: Agreement, estado: AgreementStatus) => {
    if (!token) return;
    try {
      await updateMyAgreement(token, a.id, estado);
      toast.success(AGREEMENT_STATUS_LABEL[estado]);
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
    }
  };

  const cambiarEstadoEnJunta = async (a: Agreement, estado: AgreementStatus) => {
    if (!token || !detalle) return;
    try {
      await updateAgreement(token, detalle.id, a.id, { estado });
      await refrescarDetalle();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
    }
  };

  const cerrarJunta = async () => {
    if (!token || !detalle) return;
    try {
      const cerrada = await closeMeeting(token, detalle.id, detalle.notas ?? undefined);
      setDetalle(cerrada);
      toast.success("Junta cerrada");
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cerrar");
    }
  };

  // ── Derivados ───────────────────────────────────────────────────────────

  const proximas = useMemo(
    () => reuniones.filter((r) => r.estado === "PROGRAMADA").length,
    [reuniones],
  );

  const buscarLecciones = async () => {
    if (!token) return;
    try {
      setLecciones(await listLessons(token, busquedaLeccion));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo buscar");
    }
  };

  if (!token) {
    return <EmptyState title="Sesión requerida" description="Inicia sesión para ver el ritmo operativo." />;
  }

  return (
    <>
      <PageHeader
        eyebrow="Ritmo operativo"
        title="Reuniones y acuerdos"
        subtitle="La diaria de las 10:00, la planeación del lunes, la revisión del miércoles y la junta de cierre del viernes."
        actions={
          puedeConvocar ? (
            <Button onClick={() => setConvocando(true)}>Convocar reunión</Button>
          ) : null
        }
      />

      {error && <InlineAlert message={error} onDismiss={() => setError(null)} />}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", marginBottom: 20 }}>
        <KpiCard label="Acuerdos míos abiertos" value={mios.length} icon="🤝" />
        <KpiCard
          label="Míos fuera de fecha"
          value={miosVencidos}
          icon="⏰"
          variant={miosVencidos > 0 ? "danger" : "default"}
        />
        <KpiCard label="Reuniones programadas" value={proximas} icon="📅" />
        <KpiCard label="Reuniones registradas" value={reuniones.length} icon="🗂️" />
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {TABS.map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant={tab === t.id ? "primary" : "secondary"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === "mios" && miosVencidos > 0 ? ` · ${miosVencidos} tarde` : ""}
          </Button>
        ))}
      </div>

      {loading ? (
        <Section title="Cargando…">
          <p style={{ color: "var(--muted-foreground)", fontSize: 13 }}>Un momento.</p>
        </Section>
      ) : tab === "mios" ? (
        <Section
          title="Lo que me toca"
          subtitle="Acuerdos en los que soy responsable y siguen abiertos."
        >
          {mios.length === 0 ? (
            <EmptyState
              icon="✅"
              title="Nada pendiente"
              description="No tienes acuerdos abiertos a tu nombre."
            />
          ) : (
            <ListaAcuerdos
              acuerdos={mios}
              mostrarReunion
              onEstado={cambiarEstadoPropio}
              estadosDisponibles={["EN_PROCESO", "CUMPLIDO"]}
            />
          )}
        </Section>
      ) : tab === "reuniones" ? (
        <Section title="Reuniones" subtitle="Las últimas 200, de la más reciente a la más antigua.">
          {reuniones.length === 0 ? (
            <EmptyState
              icon="📅"
              title="Todavía no hay reuniones"
              description="Convoca la primera y la agenda se genera sola según el tipo."
            />
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {reuniones.map((r) => (
                <button
                  key={r.id}
                  onClick={() => abrirDetalle(r.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    background: "var(--surface)",
                    color: "var(--foreground)",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 18 }}>📅</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 600, fontSize: 13.5 }}>{r.titulo}</span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--muted-foreground)" }}>
                      {MEETING_TYPE_LABEL[r.tipo]} · {formatMeetingDate(r.fecha)}
                      {r.horaInicio ? ` · ${r.horaInicio}` : ""}
                      {r.facilitador ? ` · ${r.facilitador.nombre}` : ""}
                    </span>
                  </span>
                  <Pill tone={r.estado === "REALIZADA" ? "ok" : r.estado === "CANCELADA" ? "off" : "info"}>
                    {MEETING_STATUS_LABEL[r.estado]}
                  </Pill>
                  <span style={{ fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
                    {r.acuerdos} acuerdos · {r.asistentes} personas
                  </span>
                </button>
              ))}
            </div>
          )}
        </Section>
      ) : tab === "vencidos" ? (
        <Section
          title="Acuerdos fuera de fecha"
          subtitle="El tablero con el que arranca la junta de cierre."
        >
          {vencidos.length === 0 ? (
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
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={busquedaLeccion}
                onChange={(e) => setBusquedaLeccion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && buscarLecciones()}
                placeholder="Buscar…"
                style={{ ...inp, width: 200 }}
              />
              <Button size="sm" variant="secondary" onClick={buscarLecciones}>
                Buscar
              </Button>
            </div>
          }
        >
          {lecciones.length === 0 ? (
            <EmptyState
              icon="💡"
              title="Sin lecciones registradas"
              description="En la junta de cierre, registra lo aprendido: queda escrito y ligado al servicio del que salió."
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
            <Button variant="secondary" onClick={() => setConvocando(false)}>
              Cancelar
            </Button>
            <Button onClick={convocar} loading={guardandoJunta} disabled={!nueva.fecha}>
              Convocar
            </Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <span style={label}>Tipo</span>
            <select
              value={nueva.tipo}
              onChange={(e) => setNueva({ ...nueva, tipo: e.target.value as MeetingType })}
              style={inp}
            >
              {MEETING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MEETING_TYPE_LABEL[t]} — {MEETING_TYPE_CADENCE[t]}
                </option>
              ))}
            </select>
            <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 5 }}>
              El título, la hora y la agenda se generan del tipo si los dejas en blanco.
            </p>
          </div>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <span style={label}>Fecha</span>
              <input
                type="date"
                value={nueva.fecha}
                onChange={(e) => setNueva({ ...nueva, fecha: e.target.value })}
                style={inp}
              />
            </div>
            <div>
              <span style={label}>Hora (opcional)</span>
              <input
                type="time"
                value={nueva.horaInicio}
                onChange={(e) => setNueva({ ...nueva, horaInicio: e.target.value })}
                style={inp}
              />
            </div>
          </div>

          <div>
            <span style={label}>Título (opcional)</span>
            <input
              value={nueva.titulo}
              onChange={(e) => setNueva({ ...nueva, titulo: e.target.value })}
              placeholder={MEETING_TYPE_LABEL[nueva.tipo]}
              style={inp}
            />
          </div>

          <div>
            <span style={label}>Convocados ({nueva.asistentes.length})</span>
            <div
              style={{
                maxHeight: 190,
                overflowY: "auto",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 8,
              }}
            >
              {personas.map((p) => (
                <label
                  key={p.id}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px", fontSize: 13 }}
                >
                  <input
                    type="checkbox"
                    checked={nueva.asistentes.includes(p.id)}
                    onChange={(e) =>
                      setNueva({
                        ...nueva,
                        asistentes: e.target.checked
                          ? [...nueva.asistentes, p.id]
                          : nueva.asistentes.filter((x) => x !== p.id),
                      })
                    }
                  />
                  {p.nombre}
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Detalle de reunión ───────────────────────────────────────── */}
      <Modal
        open={Boolean(detalle)}
        onClose={() => setDetalle(null)}
        title={detalle?.titulo ?? "Reunión"}
        maxWidth={720}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetalle(null)}>
              Cerrar
            </Button>
            {detalle?.estado === "PROGRAMADA" && (
              <Button onClick={cerrarJunta}>Marcar como realizada</Button>
            )}
          </>
        }
      >
        {detalleCargando || !detalle ? (
          <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>Cargando…</p>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>
              {MEETING_TYPE_LABEL[detalle.tipo]} · {formatMeetingDate(detalle.fecha)}
              {detalle.horaInicio ? ` · ${detalle.horaInicio}` : ""}
              {detalle.facilitador ? ` · conduce ${detalle.facilitador.nombre}` : ""}
            </div>

            {detalle.agenda && (
              <div>
                <span style={label}>Agenda</span>
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    fontFamily: "inherit",
                    fontSize: 13,
                    background: "var(--muted)",
                    padding: 10,
                    borderRadius: 8,
                  }}
                >
                  {detalle.agenda}
                </pre>
              </div>
            )}

            <div>
              <span style={label}>Acuerdos, lecciones y riesgos ({detalle.acuerdos.length})</span>
              {detalle.acuerdos.length === 0 ? (
                <p style={{ fontSize: 12.5, color: "var(--muted-foreground)" }}>
                  Todavía no se registró nada de esta reunión.
                </p>
              ) : (
                <ListaAcuerdos
                  acuerdos={detalle.acuerdos}
                  mostrarResponsable
                  onEstado={cambiarEstadoEnJunta}
                  estadosDisponibles={["EN_PROCESO", "CUMPLIDO", "CANCELADO"]}
                />
              )}
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "grid", gap: 10 }}>
              <span style={label}>Registrar</span>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "150px 1fr" }}>
                <select
                  value={nuevoAcuerdo.tipo}
                  onChange={(e) =>
                    setNuevoAcuerdo({ ...nuevoAcuerdo, tipo: e.target.value as AgreementKind })
                  }
                  style={inp}
                >
                  {(Object.keys(AGREEMENT_KIND_LABEL) as AgreementKind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_ICON[k]} {AGREEMENT_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
                <input
                  value={nuevoAcuerdo.descripcion}
                  onChange={(e) => setNuevoAcuerdo({ ...nuevoAcuerdo, descripcion: e.target.value })}
                  placeholder={
                    nuevoAcuerdo.tipo === "ACUERDO"
                      ? "Qué se acordó hacer"
                      : nuevoAcuerdo.tipo === "LECCION"
                        ? "Qué aprendimos"
                        : "Qué riesgo detectamos"
                  }
                  style={inp}
                />
              </div>

              {nuevoAcuerdo.tipo === "ACUERDO" && (
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 160px" }}>
                  <select
                    value={nuevoAcuerdo.responsableId}
                    onChange={(e) =>
                      setNuevoAcuerdo({ ...nuevoAcuerdo, responsableId: e.target.value })
                    }
                    style={inp}
                  >
                    <option value="">Responsable…</option>
                    {personas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={nuevoAcuerdo.fechaCompromiso}
                    onChange={(e) =>
                      setNuevoAcuerdo({ ...nuevoAcuerdo, fechaCompromiso: e.target.value })
                    }
                    style={inp}
                  />
                </div>
              )}

              {nuevoAcuerdo.tipo === "ACUERDO" && (
                <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", margin: 0 }}>
                  Un acuerdo necesita responsable. Una lección y un riesgo, no: son conocimiento,
                  no tarea.
                </p>
              )}

              <div>
                <Button
                  size="sm"
                  onClick={registrarAcuerdo}
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

function Pill({ children, tone }: { children: React.ReactNode; tone: "ok" | "warn" | "off" | "info" }) {
  const colores: Record<string, { bg: string; fg: string }> = {
    ok: { bg: "color-mix(in srgb, #16a34a 16%, transparent)", fg: "#15803d" },
    warn: { bg: "color-mix(in srgb, #dc2626 16%, transparent)", fg: "#b91c1c" },
    off: { bg: "var(--muted)", fg: "var(--muted-foreground)" },
    info: { bg: "color-mix(in srgb, var(--primary) 16%, transparent)", fg: "var(--primary-strong)" },
  };
  const c = colores[tone];
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: c.bg,
        color: c.fg,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

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
    <div style={{ display: "grid", gap: 8 }}>
      {acuerdos.map((a) => (
        <div
          key={a.id}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "10px 12px",
            border: "1px solid var(--border)",
            borderLeft: a.vencido ? "3px solid #dc2626" : "1px solid var(--border)",
            borderRadius: 10,
            background: "var(--surface)",
          }}
        >
          <span style={{ fontSize: 16, lineHeight: "20px" }}>{KIND_ICON[a.tipo]}</span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45 }}>{a.descripcion}</p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 5,
                fontSize: 11.5,
                color: "var(--muted-foreground)",
              }}
            >
              {mostrarResponsable && a.responsable && <span>👤 {a.responsable.nombre}</span>}
              {a.fechaCompromiso && <span>📆 {formatMeetingDate(a.fechaCompromiso)}</span>}
              {a.activity && (
                <span>
                  🔧 {a.activity.anNumber} · {a.activity.titulo}
                </span>
              )}
              {mostrarReunion && a.meeting && (
                <span>
                  📅 {a.meeting.titulo} · {formatMeetingDate(a.meeting.fecha)}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {a.vencido && <Pill tone="warn">{a.diasVencido} d tarde</Pill>}
            {a.tipo === "ACUERDO" && <Pill tone={a.estado === "CUMPLIDO" ? "ok" : "info"}>{AGREEMENT_STATUS_LABEL[a.estado]}</Pill>}
            {onEstado &&
              estadosDisponibles
                .filter((e) => e !== a.estado)
                .map((e) => (
                  <Button key={e} size="sm" variant="ghost" onClick={() => onEstado(a, e)}>
                    {AGREEMENT_STATUS_LABEL[e]}
                  </Button>
                ))}
          </div>
        </div>
      ))}
    </div>
  );
}
