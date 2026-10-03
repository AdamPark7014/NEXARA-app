"use client";

import { useState, type FormEvent } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { Alert, Button, Checkbox, DateInput, Field, Input, Progress, RecordSection, Select } from "@/components/base";
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
import styles from "./secciones.module.css";

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
    <div className={styles.pila}>
      <RecordSection
        title="Lo que hace falta para entregar"
        subtitle={r.total ? `${r.cumplidos} de ${r.total} listos` : "Sin requerimientos"}
        end={
          r.total ? (
            <Progress
              value={r.porcentaje ?? 0}
              max={100}
              tone="success"
              label={`${r.porcentaje ?? 0} %`}
              ariaLabel="Requerimientos listos"
            />
          ) : null
        }
      >
        {p.requirements.length === 0 ? (
          <p className={styles.vacio}>Sin requerimientos todavía. Agrega los papeles, permisos o datos que hacen falta.</p>
        ) : (
          <ul className={styles.lista}>
            {p.requirements.map((req) => {
              const listo = req.status === "CUMPLIDO";
              const noAplica = req.status === "NO_APLICA";
              const vencido = !listo && !noAplica && (diasEntre(req.dueDate, hoy) ?? 0) > 0;
              if (editandoId === req.id && edicion) {
                return (
                  <li key={req.id} className={`${styles.fila} ${styles.filaEdicion}`}>
                    <form onSubmit={(e) => void guardar(e, req)} className={styles.edicion} noValidate aria-label={`Editar «${req.titulo}»`}>
                      <div className={styles.campos} data-cols="3">
                        <Field label="Qué hace falta">
                          <Input id={`r-t-${req.id}`} value={edicion.titulo} maxLength={240} onChange={(e) => setEdicion({ ...edicion, titulo: e.target.value })} />
                        </Field>
                        <Field label="Quién lo consigue">
                          <PersonaSelect
                            id={`r-r-${req.id}`}
                            value={edicion.responsableId}
                            onChange={(v) => setEdicion({ ...edicion, responsableId: v })}
                            personas={personas}
                          />
                        </Field>
                        <Field label="Fecha límite">
                          <DateInput id={`r-f-${req.id}`} value={edicion.dueDate} onChange={(e) => setEdicion({ ...edicion, dueDate: e.target.value })} />
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
                );
              }
              return (
                <li key={req.id} className={styles.fila}>
                  <div className={styles.principal}>
                    <Checkbox
                      checked={listo}
                      disabled={ocupado || noAplica}
                      onChange={() => cambiarEstado(req, listo ? "PENDIENTE" : "CUMPLIDO")}
                      label={<span className={listo || noAplica ? styles.hecho : undefined}>{req.titulo}</span>}
                      description={
                        <>
                          {req.responsable ? req.responsable.nombre : "Sin responsable"}
                          {req.dueDate ? ` · Límite: ${formatoFecha(req.dueDate)}` : ""}
                          {listo && req.completedAt ? ` · Listo el ${formatoFecha(req.completedAt)}` : ""}
                          {vencido ? <span className={`${styles.vencido} ${styles.datoSub}`}>{textoPlazo(req.dueDate, hoy)}</span> : null}
                        </>
                      }
                    />
                  </div>
                  <div className={styles.acciones}>
                    <Select
                      aria-label={`Estado de «${req.titulo}»`}
                      controlSize="sm"
                      wrapperClassName={styles.selectCompacto}
                      value={req.status}
                      disabled={ocupado}
                      onChange={(e) => cambiarEstado(req, e.target.value as EstadoRequerimiento)}
                    >
                      {ESTADOS_REQUERIMIENTO.map((s) => (
                        <option key={s} value={s}>
                          {ESTADO_REQUERIMIENTO_LABEL[s]}
                        </option>
                      ))}
                    </Select>
                    <Button
                      size="sm"
                      variant="ghost"
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
                    </Button>
                    <Button
                      size="sm"
                      variant="danger-ghost"
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
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </RecordSection>

      <form
        className={styles.alta}
        onSubmit={(e) => {
          e.preventDefault();
          void agregar(nuevo.titulo);
        }}
        aria-labelledby="req-nuevo"
        noValidate
      >
        <h3 id="req-nuevo" className={styles.altaTitulo}>
          Agregar requerimiento
        </h3>
        {sugeridos.length ? (
          <div className={styles.chips} role="group" aria-label="Requerimientos frecuentes">
            <span className={styles.chipsTitulo}>Frecuentes</span>
            {sugeridos.map((s) => (
              <Button key={s} size="sm" variant="tonal" disabled={ocupado} iconStart={<AddRoundedIcon />} onClick={() => void agregar(s)}>
                {s}
              </Button>
            ))}
          </div>
        ) : null}
        <div className={styles.campos}>
          <Field label="Qué hace falta">
            <Input
              id="r-nuevo-t"
              value={nuevo.titulo}
              maxLength={240}
              onChange={(e) => setNuevo({ ...nuevo, titulo: e.target.value })}
              placeholder="Ej. Visto bueno de protección civil"
            />
          </Field>
          <Field label="Quién lo consigue">
            <PersonaSelect id="r-nuevo-r" value={nuevo.responsableId} onChange={(v) => setNuevo({ ...nuevo, responsableId: v })} personas={personas} />
          </Field>
          <Field label="Fecha límite">
            <DateInput id="r-nuevo-f" value={nuevo.dueDate} onChange={(e) => setNuevo({ ...nuevo, dueDate: e.target.value })} />
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
