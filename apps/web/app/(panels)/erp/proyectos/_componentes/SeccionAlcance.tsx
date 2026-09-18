"use client";

import { useState, type FormEvent } from "react";
import {
  TIPOS_ALCANCE,
  TIPO_ALCANCE_AYUDA,
  TIPO_ALCANCE_LABEL,
  actualizarAlcance,
  agregarAlcance,
  borrarAlcance,
  importarAlcanceDeCotizacion,
  type RenglonAlcance,
  type TipoAlcance,
} from "@/lib/proyectos-api";
import type { SeccionProps } from "./tipos";
import styles from "../proyectos.module.css";

type Edicion = { kind: TipoAlcance; titulo: string; detalle: string };

export default function SeccionAlcance({ proyecto: p, token, ocupado, mutar, confirmar }: SeccionProps) {
  const [nuevo, setNuevo] = useState<Edicion>({ kind: "ENTREGABLE", titulo: "", detalle: "" });
  const [errorNuevo, setErrorNuevo] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);

  async function agregar(e: FormEvent) {
    e.preventDefault();
    if (nuevo.titulo.trim().length < 3) {
      setErrorNuevo("Escribe al menos 3 letras.");
      return;
    }
    setErrorNuevo(null);
    const ok = await mutar(
      () =>
        agregarAlcance(token, p.id, {
          kind: nuevo.kind,
          titulo: nuevo.titulo.trim(),
          ...(nuevo.detalle.trim() ? { detalle: nuevo.detalle.trim() } : {}),
        }),
      "Renglón de alcance agregado.",
    );
    if (ok) setNuevo({ kind: nuevo.kind, titulo: "", detalle: "" });
  }

  async function guardar(e: FormEvent, item: RenglonAlcance) {
    e.preventDefault();
    if (!edicion) return;
    if (edicion.titulo.trim().length < 3) {
      setErrorEdicion("Escribe al menos 3 letras.");
      return;
    }
    const cambios: Parameters<typeof actualizarAlcance>[3] = {};
    if (edicion.kind !== item.kind) cambios.kind = edicion.kind;
    if (edicion.titulo.trim() !== item.titulo) cambios.titulo = edicion.titulo.trim();
    if (edicion.detalle.trim() !== (item.detalle ?? "")) cambios.detalle = edicion.detalle.trim() || null;
    if (!Object.keys(cambios).length) {
      setEditandoId(null);
      return;
    }
    const ok = await mutar(() => actualizarAlcance(token, p.id, item.id, cambios), "Alcance actualizado.");
    if (ok) setEditandoId(null);
  }

  const folio = p.cotizacion ? p.cotizacion.folioEnviado || p.cotizacion.quoteNumber : null;

  return (
    <div className={styles.gantt} style={{ gap: 12 }}>
      {p.scopeSummary ? (
        <section className={styles.panel} aria-label="El alcance en una frase">
          <span className={styles.fieldLabel}>El alcance en una frase</span>
          <p className={styles.texto}>{p.scopeSummary}</p>
        </section>
      ) : null}

      {p.cotizacion ? (
        <section className={styles.panel} aria-labelledby="alc-cotizacion">
          <div className={styles.panelHead}>
            <div>
              <h3 id="alc-cotizacion" className={styles.panelTitle}>
                Alcance de la cotización {folio}
              </h3>
              <p className={styles.hint}>
                Copia los bloques de alcance de la cotización como entregables. Si ya los trajiste, no se duplican.
              </p>
            </div>
            <button
              type="button"
              className={styles.smallBtn}
              disabled={ocupado}
              onClick={() => void mutar(() => importarAlcanceDeCotizacion(token, p.id), "Alcance de la cotización al día.")}
            >
              Traer alcance de la cotización
            </button>
          </div>
        </section>
      ) : null}

      {TIPOS_ALCANCE.map((kind) => {
        const renglones = p.scopeItems.filter((s) => s.kind === kind);
        return (
          <section key={kind} className={styles.panel} aria-labelledby={`alc-${kind}`}>
            <div>
              <h3 id={`alc-${kind}`} className={styles.panelTitle}>
                {TIPO_ALCANCE_LABEL[kind]} ({renglones.length})
              </h3>
              <p className={styles.hint}>{TIPO_ALCANCE_AYUDA[kind]}</p>
            </div>
            {renglones.length === 0 ? (
              <p className={styles.sub} style={{ margin: 0 }}>
                Nada capturado todavía.
              </p>
            ) : (
              <ul className={styles.items}>
                {renglones.map((s) =>
                  editandoId === s.id && edicion ? (
                    <li key={s.id} className={styles.item} style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
                      <form onSubmit={(e) => void guardar(e, s)} className={styles.gantt} noValidate aria-label={`Editar «${s.titulo}»`}>
                        <div className={styles.inlineForm3}>
                          <div>
                            <label className={styles.fieldLabel} htmlFor={`s-k-${s.id}`}>
                              Tipo
                            </label>
                            <select
                              id={`s-k-${s.id}`}
                              className={styles.select}
                              value={edicion.kind}
                              onChange={(e) => setEdicion({ ...edicion, kind: e.target.value as TipoAlcance })}
                            >
                              {TIPOS_ALCANCE.map((k) => (
                                <option key={k} value={k}>
                                  {TIPO_ALCANCE_LABEL[k]}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={styles.fieldLabel} htmlFor={`s-t-${s.id}`}>
                              Qué
                            </label>
                            <input
                              id={`s-t-${s.id}`}
                              className={styles.input}
                              value={edicion.titulo}
                              maxLength={240}
                              onChange={(e) => setEdicion({ ...edicion, titulo: e.target.value })}
                            />
                          </div>
                        </div>
                        <div>
                          <label className={styles.fieldLabel} htmlFor={`s-d-${s.id}`}>
                            Detalle
                          </label>
                          <textarea
                            id={`s-d-${s.id}`}
                            className={styles.textarea}
                            value={edicion.detalle}
                            onChange={(e) => setEdicion({ ...edicion, detalle: e.target.value })}
                          />
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
                  ) : (
                    <li key={s.id} className={styles.item}>
                      <div className={styles.itemMain}>
                        <span className={styles.itemTitle}>{s.titulo}</span>
                        {s.detalle ? <span className={styles.rowWrap}>{s.detalle}</span> : null}
                        {s.origenClave ? <span className={styles.rowSub}>Viene de la cotización</span> : null}
                      </div>
                      <div className={styles.itemActions}>
                        <button
                          type="button"
                          className={styles.smallBtn}
                          disabled={ocupado}
                          onClick={() => {
                            setEditandoId(s.id);
                            setErrorEdicion(null);
                            setEdicion({ kind: s.kind, titulo: s.titulo, detalle: s.detalle ?? "" });
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
                              title: "Quitar del alcance",
                              message: `¿Quitar «${s.titulo}» del alcance?`,
                              confirmLabel: "Quitar",
                              fn: async () => {
                                await mutar(() => borrarAlcance(token, p.id, s.id), "Renglón quitado del alcance.");
                              },
                            })
                          }
                        >
                          Quitar
                        </button>
                      </div>
                    </li>
                  ),
                )}
              </ul>
            )}
          </section>
        );
      })}

      <form className={styles.panel} onSubmit={agregar} aria-labelledby="alc-nuevo" noValidate>
        <h3 id="alc-nuevo" className={styles.panelTitle}>
          Agregar al alcance
        </h3>
        <div className={styles.inlineForm}>
          <div>
            <label className={styles.fieldLabel} htmlFor="s-nuevo-t">
              Qué
            </label>
            <input
              id="s-nuevo-t"
              className={styles.input}
              value={nuevo.titulo}
              maxLength={240}
              onChange={(e) => setNuevo({ ...nuevo, titulo: e.target.value })}
              placeholder="Ej. Memoria técnica con planos finales"
            />
          </div>
          <div>
            <label className={styles.fieldLabel} htmlFor="s-nuevo-k">
              Tipo
            </label>
            <select
              id="s-nuevo-k"
              className={styles.select}
              value={nuevo.kind}
              onChange={(e) => setNuevo({ ...nuevo, kind: e.target.value as TipoAlcance })}
            >
              {TIPOS_ALCANCE.map((k) => (
                <option key={k} value={k}>
                  {TIPO_ALCANCE_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={styles.fieldLabel} htmlFor="s-nuevo-d">
              Detalle (opcional)
            </label>
            <input
              id="s-nuevo-d"
              className={styles.input}
              value={nuevo.detalle}
              onChange={(e) => setNuevo({ ...nuevo, detalle: e.target.value })}
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
