"use client";

import Link from "next/link";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { ButtonLink, RecordSection, StatusBadge } from "@/components/base";
import { isActivityCompleted, isActivityInProgress } from "@/lib/activity-status";
import { evaluarSemaforoActividad, textoChipSemaforo } from "@/lib/actividad-tiempos";
import { formatoFecha, type Tono } from "@/lib/proyectos-api";
import ProgramarActividades from "./ProgramarActividades";
import { toneDe } from "./tono";
import type { SeccionProps } from "./tipos";
import styles from "./secciones.module.css";

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
    <div className={styles.pila}>
      <ProgramarActividades {...props} />
      <RecordSection
        title={
          <>
            Actividades del proyecto<span className={styles.conteo}>{p.activities.length}</span>
          </>
        }
        subtitle="El avance del proyecto sale de aquí: cuenta las actividades cerradas contra el total. Se programan arriba por etapa o se asignan desde la pizarra ligadas al proyecto."
        end={
          avance.total ? (
            <span className={styles.tenue}>
              {avance.abiertas} abiertas · {avance.cerradas} cerradas
            </span>
          ) : null
        }
      >
        {p.activities.length === 0 ? (
          <p className={styles.vacio}>
            Todavía no hay actividades ligadas a este proyecto. Mientras no las haya, el avance se mide con las etapas cumplidas
            del cronograma.
          </p>
        ) : (
          <ul className={styles.lista}>
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
              // Misma lectura que el borde de la pizarra: rojo/ámbar por tiempo; azul si aún no arranca.
              const franja = luz.semaforo === "rojo" ? "rojo" : luz.semaforo === "amarillo" ? "amarillo" : isActivityInProgress(a.estatus) ? "verde" : "azul";
              return (
                <li key={a.id} className={styles.fila} data-luz={franja}>
                  <div className={styles.principal}>
                    <Link href={`/erp/actividades/${a.id}`} className={styles.tituloFila}>
                      {a.anNumber ? `${a.anNumber} · ` : ""}
                      {a.titulo || "Actividad sin título"}
                    </Link>
                    <span className={styles.meta}>
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
                      <span className={`${styles.meta} ${atrasada ? styles.vencido : ""}`}>
                        {textoChipSemaforo(luz.semaforo, luz.minutosAtraso, luz.minutosParaVencer, luz.motivo)}
                      </span>
                    ) : null}
                  </div>
                  <div className={styles.acciones}>
                    <StatusBadge size="sm" label={a.estatus || "Pendiente"} tone={toneDe(tonoDeActividad(a.estatus))} />
                    <ButtonLink size="sm" variant="ghost" href={`/erp/actividades/${a.id}`} iconEnd={<ChevronRightRoundedIcon />}>
                      Ver actividad
                    </ButtonLink>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </RecordSection>
    </div>
  );
}
