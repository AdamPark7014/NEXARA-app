"use client";

import { useState, type FormEvent } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { Alert, Button, DateInput, Field, Input, RecordSection, Select, StatusBadge } from "@/components/base";
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
import { toneDe } from "./tono";
import type { SeccionProps } from "./tipos";
import styles from "./secciones.module.css";

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

  const cumplidas = p.milestones.filter((h) => h.status === "CUMPLIDO" || h.actualDate).length;

  return (
    <div className={styles.pila}>
      <RecordSection title="Cronograma" subtitle="Cada etapa va desde que termina la anterior hasta su fecha planeada.">
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
      </RecordSection>

      <RecordSection
        title={
          <>
            Etapas<span className={styles.conteo}>{p.milestones.length}</span>
          </>
        }
        subtitle={p.milestones.length ? `${cumplidas} de ${p.milestones.length} cumplidas` : undefined}
      >
        {p.milestones.length === 0 ? (
          <p className={styles.vacio}>
            Este proyecto todavía no tiene etapas. Agrega la primera abajo: con etapas, el avance se mide aunque aún no haya
            actividades.
          </p>
        ) : (
          <ol className={styles.lista}>
            {p.milestones.map((h, i) => {
              const est = estadoVisible(h, hoy);
              const cumplida = est.texto === "Cumplida";
              const cancelada = h.status === "CANCELADO";
              if (editandoId === h.id && edicion) {
                return (
                  <li key={h.id} className={`${styles.fila} ${styles.filaEdicion}`}>
                    <form onSubmit={(e) => void guardarEdicion(e, h)} className={styles.edicion} noValidate aria-label={`Editar la etapa ${h.name}`}>
                      <div className={styles.campos} data-cols="3">
                        <Field label="Nombre">
                          <Input id={`h-n-${h.id}`} value={edicion.name} maxLength={200} onChange={(e) => setEdicion({ ...edicion, name: e.target.value })} />
                        </Field>
                        <Field label="Responsable">
                          <PersonaSelect
                            id={`h-r-${h.id}`}
                            value={edicion.responsableId}
                            onChange={(v) => setEdicion({ ...edicion, responsableId: v })}
                            personas={personas}
                          />
                        </Field>
                        <Field label="Estado">
                          <Select
                            id={`h-s-${h.id}`}
                            value={edicion.status}
                            onChange={(e) => setEdicion({ ...edicion, status: e.target.value as EstadoHito })}
                          >
                            {ESTADOS_HITO.map((s) => (
                              <option key={s} value={s}>
                                {ESTADO_HITO_LABEL[s]}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Fecha planeada">
                          <DateInput id={`h-p-${h.id}`} value={edicion.plannedDate} onChange={(e) => setEdicion({ ...edicion, plannedDate: e.target.value })} />
                        </Field>
                        <Field label="Fecha real (se cumplió)">
                          <DateInput id={`h-a-${h.id}`} value={edicion.actualDate} onChange={(e) => setEdicion({ ...edicion, actualDate: e.target.value })} />
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
                <li key={h.id} className={styles.fila}>
                  <div className={styles.principal}>
                    <span className={styles.tituloFila}>
                      <span className={cumplida ? styles.hecho : undefined}>
                        {i + 1}. {h.name}
                      </span>
                      <StatusBadge size="sm" label={est.texto} tone={toneDe(est.tono)} />
                    </span>
                    <span className={styles.meta}>
                      Plan: {h.plannedDate ? formatoFecha(h.plannedDate) : "sin fecha"}
                      {h.actualDate ? ` · Real: ${formatoFecha(h.actualDate)}` : ""}
                      {h.responsable ? ` · ${h.responsable.nombre}` : " · Sin responsable"}
                    </span>
                    {!cumplida && !cancelada && h.plannedDate ? (
                      <span className={`${styles.meta} ${est.tono === "peligro" ? styles.vencido : ""}`}>{textoPlazo(h.plannedDate, hoy)}</span>
                    ) : null}
                  </div>
                  <div className={styles.acciones}>
                    {!cumplida && !cancelada ? (
                      <Button
                        size="sm"
                        variant="tonal"
                        disabled={ocupado}
                        onClick={() =>
                          void mutar(() => actualizarHito(token, p.id, h.id, { actualDate: hoy }), `«${h.name}» marcada como cumplida.`)
                        }
                      >
                        Marcar cumplida
                      </Button>
                    ) : null}
                    {h.status === "PENDIENTE" && !cumplida ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={ocupado}
                        onClick={() => void mutar(() => actualizarHito(token, p.id, h.id, { status: "EN_CURSO" }), `«${h.name}» en curso.`)}
                      >
                        Empezar
                      </Button>
                    ) : null}
                    {cumplida ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={ocupado}
                        onClick={() =>
                          void mutar(
                            () => actualizarHito(token, p.id, h.id, { actualDate: null, status: "PENDIENTE" }),
                            `«${h.name}» regresó a pendiente.`,
                          )
                        }
                      >
                        Desmarcar
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => abrirEdicion(h)}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="danger-ghost"
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
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </RecordSection>

      <form className={styles.alta} onSubmit={agregar} aria-labelledby="crono-nueva" noValidate>
        <h3 id="crono-nueva" className={styles.altaTitulo}>
          Agregar etapa
        </h3>
        <div className={styles.campos}>
          <Field label="Nombre">
            <Input
              id="h-nueva-nombre"
              value={nuevo.name}
              maxLength={200}
              onChange={(e) => setNuevo({ ...nuevo, name: e.target.value })}
              placeholder="Ej. Pruebas y puesta en marcha"
            />
          </Field>
          <Field label="Fecha planeada">
            <DateInput id="h-nueva-fecha" value={nuevo.plannedDate} onChange={(e) => setNuevo({ ...nuevo, plannedDate: e.target.value })} />
          </Field>
          <Field label="Responsable">
            <PersonaSelect id="h-nueva-resp" value={nuevo.responsableId} onChange={(v) => setNuevo({ ...nuevo, responsableId: v })} personas={personas} />
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
