"use client";

import { useState } from "react";
import EventRepeatOutlinedIcon from "@mui/icons-material/EventRepeatOutlined";
import { Alert, Button, Checkbox, DateInput, Field, FilterChip, RecordSection } from "@/components/base";
import {
  ESTADO_HITO_LABEL,
  obtenerProgramacion,
  programarActividades,
  type EstadoHito,
  type EtapaPropuesta,
  type ResultadoProgramacion,
} from "@/lib/proyectos-api";
import { aInputFecha } from "@/lib/proyecto-plan";
import { formatApiError } from "@/lib/erp-api";
import { rangosSeEmpalman, reencadenar, resumenDelRango } from "@/lib/actividad-periodo";
import { PersonaSelect } from "./personas";
import type { SeccionProps } from "./tipos";
import styles from "./secciones.module.css";

/** Una etapa tal como se va a programar (lo que se puede mover antes de confirmar). */
export type Fila = {
  hitoId: number;
  nombre: string;
  estado: EstadoHito;
  incluir: boolean;
  inicio: string;
  fin: string;
  responsableId: string;
  apoyoIds: number[];
  ajustada: boolean;
  programadas: EtapaPropuesta["programadas"];
};

function filaDe(e: EtapaPropuesta): Fila {
  return {
    hitoId: e.hitoId,
    nombre: e.nombre,
    estado: e.estado,
    incluir: e.sugerida,
    inicio: e.inicio,
    fin: e.fin,
    responsableId: e.responsableId ? String(e.responsableId) : "",
    apoyoIds: [],
    ajustada: e.ajustada,
    programadas: e.programadas,
  };
}

/** Problemas de una fila incluida: lo que impide crear (error) o conviene revisar (aviso). */
export function revisarFila(
  fila: Fila,
  anterior: Fila | null,
  proyecto: { inicio: string | null; fin: string | null },
): { error: string | null; avisos: string[] } {
  if (!fila.inicio || !fila.fin) return { error: "Pon el primer y el último día.", avisos: [] };
  if (fila.fin < fila.inicio) return { error: "El último día no puede ser anterior al primero.", avisos: [] };
  if (!fila.responsableId) return { error: "Elige quién la lleva.", avisos: [] };
  const avisos: string[] = [];
  if (anterior && rangosSeEmpalman(anterior, fila)) avisos.push(`Se empalma con «${anterior.nombre}».`);
  if (proyecto.fin && fila.fin > proyecto.fin) avisos.push("Termina después del fin planeado del proyecto.");
  if (proyecto.inicio && fila.inicio < proyecto.inicio) avisos.push("Empieza antes del inicio planeado del proyecto.");
  if (fila.ajustada) avisos.push("Su fecha planeada quedaba antes de la etapa anterior: se recorrió.");
  return { error: null, avisos };
}

/**
 * «Programar actividades del proyecto»: de las etapas del cronograma y la ventana del
 * proyecto salen las actividades con su periodo, todas de una vez. Cada etapa empieza al
 * día siguiente de que termina la anterior; si se mueve una, las siguientes se recorren.
 */
export default function ProgramarActividades({ proyecto: p, token, ocupado, personas, mutar }: SeccionProps) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [ventana, setVentana] = useState<{ inicio: string | null; fin: string | null }>({ inicio: null, fin: null });
  const [sitios, setSitios] = useState<number | null>(null);
  const [porSitio, setPorSitio] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const [resultado, setResultado] = useState<Omit<ResultadoProgramacion, "proyecto"> | null>(null);

  const cerrado = p.status === "CANCELLED" || p.status === "COMPLETED";
  const sinEtapas = p.milestones.length === 0;

  async function abrir() {
    setAbierto(true);
    setCargando(true);
    setError(null);
    setResultado(null);
    setIntentado(false);
    try {
      const propuesta = await obtenerProgramacion(token, p.id);
      setFilas(propuesta.etapas.map(filaDe));
      setVentana({ inicio: propuesta.proyecto.inicio, fin: propuesta.proyecto.fin });
      setSitios(propuesta.proyecto.siteCount && propuesta.proyecto.siteCount > 0 ? propuesta.proyecto.siteCount : null);
      setPorSitio(false);
    } catch (e) {
      setError(formatApiError(e, "No se pudo preparar la programación"));
    } finally {
      setCargando(false);
    }
  }

  function cambiar(i: number, cambios: Partial<Fila>, encadenar = false) {
    setFilas((prev) => {
      const nuevas = prev.map((f, j) => (j === i ? { ...f, ...cambios, ajustada: false } : f));
      // Solo se recorre lo siguiente con un rango completo: al borrar una fecha para
      // escribir otra, las demás etapas no deben perder sus días.
      const movida = nuevas[i];
      const completa = Boolean(movida.inicio && movida.fin && movida.fin >= movida.inicio);
      return encadenar && completa ? reencadenar(nuevas, i) : nuevas;
    });
  }

  const incluidas = filas.filter((f) => f.incluir);
  const porEtapa = porSitio && sitios ? sitios : 1;
  const total = incluidas.length * porEtapa;
  // La «anterior» de cada fila es la incluida previa (las excluidas no cuentan).
  const revisiones = filas.map((f, i) => {
    if (!f.incluir) return null;
    const anterior = [...filas.slice(0, i)].reverse().find((x) => x.incluir) ?? null;
    return revisarFila(f, anterior, ventana);
  });
  const hayErrores = revisiones.some((r) => r?.error);

  async function confirmar() {
    setIntentado(true);
    if (!incluidas.length) {
      setError("Marca al menos una etapa.");
      return;
    }
    if (hayErrores) {
      setError("Revisa las etapas marcadas: hay datos incompletos.");
      return;
    }
    setError(null);
    const ok = await mutar(async () => {
      const r = await programarActividades(token, p.id, {
        porSitio: Boolean(porSitio && sitios),
        etapas: incluidas.map((f) => ({
          hitoId: f.hitoId,
          inicio: f.inicio,
          fin: f.fin,
          responsableId: Number(f.responsableId),
          ...(f.apoyoIds.length ? { apoyoIds: f.apoyoIds } : {}),
        })),
      });
      setResultado({ creadas: r.creadas, omitidas: r.omitidas });
      return r.proyecto;
    }, "Actividades programadas.");
    if (ok) setAbierto(false);
  }

  const nombreDe = (id: number) => personas.find((x) => x.id === id)?.nombre ?? `Persona ${id}`;
  const etapaDe = (hitoId: number) => p.milestones.find((h) => h.id === hitoId)?.name ?? "Etapa";

  return (
    <RecordSection
      title="Programar actividades del proyecto"
      subtitle="Una actividad por etapa del cronograma, con su periodo: sale en la pizarra de quien la lleva cada día, del primero al último, sin volver a cargarla. Cada etapa empieza al día siguiente de que termina la anterior."
      end={
        !abierto ? (
          <Button variant="tonal" iconStart={<EventRepeatOutlinedIcon />} disabled={ocupado || cerrado || sinEtapas} onClick={() => void abrir()}>
            Programar actividades
          </Button>
        ) : null
      }
    >
      <div className={styles.pila}>
        {sinEtapas ? (
          <p className={styles.vacio}>Primero agrega las etapas en la pestaña Cronograma.</p>
        ) : cerrado ? (
          <p className={styles.vacio}>El proyecto está {p.status === "CANCELLED" ? "cancelado" : "terminado"}: no se programan actividades.</p>
        ) : null}

        {resultado && !abierto ? (
          <Alert tone="success" role="status">
            {resultado.creadas.length
              ? `Se crearon ${resultado.creadas.length} actividad${resultado.creadas.length === 1 ? "" : "es"}: `
              : "No se creó ninguna actividad nueva. "}
            {resultado.creadas
              .map((c) => `${c.anNumber} (${etapaDe(c.hitoId)}${c.sitio ? ` · Sucursal ${c.sitio}` : ""})`)
              .join(", ")}
            {resultado.omitidas.length
              ? ` · Omitidas por estar ya programadas: ${resultado.omitidas.map((o) => etapaDe(o.hitoId)).join(", ")}.`
              : ""}
          </Alert>
        ) : null}

        {abierto ? (
          cargando ? (
            <p className={styles.ayuda} aria-busy="true">
              Preparando la propuesta…
            </p>
          ) : (
            <div className={styles.edicion}>
              <ol className={styles.lista} aria-label="Etapas a programar">
                {filas.map((f, i) => {
                  const revision = revisiones[i];
                  const idBase = `prog-${f.hitoId}`;
                  return (
                    <li key={f.hitoId} className={`${styles.fila} ${styles.filaEdicion} ${f.incluir ? "" : styles.filaApagada}`}>
                      <div className={styles.edicion}>
                        <Checkbox
                          checked={f.incluir}
                          onChange={(e) => cambiar(i, { incluir: e.target.checked })}
                          label={
                            <strong>
                              {i + 1}. {f.nombre}
                            </strong>
                          }
                          description={ESTADO_HITO_LABEL[f.estado] ?? f.estado}
                        />
                        {f.programadas.length ? (
                          <span className={styles.meta}>
                            Ya programada:{" "}
                            {f.programadas
                              .map((a) => `${a.anNumber}${a.sitio ? ` (sucursal ${a.sitio})` : ""}${a.periodo ? ` · ${a.periodo.etiqueta}` : ""}`)
                              .join(" · ")}
                          </span>
                        ) : null}
                        {f.incluir ? (
                          <>
                            <div className={styles.campos} data-cols="3">
                              <Field label="Del">
                                <DateInput id={`${idBase}-del`} value={aInputFecha(f.inicio)} onChange={(e) => cambiar(i, { inicio: e.target.value }, true)} />
                              </Field>
                              <Field label="Al">
                                <DateInput
                                  id={`${idBase}-al`}
                                  min={f.inicio || undefined}
                                  value={aInputFecha(f.fin)}
                                  onChange={(e) => cambiar(i, { fin: e.target.value }, true)}
                                />
                              </Field>
                              <Field label="La lleva">
                                <PersonaSelect
                                  id={`${idBase}-resp`}
                                  value={f.responsableId}
                                  onChange={(v) =>
                                    cambiar(i, {
                                      responsableId: v,
                                      apoyoIds: f.apoyoIds.filter((x) => String(x) !== v),
                                    })
                                  }
                                  personas={personas}
                                  vacio="Elige a alguien…"
                                />
                              </Field>
                            </div>
                            <div className={styles.chips} aria-label={`Apoyo en ${f.nombre}`}>
                              {f.apoyoIds.map((id) => (
                                <FilterChip
                                  key={id}
                                  onRemove={() => cambiar(i, { apoyoIds: f.apoyoIds.filter((x) => x !== id) })}
                                  removeLabel={`Quitar a ${nombreDe(id)} del apoyo`}
                                >
                                  {nombreDe(id)}
                                </FilterChip>
                              ))}
                              <PersonaSelect
                                value=""
                                onChange={(v) => {
                                  const id = Number(v);
                                  if (id && !f.apoyoIds.includes(id)) cambiar(i, { apoyoIds: [...f.apoyoIds, id] });
                                }}
                                personas={personas}
                                excluir={[Number(f.responsableId) || 0, ...f.apoyoIds]}
                                vacio="+ Sumar apoyo…"
                                aria-label={`Sumar apoyo en ${f.nombre}`}
                                controlSize="sm"
                                className={styles.selectCompacto}
                              />
                            </div>
                            <span className={styles.meta}>{resumenDelRango({ inicio: f.inicio, fin: f.fin }) ?? ""}</span>
                            {revision?.error && intentado ? (
                              <Alert tone="danger" role="alert" dense>
                                {revision.error}
                              </Alert>
                            ) : null}
                            {revision?.avisos.length ? (
                              <Alert tone="warning" dense>
                                {revision.avisos.join(" ")}
                              </Alert>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>

              {sitios ? (
                <Checkbox
                  checked={porSitio}
                  onChange={(e) => setPorSitio(e.target.checked)}
                  label={`Una actividad por sitio en cada etapa (${sitios} sitio${sitios === 1 ? "" : "s"})`}
                />
              ) : null}

              {error ? (
                <Alert tone="danger" role="alert" dense>
                  {error}
                </Alert>
              ) : null}
              <div className={styles.botonera}>
                <Button variant="tertiary" disabled={ocupado} onClick={() => setAbierto(false)}>
                  Cancelar
                </Button>
                <Button variant="tonal" loading={ocupado} disabled={total === 0} onClick={() => void confirmar()}>
                  {total === 1 ? "Crear 1 actividad" : `Crear ${total} actividades`}
                </Button>
              </div>
            </div>
          )
        ) : null}
      </div>
    </RecordSection>
  );
}
