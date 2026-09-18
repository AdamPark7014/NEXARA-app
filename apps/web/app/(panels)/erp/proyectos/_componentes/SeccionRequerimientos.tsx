"use client";

import { useState, type FormEvent } from "react";
import {
  ESTADOS_REQUERIMIENTO,
  ESTADO_REQUERIMIENTO_LABEL,
  actualizarRequerimiento,
  agregarRequerimiento,
  borrarRequerimiento,
  formatoFecha,
  type EstadoRequerimiento,
  type Requerimiento,
} from "@/lib/proyectos-api";
import { aInputFecha, diasEntre, textoPlazo } from "@/lib/proyecto-plan";
import { REQUERIMIENTOS_SUGERIDOS } from "@/lib/proyecto-alta";
import { PersonaSelect } from "./personas";
import type { SeccionProps } from "./tipos";
import styles from "../proyectos.module.css";

type Edicion = { titulo: string; responsableId: string; dueDate: string };

export default function SeccionRequerimientos({ proyecto: p, token, hoy, ocupado, personas, mutar, confirmar }: SeccionProps) {
  const [nuevo, setNuevo] = useState<Edicion>({ titulo: "", responsableId: "", dueDate: "" });
  const [errorNuevo, setErrorNuevo] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);

  const r = p.resumen.requerimientos;
  const existentes = new Set(p.requirements.map((x) => x.titulo.trim().toLowerCase()));
  const sugeridos = REQUERIMIENTOS_SUGERIDOS.filter((s) => !existentes.has(s.toLowerCase()));

  async function agregar(titulo: string) {
    if (titulo.trim().length < 3) {
      setErrorNuevo("Escribe al menos 3 letras.");
      return;
    }
    setErrorNuevo(null);
    const ok = await mutar(
      () =>
        agregarRequerimiento(token, p.id, {
          titulo: titulo.trim(),
          responsableId: nuevo.responsableId ? Number(nuevo.responsableId) : null,
          dueDate: nuevo.dueDate || null,
        }),
      "Requerimiento agregado.",
    );
    // Un atajo sugerido no borra lo que la persona estaba escribiendo.
    if (ok && titulo === nuevo.titulo) setNuevo({ titulo: "", responsableId: nuevo.responsableId, dueDate: "" });
  }

  async function guardar(e: FormEvent, req: Requerimiento) {
    e.preventDefault();
    if (!edicion) return;
    if (edicion.titulo.trim().length < 3) {
      setErrorEdicion("Escribe al menos 3 letras.");
      return;
    }
    const cambios: Parameters<typeof actualizarRequerimiento>[3] = {};
    if (edicion.titulo.trim() !== req.titulo) cambios.titulo = edicion.titulo.trim();
    const respAntes = req.responsableId ? String(req.responsableId) : "";
    if (edicion.responsableId !== respAntes) cambios.responsableId = edicion.responsableId ? Number(edicion.responsableId) : null;
    if (edicion.dueDate !== aInputFecha(req.dueDate)) cambios.dueDate = edicion.dueDate || null;
    if (!Object.keys(cambios).length) {
      setEditandoId(null);
      return;
    }
    const ok = await mutar(() => actualizarRequerimiento(token, p.id, req.id, cambios), "Requerimiento actualizado.");
    if (ok) setEditandoId(null);
  }

  const cambiarEstado = (req: Requerimiento, status: EstadoRequerimiento) =>
    void mutar(
      () => actualizarRequerimiento(token, p.id, req.id, { status }),
      `«${req.titulo}»: ${ESTADO_REQUERIMIENTO_LABEL[status].toLowerCase()}.`,
    );

  return (
    <div className={styles.gantt} style={{ gap: 12 }}>
      <section className={styles.panel} aria-labelledby="req-lista">
        <div className={styles.panelHead}>
          <h3 id="req-lista" className={styles.panelTitle}>
            Lo que hace falta para entregar
          </h3>
          <span className={styles.progressLabel}>
            {r.total ? `${r.cumplidos} de ${r.total} listos` : "Sin requerimientos"}
          </span>
        </div>
        {r.total ? (
          <div
            className={styles.progress}
            role="progressbar"
            aria-label="Requerimientos listos"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={r.porcentaje ?? 0}
            aria-valuetext={`${r.cumplidos} de ${r.total}`}
          >
            <div className={styles.progressFill} style={{ width: `${r.porcentaje ?? 0}%`, background: "#16a34a" }} />
          </div>
        ) : null}

        {p.requirements.length === 0 ? (
          <div className={styles.empty}>Sin requerimientos todavía. Agrega los papeles, permisos o datos que hacen falta.</div>
        ) : (
          <ul className={styles.items}>
            {p.requirements.map((req) => {
              const listo = req.status === "CUMPLIDO";
              const noAplica = req.status === "NO_APLICA";
              const vencido = !listo && !noAplica && (diasEntre(req.dueDate, hoy) ?? 0) > 0;
              if (editandoId === req.id && edicion) {
                return (
                  <li key={req.id} className={styles.item} style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
                    <form onSubmit={(e) => void guardar(e, req)} className={styles.gantt} noValidate aria-label={`Editar «${req.titulo}»`}>
                      <div className={styles.grid3}>
                        <div>
                          <label className={styles.fieldLabel} htmlFor={`r-t-${req.id}`}>
                            Qué hace falta
                          </label>
                          <input
                            id={`r-t-${req.id}`}
                            className={styles.input}
                            value={edicion.titulo}
                            maxLength={240}
                            onChange={(e) => setEdicion({ ...edicion, titulo: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className={styles.fieldLabel} htmlFor={`r-r-${req.id}`}>
                            Quién lo consigue
                          </label>
                          <PersonaSelect
                            id={`r-r-${req.id}`}
                            value={edicion.responsableId}
                            onChange={(v) => setEdicion({ ...edicion, responsableId: v })}
                            personas={personas}
                          />
                        </div>
                        <div>
                          <label className={styles.fieldLabel} htmlFor={`r-f-${req.id}`}>
                            Fecha límite
                          </label>
                          <input
                            id={`r-f-${req.id}`}
                            className={styles.input}
                            type="date"
                            value={edicion.dueDate}
                            onChange={(e) => setEdicion({ ...edicion, dueDate: e.target.value })}
                          />
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
                <li key={req.id} className={styles.item}>
                  <div className={styles.itemMain}>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={listo}
                        disabled={ocupado || noAplica}
                        onChange={() => cambiarEstado(req, listo ? "PENDIENTE" : "CUMPLIDO")}
                      />
                      <span className={`${styles.itemTitle} ${listo || noAplica ? styles.itemDone : ""}`}>{req.titulo}</span>
                    </label>
                    <span className={styles.rowWrap}>
                      {req.responsable ? req.responsable.nombre : "Sin responsable"}
                      {req.dueDate ? ` · Límite: ${formatoFecha(req.dueDate)}` : ""}
                      {listo && req.completedAt ? ` · Listo el ${formatoFecha(req.completedAt)}` : ""}
                    </span>
                    {vencido ? <span className={`${styles.rowWrap} ${styles.vencido}`}>{textoPlazo(req.dueDate, hoy)}</span> : null}
                  </div>
                  <div className={styles.itemActions}>
                    <label className={styles.filters}>
                      <span className={styles.filtersLabel}>Estado</span>
                      <select
                        className={styles.select}
                        style={{ width: "auto" }}
                        value={req.status}
                        disabled={ocupado}
                        onChange={(e) => cambiarEstado(req, e.target.value as EstadoRequerimiento)}
                      >
                        {ESTADOS_REQUERIMIENTO.map((s) => (
                          <option key={s} value={s}>
                            {ESTADO_REQUERIMIENTO_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className={styles.smallBtn}
                      disabled={ocupado}
                      onClick={() => {
                        setEditandoId(req.id);
                        setErrorEdicion(null);
                        setEdicion({
                          titulo: req.titulo,
                          responsableId: req.responsableId ? String(req.responsableId) : "",
                          dueDate: aInputFecha(req.dueDate),
                        });
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className={styles.smallDangerBtn}
                      disabled={ocupado}
                      onClick={() =>
                        confirmar({
                          title: "Borrar requerimiento",
                          message: `¿Borrar «${req.titulo}» de la lista?`,
                          confirmLabel: "Borrar",
                          fn: async () => {
                            await mutar(() => borrarRequerimiento(token, p.id, req.id), "Requerimiento borrado.");
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
          </ul>
        )}
      </section>

      <form
        className={styles.panel}
        onSubmit={(e) => {
          e.preventDefault();
          void agregar(nuevo.titulo);
        }}
        aria-labelledby="req-nuevo"
        noValidate
      >
        <h3 id="req-nuevo" className={styles.panelTitle}>
          Agregar requerimiento
        </h3>
        {sugeridos.length ? (
          <div className={styles.chips} role="group" aria-label="Requerimientos frecuentes">
            {sugeridos.map((s) => (
              <button
                key={s}
                type="button"
                className={styles.filterBtn}
                disabled={ocupado}
                onClick={() => void agregar(s)}
              >
                + {s}
              </button>
            ))}
          </div>
        ) : null}
        <div className={styles.inlineForm}>
          <div>
            <label className={styles.fieldLabel} htmlFor="r-nuevo-t">
              Qué hace falta
            </label>
            <input
              id="r-nuevo-t"
              className={styles.input}
              value={nuevo.titulo}
              maxLength={240}
              onChange={(e) => setNuevo({ ...nuevo, titulo: e.target.value })}
              placeholder="Ej. Visto bueno de protección civil"
            />
          </div>
          <div>
            <label className={styles.fieldLabel} htmlFor="r-nuevo-r">
              Quién lo consigue
            </label>
            <PersonaSelect
              id="r-nuevo-r"
              value={nuevo.responsableId}
              onChange={(v) => setNuevo({ ...nuevo, responsableId: v })}
              personas={personas}
            />
          </div>
          <div>
            <label className={styles.fieldLabel} htmlFor="r-nuevo-f">
              Fecha límite
            </label>
            <input
              id="r-nuevo-f"
              className={styles.input}
              type="date"
              value={nuevo.dueDate}
              onChange={(e) => setNuevo({ ...nuevo, dueDate: e.target.value })}
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
