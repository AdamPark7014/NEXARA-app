"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import { toast } from "@/components/Toast";
import { formatApiError } from "@/lib/erp-api";
import { downloadMeetingPdf } from "@/lib/meetings-api";
import { duracionLegible } from "@/lib/voz-api";
import {
  ESTADO_PREVIO_LABEL,
  PRIORIDAD_LABEL,
  borrarGrabacion,
  concluirGrabacion,
  confirmarAcuerdos,
  cuerposParaGuardar,
  enviarMinuta,
  estadoGrabacion,
  faltaResponsable,
  propuestasDe,
  regenerarMinuta,
  transcripcionGrabacion,
  type EstadoPrevio,
  type GrabacionExistente,
  type Prioridad,
  type Propuesta,
} from "@/lib/grabacion-api";
import NotasEnVivo from "./NotasEnVivo";
import s from "./reuniones.module.css";

const TIPO_LABEL: Record<Propuesta["tipo"], string> = { ACUERDO: "Acuerdo", LECCION: "Lección", RIESGO: "Riesgo" };
const CONSULTA_MS = 4_000;

/**
 * La minuta de una reunión grabada, dentro del detalle: mientras se escribe, el avance; lista,
 * el resumen, lo más importante, los temas y todo lo demás, con el PDF y el envío. Los acuerdos
 * se proponen como actividades y solo se guardan los que se dejan marcados.
 */
export default function MinutaReunion({
  token,
  meetingId,
  inicial,
  personas,
  onSeguirGrabando,
  onCambio,
}: {
  token: string;
  meetingId: number;
  inicial: GrabacionExistente;
  personas: Array<{ id: number; nombre: string }>;
  /** La grabación quedó abierta: retomarla donde se quedó. */
  onSeguirGrabando: (base: { baseMs: number; baseParte: number }) => void;
  /** Se guardaron acuerdos, se borró la grabación o cambió la reunión. */
  onCambio: () => Promise<void> | void;
}) {
  const [g, setG] = useState<GrabacionExistente>(inicial);
  const [propuestas, setPropuestas] = useState<Propuesta[]>(() => (inicial.minuta ? propuestasDe(inicial.minuta) : []));
  const [guardando, setGuardando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [bajando, setBajando] = useState(false);
  const [transcripcion, setTranscripcion] = useState<string | null>(null);
  const [verNotas, setVerNotas] = useState(false);
  const [verOtros, setVerOtros] = useState(false);

  const refrescar = useCallback(async () => {
    const r = await estadoGrabacion(token, meetingId);
    if (!r.existe) return;
    setG(r);
    if (r.minuta) setPropuestas((prev) => (prev.length ? prev : propuestasDe(r.minuta!)));
  }, [token, meetingId]);

  const enProceso = g.estado === "CONCLUYENDO";
  useEffect(() => {
    if (!enProceso) return;
    const t = window.setInterval(() => void refrescar().catch(() => undefined), CONSULTA_MS);
    return () => window.clearInterval(t);
  }, [enProceso, refrescar]);

  // Al terminar la minuta, la reunión cambió (título, minuta en notas, realizada).
  const [avisada, setAvisada] = useState(inicial.estado === "LISTA");
  useEffect(() => {
    if (g.estado === "LISTA" && !avisada) {
      setAvisada(true);
      void onCambio();
    }
  }, [g.estado, avisada, onCambio]);

  const cambiar = (i: number, cambio: Partial<Propuesta>) =>
    setPropuestas((prev) => prev.map((p, j) => (j === i ? { ...p, ...cambio } : p)));

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await confirmarAcuerdos(token, meetingId, cuerposParaGuardar(propuestas));
      toast.success(
        [`${r.guardados} ${r.guardados === 1 ? "registro guardado" : "registros guardados"}`, r.actividades ? `${r.actividades} como actividad` : ""]
          .filter(Boolean)
          .join(" · "),
      );
      if (r.errores.length) toast.error(`No se guardó todo: ${r.errores.slice(0, 2).join("; ")}`);
      await refrescar();
      await onCambio();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudieron guardar los acuerdos."));
    } finally {
      setGuardando(false);
    }
  };

  const bajarPdf = async () => {
    setBajando(true);
    try {
      await downloadMeetingPdf(token, meetingId);
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo generar el PDF."));
    } finally {
      setBajando(false);
    }
  };

  const enviar = async () => {
    if (!window.confirm("¿Enviar el PDF de la minuta por correo a todos los convocados?")) return;
    setEnviando(true);
    try {
      const r = await enviarMinuta(token, meetingId);
      toast.success(`Minuta enviada a ${r.enviados} ${r.enviados === 1 ? "persona" : "personas"}`);
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo enviar la minuta."));
    } finally {
      setEnviando(false);
    }
  };

  const regenerar = async () => {
    try {
      const r = await regenerarMinuta(token, meetingId);
      if (r.existe) setG(r);
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo volver a escribir la minuta."));
    }
  };

  const borrar = async () => {
    if (!window.confirm("¿Borrar la grabación, su transcripción, las notas y la minuta? Los acuerdos ya guardados se quedan.")) return;
    try {
      await borrarGrabacion(token, meetingId);
      await onCambio();
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo borrar la grabación."));
    }
  };

  const verTranscripcion = async () => {
    if (transcripcion !== null) return setTranscripcion(null);
    try {
      setTranscripcion((await transcripcionGrabacion(token, meetingId)).texto || "(sin texto)");
    } catch (e) {
      toast.error(formatApiError(e, "No se pudo leer la transcripción."));
    }
  };

  // ── Grabación que quedó abierta ───────────────────────────────────────
  if (g.estado === "GRABANDO") {
    return (
      <div className={s.minuta}>
        <p className={s.minutaTitle}>Grabación abierta</p>
        <p className={s.hint} style={{ margin: 0 }}>
          Hay {duracionLegible(g.duracionMs)} grabados ({g.listas} de {g.total} minutos ya en texto). Puedes seguir grabando donde se quedó o concluir y escribir la minuta con lo que hay.
        </p>
        <div className={s.minutaActions}>
          <Button variant="primary" onClick={() => onSeguirGrabando({ baseMs: g.duracionMs, baseParte: g.ultima })}>
            Seguir grabando
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                const r = await concluirGrabacion(token, meetingId);
                if (r.existe) setG(r);
              } catch (e) {
                toast.error(formatApiError(e, "No se pudo concluir."));
              }
            }}
          >
            Concluir con lo grabado
          </Button>
        </div>
        <NotasEnVivo notas={g.notas} grabando={false} />
      </div>
    );
  }

  // ── Escribiendo ───────────────────────────────────────────────────────
  if (g.estado === "CONCLUYENDO") {
    return (
      <div className={s.minuta} aria-busy="true">
        <p className={s.minutaTitle}>Escribiendo la minuta…</p>
        <p className={s.hint} style={{ margin: 0 }} aria-live="polite">
          {g.pendientes
            ? `Pasando a texto lo último de la grabación (${g.pendientes} ${g.pendientes === 1 ? "minuto" : "minutos"}).`
            : "La IA está redactando el resumen, los temas y los acuerdos. Suele tardar uno o dos minutos; puedes cerrar esta ventana y volver."}
        </p>
        <div className={s.progreso}>
          <span style={{ width: `${g.total ? Math.round((g.listas / g.total) * 100) : 100}%` }} />
        </div>
      </div>
    );
  }

  // ── Falló ─────────────────────────────────────────────────────────────
  if (g.estado === "ERROR" || !g.minuta) {
    return (
      <div className={s.minuta}>
        <InlineAlert variant="danger" message={g.error || "No se pudo escribir la minuta."} />
        <div className={s.minutaActions}>
          <Button variant="primary" onClick={() => void regenerar()}>
            Volver a intentar
          </Button>
          <Button variant="ghost" onClick={() => void borrar()}>
            Borrar grabación
          </Button>
        </div>
      </div>
    );
  }

  const m = g.minuta;
  const sinResponsable = propuestas.filter(faltaResponsable).length;
  const confirmados = Boolean(g.acuerdosConfirmadosAt);

  return (
    <div className={s.minuta}>
      <div className={s.minutaHead}>
        <div>
          <p className={s.minutaTitle}>Minuta con IA</p>
          <p className={s.hint} style={{ margin: 0 }}>
            {duracionLegible(g.duracionMs)} grabados · {g.palabras.toLocaleString("es-MX")} palabras · costo de IA US${g.usdIa.toFixed(3)}
          </p>
        </div>
        <div className={s.minutaActions}>
          <Button variant="primary" onClick={() => void bajarPdf()} loading={bajando}>
            Descargar PDF
          </Button>
          <Button variant="secondary" onClick={() => void enviar()} loading={enviando}>
            Enviar a asistentes
          </Button>
        </div>
      </div>

      <section className={s.bloque}>
        <h3 className={s.bloqueTitle}>Resumen ejecutivo</h3>
        <p className={s.resumen}>{m.resumenEjecutivo}</p>
      </section>

      {m.loMasImportante.length ? (
        <section className={s.bloque}>
          <h3 className={s.bloqueTitle}>Lo más importante</h3>
          <ol className={s.top}>
            {m.loMasImportante.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {m.temas.length ? (
        <section className={s.bloque}>
          <h3 className={s.bloqueTitle}>Temas tratados · {m.temas.length}</h3>
          {m.temas.map((t, i) => (
            <details key={i} className={s.tema} open={i < 2}>
              <summary>
                <span className={s.temaNum}>{i + 1}</span> {t.titulo}
              </summary>
              {t.resumen ? <p className={s.temaResumen}>{t.resumen}</p> : null}
              <ul className={s.tramoPuntos}>
                {t.puntos.map((p, j) => (
                  <li key={j}>{p}</li>
                ))}
              </ul>
              {t.conclusion ? <p className={s.conclusion}>Cómo quedó: {t.conclusion}</p> : null}
            </details>
          ))}
        </section>
      ) : null}

      {m.decisiones.length ? <Lista titulo="Decisiones" items={m.decisiones} numerada /> : null}

      <section className={s.bloque}>
        <h3 className={s.bloqueTitle}>
          {confirmados ? "Acuerdos (ya guardados en la reunión)" : `Acuerdos propuestos · ${propuestas.filter((p) => p.incluir).length} marcados`}
        </h3>
        {confirmados ? (
          <p className={s.hint} style={{ margin: 0 }}>
            Se guardaron el {new Date(g.acuerdosConfirmadosAt!).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}. Abajo están con su estado.
          </p>
        ) : propuestas.length === 0 ? (
          <p className={s.hint} style={{ margin: 0 }}>La IA no encontró compromisos en la junta.</p>
        ) : (
          <>
            <p className={s.hint} style={{ margin: 0 }}>
              Nada se crea solo: revisa responsable y fecha, desmarca lo que no aplique y guarda. Cada acuerdo marcado como actividad le llega a su responsable.
            </p>
            {propuestas.map((p, i) =>
              p.tipo === "ACUERDO" || verOtros ? <FilaPropuesta key={i} p={p} personas={personas} onCambio={(c) => cambiar(i, c)} /> : null,
            )}
            {propuestas.some((p) => p.tipo !== "ACUERDO") ? (
              <div>
                <Button size="sm" variant="ghost" onClick={() => setVerOtros((v) => !v)}>
                  {verOtros
                    ? "Ocultar lecciones y riesgos"
                    : `Registrar también lecciones y riesgos (${propuestas.filter((p) => p.tipo !== "ACUERDO").length})`}
                </Button>
              </div>
            ) : null}
            {sinResponsable ? (
              <p className={s.hint} style={{ margin: 0 }}>
                {sinResponsable === 1 ? "Un acuerdo no tiene" : `${sinResponsable} acuerdos no tienen`} responsable: elige uno o desmárcalo.
              </p>
            ) : null}
            <div>
              <Button variant="primary" onClick={() => void guardar()} loading={guardando} disabled={sinResponsable > 0 || !propuestas.some((p) => p.incluir)}>
                Guardar acuerdos marcados
              </Button>
            </div>
          </>
        )}
      </section>

      {m.pendientes.length ? <Lista titulo="Pendientes sin responsable" items={m.pendientes} /> : null}
      {m.preguntasAbiertas.length ? <Lista titulo="Preguntas abiertas" items={m.preguntasAbiertas} /> : null}
      {m.riesgos.length ? (
        <Lista titulo="Riesgos y bloqueos" items={m.riesgos.map((r) => (r.mitigacion ? `${r.riesgo} — mitigación: ${r.mitigacion}` : r.riesgo))} />
      ) : null}
      {m.cifras.length ? <Lista titulo="Cifras y datos" items={m.cifras.map((c) => (c.contexto ? `${c.dato}: ${c.contexto}` : c.dato))} /> : null}
      {m.proximosPasos.length ? <Lista titulo="Próximos pasos" items={m.proximosPasos} numerada /> : null}

      {m.seguimiento.length ? (
        <section className={s.bloque}>
          <h3 className={s.bloqueTitle}>
            Seguimiento de la reunión anterior{m.reunionAnterior ? ` (${m.reunionAnterior.fecha})` : ""}
          </h3>
          <ul className={s.seguimiento}>
            {m.seguimiento.map((x) => (
              <li key={x.ref}>
                <span className={`${s.estadoPrevio} ${s[`ep_${x.estado}` as keyof typeof s] ?? ""}`}>{ESTADO_PREVIO_LABEL[x.estado as EstadoPrevio]}</span>
                <span>
                  <strong>{x.acuerdo}</strong>
                  {x.responsable ? ` · ${x.responsable}` : ""}
                  {x.detalle ? <span className={s.tramoDato}>{x.detalle}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className={s.minutaActions}>
        <Button size="sm" variant="ghost" onClick={() => setVerNotas((v) => !v)}>
          {verNotas ? "Ocultar notas por tramo" : `Ver notas por tramo (${g.totalNotas})`}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void verTranscripcion()}>
          {transcripcion !== null ? "Ocultar transcripción" : "Ver transcripción"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void regenerar()}>
          Volver a escribir la minuta
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void borrar()}>
          Borrar grabación
        </Button>
      </div>
      {verNotas ? <NotasEnVivo notas={g.notas} grabando={false} /> : null}
      {transcripcion !== null ? <pre className={s.transcripcion}>{transcripcion}</pre> : null}
    </div>
  );
}

function Lista({ titulo, items, numerada = false }: { titulo: string; items: string[]; numerada?: boolean }) {
  const Etiqueta = numerada ? "ol" : "ul";
  return (
    <section className={s.bloque}>
      <h3 className={s.bloqueTitle}>{titulo}</h3>
      <Etiqueta className={s.tramoPuntos}>
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </Etiqueta>
    </section>
  );
}

function FilaPropuesta({
  p,
  personas,
  onCambio,
}: {
  p: Propuesta;
  personas: Array<{ id: number; nombre: string }>;
  onCambio: (c: Partial<Propuesta>) => void;
}) {
  const opciones = p.candidatos.length && !p.responsableId ? p.candidatos : personas;
  return (
    <div className={`${s.propuesta} ${p.incluir ? "" : s.propuestaApagada}`}>
      <label className={s.propuestaCheck}>
        <input type="checkbox" checked={p.incluir} onChange={(e) => onCambio({ incluir: e.target.checked })} aria-label={`Guardar: ${p.descripcion}`} />
        <span className={`${s.marca} ${p.tipo === "ACUERDO" ? s.marcaAcuerdo : p.tipo === "RIESGO" ? s.marcaRiesgo : s.marcaDecision}`}>{TIPO_LABEL[p.tipo]}</span>
      </label>
      <div className={s.propuestaCampos}>
        <input className={s.input} aria-label="Descripción" value={p.descripcion} onChange={(e) => onCambio({ descripcion: e.target.value })} />
        {p.tipo === "ACUERDO" ? (
          <div className={s.propuestaFila}>
            <select
              className={s.input}
              aria-label="Responsable"
              aria-invalid={faltaResponsable(p) || undefined}
              value={p.responsableId}
              onChange={(e) => onCambio({ responsableId: e.target.value })}
            >
              <option value="">{p.textoResponsable ? `Responsable… (dijeron «${p.textoResponsable}»)` : "Responsable…"}</option>
              {opciones.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </select>
            <input className={s.input} type="date" aria-label="Fecha compromiso" value={p.fechaCompromiso} onChange={(e) => onCambio({ fechaCompromiso: e.target.value })} />
            <select className={s.input} aria-label="Prioridad" value={p.prioridad} onChange={(e) => onCambio({ prioridad: e.target.value as Prioridad })}>
              {(Object.keys(PRIORIDAD_LABEL) as Prioridad[]).map((k) => (
                <option key={k} value={k}>
                  Prioridad {PRIORIDAD_LABEL[k].toLowerCase()}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {p.tipo === "ACUERDO" ? (
          <label className={s.propuestaActividad}>
            <input type="checkbox" checked={p.crearActividad} disabled={!p.incluir} onChange={(e) => onCambio({ crearActividad: e.target.checked })} />
            Asignarlo como actividad
          </label>
        ) : null}
      </div>
    </div>
  );
}
