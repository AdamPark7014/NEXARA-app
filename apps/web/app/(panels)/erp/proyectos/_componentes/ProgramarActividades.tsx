"use client";

import { useState } from "react";
import {
  ESTADO_HITO_LABEL,
  obtenerProgramacion,
  programarActividades,
  type EstadoHito,
  type EtapaPropuesta,
  type ResultadoProgramacion,
} from "@/lib/proyectos-api";
import { aInputFecha } from "@/lib/proyecto-plan";
import { rangosSeEmpalman, reencadenar, resumenDelRango } from "@/lib/actividad-periodo";
import { PersonaSelect } from "./personas";
import type { SeccionProps } from "./tipos";
import styles from "../proyectos.module.css";

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
      setError(e instanceof Error ? e.message : "No se pudo preparar la programación");
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
    <section className={styles.panel} aria-labelledby="prog-titulo">
      <div className={styles.panelHead}>
        <h3 id="prog-titulo" className={styles.panelTitle}>
          Programar actividades del proyecto
        </h3>
        {!abierto ? (
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={ocupado || cerrado || sinEtapas}
            onClick={() => void abrir()}
          >
            Programar actividades
          </button>
        ) : null}
      </div>
      <p className={styles.hint}>
        Una actividad por etapa del cronograma, con su periodo: sale en la pizarra de quien la lleva cada día,
        del primero al último, sin volver a cargarla. Cada etapa empieza al día siguiente de que termina la
        anterior.
      </p>
      {sinEtapas ? (
        <div className={styles.empty}>Primero agrega las etapas en la pestaña Cronograma.</div>
      ) : cerrado ? (
        <div className={styles.empty}>El proyecto está {p.status === "CANCELLED" ? "cancelado" : "terminado"}: no se programan actividades.</div>
      ) : null}

      {resultado && !abierto ? (
        <div className={styles.okBox} role="status">
          {resultado.creadas.length
            ? `Se crearon ${resultado.creadas.length} actividad${resultado.creadas.length === 1 ? "" : "es"}: `
            : "No se creó ninguna actividad nueva. "}
          {resultado.creadas
            .map((c) => `${c.anNumber} (${etapaDe(c.hitoId)}${c.sitio ? ` · Sucursal ${c.sitio}` : ""})`)
            .join(", ")}
          {resultado.omitidas.length
            ? ` · Omitidas por estar ya programadas: ${resultado.omitidas.map((o) => etapaDe(o.hitoId)).join(", ")}.`
            : ""}
        </div>
      ) : null}

      {abierto ? (
        cargando ? (
          <p className={styles.hint}>Preparando la propuesta…</p>
        ) : (
          <div className={styles.gantt} style={{ gap: 10 }}>
            <ol className={styles.editor} aria-label="Etapas a programar">
              {filas.map((f, i) => {
                const revision = revisiones[i];
                const idBase = `prog-${f.hitoId}`;
                return (
                  <li
                    key={f.hitoId}
                    className={styles.item}
                    style={{ gridTemplateColumns: "minmax(0, 1fr)", opacity: f.incluir ? 1 : 0.65 }}
                  >
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={f.incluir}
                        onChange={(e) => cambiar(i, { incluir: e.target.checked })}
                      />
                      <strong>
                        {i + 1}. {f.nombre}
                      </strong>
                      <span className={styles.rowSub}>{ESTADO_HITO_LABEL[f.estado] ?? f.estado}</span>
                    </label>
                    {f.programadas.length ? (
                      <span className={styles.rowWrap}>
                        Ya programada:{" "}
                        {f.programadas
                          .map((a) => `${a.anNumber}${a.sitio ? ` (sucursal ${a.sitio})` : ""}${a.periodo ? ` · ${a.periodo.etiqueta}` : ""}`)
                          .join(" · ")}
                      </span>
                    ) : null}
                    {f.incluir ? (
                      <>
                        <div className={styles.grid3}>
                          <div>
                            <label className={styles.fieldLabel} htmlFor={`${idBase}-del`}>
                              Del
                            </label>
                            <input
                              id={`${idBase}-del`}
                              className={styles.input}
                              type="date"
                              value={aInputFecha(f.inicio)}
                              onChange={(e) => cambiar(i, { inicio: e.target.value }, true)}
                            />
                          </div>
                          <div>
                            <label className={styles.fieldLabel} htmlFor={`${idBase}-al`}>
                              Al
                            </label>
                            <input
                              id={`${idBase}-al`}
                              className={styles.input}
                              type="date"
                              min={f.inicio || undefined}
                              value={aInputFecha(f.fin)}
                              onChange={(e) => cambiar(i, { fin: e.target.value }, true)}
                            />
                          </div>
                          <div>
                            <label className={styles.fieldLabel} htmlFor={`${idBase}-resp`}>
                              La lleva
                            </label>
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
                          </div>
                        </div>
                        <div className={styles.chips} aria-label={`Apoyo en ${f.nombre}`}>
                          {f.apoyoIds.map((id) => (
                            <button
                              key={id}
                              type="button"
                              className={styles.smallBtn}
                              onClick={() => cambiar(i, { apoyoIds: f.apoyoIds.filter((x) => x !== id) })}
                              aria-label={`Quitar a ${nombreDe(id)} del apoyo`}
                            >
                              {nombreDe(id)} ×
                            </button>
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
                          />
                        </div>
                        <span className={styles.rowWrap}>
                          {resumenDelRango({ inicio: f.inicio, fin: f.fin }) ?? ""}
                        </span>
                        {revision?.error && intentado ? (
                          <p className={styles.error} role="alert">
                            {revision.error}
                          </p>
                        ) : null}
                        {revision?.avisos.length ? (
                          <span className={`${styles.rowWrap} ${styles.vencido}`}>{revision.avisos.join(" ")}</span>
                        ) : null}
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ol>

            {sitios ? (
              <label className={styles.check}>
                <input type="checkbox" checked={porSitio} onChange={(e) => setPorSitio(e.target.checked)} />
                Una actividad por sitio en cada etapa ({sitios} sitio{sitios === 1 ? "" : "s"})
              </label>
            ) : null}

            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            <div className={styles.acciones}>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={ocupado || total === 0}
                onClick={() => void confirmar()}
              >
                {ocupado
                  ? "Programando…"
                  : total === 1
                    ? "Crear 1 actividad"
                    : `Crear ${total} actividades`}
              </button>
              <button type="button" className={styles.secondaryBtn} disabled={ocupado} onClick={() => setAbierto(false)}>
                Cancelar
              </button>
            </div>
          </div>
        )
      ) : null}
    </section>
  );
}
