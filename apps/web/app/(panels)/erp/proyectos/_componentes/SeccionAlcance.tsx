"use client";

import { useState, type FormEvent } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import { Alert, Badge, Button, Field, Input, RecordSection, Select, Textarea } from "@/components/base";
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
import styles from "./secciones.module.css";

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
    <div className={styles.pila}>
      {p.scopeSummary ? (
        <section aria-label="El alcance en una frase" className={styles.bloque}>
          <span className={styles.bloqueEtiqueta}>El alcance en una frase</span>
          <p className={styles.texto}>{p.scopeSummary}</p>
        </section>
      ) : null}

      {p.cotizacion ? (
        <Alert
          tone="info"
          title={`Alcance de la cotización ${folio}`}
          action={
            <Button
              size="sm"
              variant="tonal"
              disabled={ocupado}
              iconStart={<DownloadRoundedIcon />}
              onClick={() => void mutar(() => importarAlcanceDeCotizacion(token, p.id), "Alcance de la cotización al día.")}
            >
              Traer alcance de la cotización
            </Button>
          }
        >
          {" "}
          Copia los bloques de alcance de la cotización como entregables. Si ya los trajiste, no se duplican.
        </Alert>
      ) : null}

      {TIPOS_ALCANCE.map((kind) => {
        const renglones = p.scopeItems.filter((s) => s.kind === kind);
        return (
          <RecordSection
            key={kind}
            title={
              <>
                {TIPO_ALCANCE_LABEL[kind]}
                <span className={styles.conteo}>{renglones.length}</span>
              </>
            }
            subtitle={TIPO_ALCANCE_AYUDA[kind]}
          >
            {renglones.length === 0 ? (
              <p className={styles.vacio}>Nada capturado todavía.</p>
            ) : (
              <ul className={styles.lista}>
                {renglones.map((s) =>
                  editandoId === s.id && edicion ? (
                    <li key={s.id} className={`${styles.fila} ${styles.filaEdicion}`}>
                      <form onSubmit={(e) => void guardar(e, s)} className={styles.edicion} noValidate aria-label={`Editar «${s.titulo}»`}>
                        <div className={styles.campos} data-cols="2">
                          <Field label="Tipo">
                            <Select
                              id={`s-k-${s.id}`}
                              value={edicion.kind}
                              onChange={(e) => setEdicion({ ...edicion, kind: e.target.value as TipoAlcance })}
                            >
                              {TIPOS_ALCANCE.map((k) => (
                                <option key={k} value={k}>
                                  {TIPO_ALCANCE_LABEL[k]}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label="Qué">
                            <Input id={`s-t-${s.id}`} value={edicion.titulo} maxLength={240} onChange={(e) => setEdicion({ ...edicion, titulo: e.target.value })} />
                          </Field>
                          <Field label="Detalle" fullWidth>
                            <Textarea id={`s-d-${s.id}`} rows={3} value={edicion.detalle} onChange={(e) => setEdicion({ ...edicion, detalle: e.target.value })} />
                          </Field>
                        </div>
                        {errorEdicion ? (
                          <Alert tone="danger" role="alert" dense>
                            {errorEdicion}
                          </Alert>
                        ) : null}
                        <div className={styles.botonera}>
                          <Button variant="tertiary" onClick={() => setEditandoId(null)} disabled={ocupado}>
                            Cancelar
                          </Button>
                          <Button type="submit" variant="tonal" loading={ocupado}>
                            Guardar
                          </Button>
                        </div>
                      </form>
                    </li>
                  ) : (
                    <li key={s.id} className={styles.fila}>
                      <div className={styles.principal}>
                        <span className={styles.tituloFila}>
                          {s.titulo}
                          {s.origenClave ? (
                            <Badge tone="info" size="sm">
                              Viene de la cotización
                            </Badge>
                          ) : null}
                        </span>
                        {s.detalle ? <span className={styles.meta}>{s.detalle}</span> : null}
                      </div>
                      <div className={styles.acciones}>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={ocupado}
                          onClick={() => {
                            setEditandoId(s.id);
                            setErrorEdicion(null);
                            setEdicion({ kind: s.kind, titulo: s.titulo, detalle: s.detalle ?? "" });
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="danger-ghost"
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
                        </Button>
                      </div>
                    </li>
                  ),
                )}
              </ul>
            )}
          </RecordSection>
        );
      })}

      <form className={styles.alta} onSubmit={agregar} aria-labelledby="alc-nuevo" noValidate>
        <h3 id="alc-nuevo" className={styles.altaTitulo}>
          Agregar al alcance
        </h3>
        <div className={styles.campos}>
          <Field label="Qué">
            <Input
              id="s-nuevo-t"
              value={nuevo.titulo}
              maxLength={240}
              onChange={(e) => setNuevo({ ...nuevo, titulo: e.target.value })}
              placeholder="Ej. Memoria técnica con planos finales"
            />
          </Field>
          <Field label="Tipo">
            <Select id="s-nuevo-k" value={nuevo.kind} onChange={(e) => setNuevo({ ...nuevo, kind: e.target.value as TipoAlcance })}>
              {TIPOS_ALCANCE.map((k) => (
                <option key={k} value={k}>
                  {TIPO_ALCANCE_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Detalle (opcional)">
            <Input id="s-nuevo-d" value={nuevo.detalle} onChange={(e) => setNuevo({ ...nuevo, detalle: e.target.value })} />
          </Field>
          <Button type="submit" variant="tonal" disabled={ocupado} iconStart={<AddRoundedIcon />}>
            Agregar
          </Button>
        </div>
        {errorNuevo ? (
          <Alert tone="danger" role="alert" dense>
            {errorNuevo}
          </Alert>
        ) : null}
      </form>
    </div>
  );
}
