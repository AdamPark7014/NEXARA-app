"use client";

import Link from "next/link";
import { isActivityCompleted, isActivityInProgress } from "@/lib/activity-status";
import { formatoFecha, type Tono } from "@/lib/proyectos-api";
import { diasEntre } from "@/lib/proyecto-plan";
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

export default function SeccionActividades({ proyecto: p, hoy }: Pick<SeccionProps, "proyecto" | "hoy">) {
  const avance = p.resumen.avance;
  return (
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
        El avance del proyecto sale de aquí: cuenta las actividades cerradas contra el total. Las actividades se
        crean desde la pizarra y se ligan al proyecto.
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
            const atrasada = abierta && (diasEntre(a.fechaEntregaEsperada, hoy) ?? 0) > 0;
            return (
              <li key={a.id} className={styles.item}>
                <div className={styles.itemMain}>
                  <Link href={`/erp/actividades/${a.id}`} className={styles.itemTitle} style={{ color: "inherit" }}>
                    {a.anNumber ? `${a.anNumber} · ` : ""}
                    {a.titulo || "Actividad sin título"}
                  </Link>
                  <span className={styles.rowWrap}>
                    {[
                      a.responsable?.nombre ?? "Sin responsable",
                      a.branchName ? `Sitio: ${a.branchName}${a.branchNumber ? ` (${a.branchNumber})` : ""}` : null,
                      a.fechaEntregaEsperada ? `Entrega: ${formatoFecha(a.fechaEntregaEsperada)}` : null,
                      a.fechaFinalizacion ? `Cerrada: ${formatoFecha(a.fechaFinalizacion)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {atrasada ? <span className={`${styles.rowWrap} ${styles.vencido}`}>Pasó su fecha de entrega</span> : null}
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
  );
}
