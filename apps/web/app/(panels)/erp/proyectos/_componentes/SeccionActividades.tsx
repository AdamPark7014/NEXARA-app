"use client";

import Link from "next/link";
import { isActivityCompleted, isActivityInProgress } from "@/lib/activity-status";
import { colorBordeActividad, evaluarSemaforoActividad, textoChipSemaforo } from "@/lib/actividad-tiempos";
import { formatoFecha, type Tono } from "@/lib/proyectos-api";
import ProgramarActividades from "./ProgramarActividades";
import { claseTono } from "./tono";
import type { SeccionProps } from "./tipos";
import styles from "../proyectos.module.css";

function tonoDeActividad(estatus?: string | null): Tono {
  if (!estatus) return "neutral";
  if (/cancel/i.test(estatus)) return "neutral";
  if (isActivityCompleted(estatus)) return "ok";
  if (isActivityInProgress(estatus)) return "info";
  return "neutral";
}

export default function SeccionActividades(props: SeccionProps) {
  const { proyecto: p, hoy } = props;
  const avance = p.resumen.avance;
  const etapaDe = (id?: number | null) => (id ? (p.milestones.find((h) => h.id === id)?.name ?? null) : null);
  return (
    <div className={styles.gantt} style={{ gap: 12 }}>
      <ProgramarActividades {...props} />
      <section className={styles.panel} aria-labelledby="act-lista">
        <div className={styles.panelHead}>
          <h3 id="act-lista" className={styles.panelTitle}>
            Actividades del proyecto ({p.activities.length})
          </h3>
          {avance.total ? (
            <span className={styles.progressLabel}>
              {avance.abiertas} abiertas · {avance.cerradas} cerradas
            </span>
          ) : null}
        </div>
        <p className={styles.hint}>
          El avance del proyecto sale de aquí: cuenta las actividades cerradas contra el total. Se programan arriba
          por etapa o se asignan desde la pizarra ligadas al proyecto.
        </p>
        {p.activities.length === 0 ? (
          <div className={styles.empty}>
            Todavía no hay actividades ligadas a este proyecto. Mientras no las haya, el avance se mide con las etapas
            cumplidas del cronograma.
          </div>
        ) : (
          <ul className={styles.items}>
            {p.activities.map((a) => {
              const abierta = !isActivityCompleted(a.estatus) && !/cancel/i.test(a.estatus ?? "");
              const luz = evaluarSemaforoActividad({
                fechaInicio: a.fechaInicio,
                fechaEntregaEsperada: a.fechaEntregaEsperada,
                estatus: a.estatus,
                periodoEstado: a.periodo?.estado,
                ahora: new Date(`${hoy}T12:00:00`),
              });
              const atrasada = abierta && luz.semaforo === "rojo";
              const etapa = etapaDe(a.projectMilestoneId);
              return (
                <li key={a.id} className={styles.item} style={{ boxShadow: `inset 4px 0 0 ${colorBordeActividad(luz.semaforo, isActivityInProgress(a.estatus))}` }}>
                  <div className={styles.itemMain}>
                    <Link href={`/erp/actividades/${a.id}`} className={styles.itemTitle} style={{ color: "inherit" }}>
                      {a.anNumber ? `${a.anNumber} · ` : ""}
                      {a.titulo || "Actividad sin título"}
                    </Link>
                    <span className={styles.rowWrap}>
                      {[
                        a.responsable?.nombre ?? "Sin responsable",
                        etapa ? `Etapa: ${etapa}` : null,
                        a.branchName ? `Sitio: ${a.branchName}${a.branchNumber ? ` (${a.branchNumber})` : ""}` : null,
                        a.periodo
                          ? a.periodo.etiqueta
                          : a.fechaEntregaEsperada
                            ? `Entrega: ${formatoFecha(a.fechaEntregaEsperada)}`
                            : null,
                        a.fechaFinalizacion ? `Cerrada: ${formatoFecha(a.fechaFinalizacion)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {atrasada || luz.semaforo === "amarillo" ? (
                      <span className={`${styles.rowWrap} ${atrasada ? styles.vencido : ""}`}>
                        {textoChipSemaforo(luz.semaforo, luz.minutosAtraso, luz.minutosParaVencer, luz.motivo)}
                      </span>
                    ) : null}
                  </div>
                  <div className={styles.itemActions}>
                    <span className={claseTono(tonoDeActividad(a.estatus))}>{a.estatus || "Pendiente"}</span>
                    <Link className={styles.smallBtn} href={`/erp/actividades/${a.id}`}>
                      Ver actividad
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
