"use client";

import { useState, type FormEvent } from "react";
import {
  ESTADOS_HITO,
  ESTADO_HITO_LABEL,
  actualizarHito,
  agregarHito,
  borrarHito,
  formatoFecha,
  type EstadoHito,
  type HitoProyecto,
  type Tono,
} from "@/lib/proyectos-api";
import { aInputFecha, hitoVencido, textoPlazo } from "@/lib/proyecto-plan";
import LineaDeTiempo from "./LineaDeTiempo";
import { PersonaSelect } from "./personas";
import { claseTono } from "./tono";
import type { SeccionProps } from "./tipos";
import styles from "../proyectos.module.css";

type Edicion = { name: string; plannedDate: string; actualDate: string; responsableId: string; status: EstadoHito };

function estadoVisible(h: HitoProyecto, hoy: string): { texto: string; tono: Tono } {
  if (h.status === "CANCELADO") return { texto: "Cancelada", tono: "neutral" };
  if (h.status === "CUMPLIDO" || h.actualDate) return { texto: "Cumplida", tono: "ok" };
  if (hitoVencido(h, hoy)) return { texto: "Vencida", tono: "peligro" };
  if (h.status === "EN_CURSO") return { texto: "En curso", tono: "info" };
  return { texto: "Pendiente", tono: "neutral" };
}

export default function SeccionCronograma({ proyecto: p, token, hoy, ocupado, personas, mutar, confirmar }: SeccionProps) {
  const [nuevo, setNuevo] = useState({ name: "", plannedDate: "", responsableId: "" });
  const [errorNuevo, setErrorNuevo] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);

  async function agregar(e: FormEvent) {
    e.preventDefault();
    if (nuevo.name.trim().length < 3) {
      setErrorNuevo("El nombre de la etapa necesita al menos 3 letras.");
      return;
    }
    setErrorNuevo(null);
    const ok = await mutar(
      () =>
        agregarHito(token, p.id, {
          name: nuevo.name.trim(),
          plannedDate: nuevo.plannedDate || null,
          responsableId: nuevo.responsableId ? Number(nuevo.responsableId) : null,
        }),
      "Etapa agregada.",
    );
    if (ok) setNuevo({ name: "", plannedDate: "", responsableId: nuevo.responsableId });
  }

  function abrirEdicion(h: HitoProyecto) {
    setEditandoId(h.id);
    setErrorEdicion(null);
    setEdicion({
      name: h.name,
      plannedDate: aInputFecha(h.plannedDate),
      actualDate: aInputFecha(h.actualDate),
      responsableId: h.responsableId ? String(h.responsableId) : "",
      status: h.status,
    });
  }

  async function guardarEdicion(e: FormEvent, h: HitoProyecto) {
    e.preventDefault();
    if (!edicion) return;
    if (edicion.name.trim().length < 3) {
      setErrorEdicion("El nombre de la etapa necesita al menos 3 letras.");
      return;
    }
    const cambios: Parameters<typeof actualizarHito>[3] = {};
    if (edicion.name.trim() !== h.name) cambios.name = edicion.name.trim();
    if (edicion.plannedDate !== aInputFecha(h.plannedDate)) cambios.plannedDate = edicion.plannedDate || null;
    if (edicion.actualDate !== aInputFecha(h.actualDate)) cambios.actualDate = edicion.actualDate || null;
    const respAntes = h.responsableId ? String(h.responsableId) : "";
    if (edicion.responsableId !== respAntes) cambios.responsableId = edicion.responsableId ? Number(edicion.responsableId) : null;
    if (edicion.status !== h.status) cambios.status = edicion.status;
    // Quitar la fecha real sin tocar el estado dejaría la etapa «cumplida» sin fecha.
    if (cambios.actualDate === null && cambios.status === undefined && h.status === "CUMPLIDO") cambios.status = "PENDIENTE";
    if (!Object.keys(cambios).length) {
      setEditandoId(null);
      return;
    }
    const ok = await mutar(() => actualizarHito(token, p.id, h.id, cambios), "Etapa actualizada.");
    if (ok) setEditandoId(null);
  }

  return (
    <div className={styles.gantt} style={{ gap: 12 }}>
      <section className={styles.panel} aria-labelledby="crono-linea">
        <h3 id="crono-linea" className={styles.panelTitle}>
          Cronograma
        </h3>
        <LineaDeTiempo
          inicio={p.startDate}
          fin={p.endDate}
          inicioReal={p.actualStartDate}
          finReal={p.actualEndDate}
          hoy={hoy}
          etapas={p.milestones.map((h) => ({
            id: h.id,
            nombre: h.name,
            plannedDate: h.plannedDate,
            actualDate: h.actualDate,
            status: h.status,
            responsable: h.responsable?.nombre ?? null,
          }))}
        />
      </section>

      <section className={styles.panel} aria-labelledby="crono-etapas">
        <h3 id="crono-etapas" className={styles.panelTitle}>
          Etapas ({p.milestones.length})
        </h3>
        {p.milestones.length === 0 ? (
          <div className={styles.empty}>
            Este proyecto todavía no tiene etapas. Agrega la primera abajo: con etapas, el avance se mide aunque
            aún no haya actividades.
          </div>
        ) : (
          <ol className={styles.items}>
            {p.milestones.map((h, i) => {
              const est = estadoVisible(h, hoy);
              const cumplida = est.texto === "Cumplida";
              const cancelada = h.status === "CANCELADO";
              if (editandoId === h.id && edicion) {
                return (
                  <li key={h.id} className={styles.item} style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
                    <form onSubmit={(e) => void guardarEdicion(e, h)} className={styles.gantt} noValidate aria-label={`Editar la etapa ${h.name}`}>
                      <div className={styles.grid2}>
                        <div>
                          <label className={styles.fieldLabel} htmlFor={`h-n-${h.id}`}>
                            Nombre
                          </label>
                          <input
                            id={`h-n-${h.id}`}
                            className={styles.input}
                            value={edicion.name}
                            maxLength={200}
                            onChange={(e) => setEdicion({ ...edicion, name: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className={styles.fieldLabel} htmlFor={`h-r-${h.id}`}>
                            Responsable
                          </label>
                          <PersonaSelect
                            id={`h-r-${h.id}`}
                            value={edicion.responsableId}
                            onChange={(v) => setEdicion({ ...edicion, responsableId: v })}
                            personas={personas}
                          />
                        </div>
                        <div>
                          <label className={styles.fieldLabel} htmlFor={`h-p-${h.id}`}>
                            Fecha planeada
                          </label>
                          <input
                            id={`h-p-${h.id}`}
                            className={styles.input}
                            type="date"
                            value={edicion.plannedDate}
                            onChange={(e) => setEdicion({ ...edicion, plannedDate: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className={styles.fieldLabel} htmlFor={`h-a-${h.id}`}>
                            Fecha real (se cumplió)
                          </label>
                          <input
                            id={`h-a-${h.id}`}
                            className={styles.input}
                            type="date"
                            value={edicion.actualDate}
                            onChange={(e) => setEdicion({ ...edicion, actualDate: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className={styles.fieldLabel} htmlFor={`h-s-${h.id}`}>
                            Estado
                          </label>
                          <select
                            id={`h-s-${h.id}`}
                            className={styles.select}
                            value={edicion.status}
                            onChange={(e) => setEdicion({ ...edicion, status: e.target.value as EstadoHito })}
                          >
                            {ESTADOS_HITO.map((s) => (
                              <option key={s} value={s}>
                                {ESTADO_HITO_LABEL[s]}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {errorEdicion ? (
                        <p className={styles.error} role="alert">
                          {errorEdicion}
                        </p>
                      ) : null}
                      <div className={styles.acciones}>
                        <button type="submit" className={styles.primaryBtn} disabled={ocupado}>
                          Guardar
                        </button>
                        <button type="button" className={styles.secondaryBtn} onClick={() => setEditandoId(null)} disabled={ocupado}>
                          Cancelar
                        </button>
                      </div>
                    </form>
                  </li>
                );
              }
              return (
                <li key={h.id} className={styles.item}>
                  <div className={styles.itemMain}>
                    <span className={`${styles.itemTitle} ${cumplida ? styles.itemDone : ""}`}>
                      {i + 1}. {h.name}
                    </span>
                    <div className={styles.badges}>
                      <span className={claseTono(est.tono)}>{est.texto}</span>
                    </div>
                    <span className={styles.rowWrap}>
                      Plan: {h.plannedDate ? formatoFecha(h.plannedDate) : "sin fecha"}
                      {h.actualDate ? ` · Real: ${formatoFecha(h.actualDate)}` : ""}
                      {h.responsable ? ` · ${h.responsable.nombre}` : " · Sin responsable"}
                    </span>
                    {!cumplida && !cancelada && h.plannedDate ? (
                      <span className={`${styles.rowWrap} ${est.tono === "peligro" ? styles.vencido : ""}`}>
                        {textoPlazo(h.plannedDate, hoy)}
                      </span>
                    ) : null}
                  </div>
                  <div className={styles.itemActions}>
                    {!cumplida && !cancelada ? (
                      <button
                        type="button"
                        className={styles.smallBtn}
                        disabled={ocupado}
                        onClick={() =>
                          void mutar(() => actualizarHito(token, p.id, h.id, { actualDate: hoy }), `«${h.name}» marcada como cumplida.`)
                        }
                      >
                        Marcar cumplida
                      </button>
                    ) : null}
                    {h.status === "PENDIENTE" && !cumplida ? (
                      <button
                        type="button"
                        className={styles.smallBtn}
                        disabled={ocupado}
                        onClick={() => void mutar(() => actualizarHito(token, p.id, h.id, { status: "EN_CURSO" }), `«${h.name}» en curso.`)}
                      >
                        Empezar
                      </button>
                    ) : null}
                    {cumplida ? (
                      <button
                        type="button"
                        className={styles.smallBtn}
                        disabled={ocupado}
                        onClick={() =>
                          void mutar(
                            () => actualizarHito(token, p.id, h.id, { actualDate: null, status: "PENDIENTE" }),
                            `«${h.name}» regresó a pendiente.`,
                          )
                        }
                      >
                        Desmarcar
                      </button>
                    ) : null}
                    <button type="button" className={styles.smallBtn} disabled={ocupado} onClick={() => abrirEdicion(h)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className={styles.smallDangerBtn}
                      disabled={ocupado}
                      onClick={() =>
                        confirmar({
                          title: "Borrar etapa",
                          message: `¿Borrar la etapa «${h.name}» del cronograma? No se puede deshacer.`,
                          confirmLabel: "Borrar",
                          fn: async () => {
                            await mutar(() => borrarHito(token, p.id, h.id), "Etapa borrada.");
                          },
                        })
                      }
                    >
                      Borrar
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <form className={styles.panel} onSubmit={agregar} aria-labelledby="crono-nueva" noValidate>
        <h3 id="crono-nueva" className={styles.panelTitle}>
          Agregar etapa
        </h3>
        <div className={styles.inlineForm}>
          <div>
            <label className={styles.fieldLabel} htmlFor="h-nueva-nombre">
              Nombre
            </label>
            <input
              id="h-nueva-nombre"
              className={styles.input}
              value={nuevo.name}
              maxLength={200}
              onChange={(e) => setNuevo({ ...nuevo, name: e.target.value })}
              placeholder="Ej. Pruebas y puesta en marcha"
            />
          </div>
          <div>
            <label className={styles.fieldLabel} htmlFor="h-nueva-fecha">
              Fecha planeada
            </label>
            <input
              id="h-nueva-fecha"
              className={styles.input}
              type="date"
              value={nuevo.plannedDate}
              onChange={(e) => setNuevo({ ...nuevo, plannedDate: e.target.value })}
            />
          </div>
          <div>
            <label className={styles.fieldLabel} htmlFor="h-nueva-resp">
              Responsable
            </label>
            <PersonaSelect
              id="h-nueva-resp"
              value={nuevo.responsableId}
              onChange={(v) => setNuevo({ ...nuevo, responsableId: v })}
              personas={personas}
            />
          </div>
          <button type="submit" className={styles.primaryBtn} disabled={ocupado}>
            Agregar
          </button>
        </div>
        {errorNuevo ? (
          <p className={styles.error} role="alert">
            {errorNuevo}
          </p>
        ) : null}
      </form>
    </div>
  );
}
