"use client";

import type { ReactNode } from "react";
import { resumenEquipo, type EstadoAro } from "@/components/pizarra/equipo-estado";
import type { TeamBoardUser } from "@/lib/team-board-api";
import s from "./ResumenEquipo.module.css";

export type FiltroEquipo = EstadoAro | "todos";

/**
 * Las tres cifras de «Mi equipo»: trabajando, con retraso, libres.
 *
 * Con `onFiltro` cada cifra es un filtro (y aparece «Todos» para volver).
 *
 * Regla 7: sin nadie en el tablero, una fila de ceros no informa y no se pinta;
 * lo que ayuda ahí es el vacío con el primer paso, no tres ceros encima.
 */
export default function ResumenEquipo({
  users,
  filtro = "todos",
  onFiltro,
}: {
  users: readonly TeamBoardUser[];
  filtro?: FiltroEquipo;
  onFiltro?: (f: FiltroEquipo) => void;
}) {
  if (users.length === 0) return null;
  const r = resumenEquipo(users);
  const desgloseRetraso = `${r.atrasados} pasados de su fecha máxima · ${r.sinActividad} sin nada abierto`;

  const celda = (id: FiltroEquipo, clase: string, title: string, children: ReactNode) => {
    const className = [s.celda, clase, onFiltro ? s.boton : "", onFiltro && filtro === id ? s.activa : ""]
      .filter(Boolean)
      .join(" ");
    if (!onFiltro) {
      return (
        <div className={className} title={title}>
          {children}
        </div>
      );
    }
    return (
      <button
        type="button"
        className={className}
        title={title}
        aria-pressed={filtro === id}
        onClick={() => onFiltro(filtro === id && id !== "todos" ? "todos" : id)}
      >
        {children}
      </button>
    );
  };

  return (
    <div
      className={[s.fila, onFiltro ? s.filaFiltro : ""].filter(Boolean).join(" ")}
      role={onFiltro ? "group" : undefined}
      aria-label={onFiltro ? "Filtrar al equipo por estado" : "Resumen del equipo"}
    >
      {onFiltro
        ? celda(
            "todos",
            s.todos,
            "Ver a todo el equipo",
            <>
              <span className={s.etiqueta}>Todos</span>
              <span className={s.cifra}>{r.total}</span>
              <span className={s.pista}>en el equipo</span>
            </>,
          )
        : null}
      {celda(
        "trabajando",
        s.trabajando,
        "Con una actividad en curso",
        <>
          <span className={s.etiqueta}>Trabajando</span>
          <span className={s.cifra}>{r.trabajando}</span>
          <span className={s.pista}>de {r.total} en el equipo</span>
        </>,
      )}
      {celda(
        "retraso",
        s.retraso,
        desgloseRetraso,
        <>
          <span className={s.etiqueta}>Con retraso</span>
          <span className={s.cifra}>{r.retraso}</span>
          <span className={s.pista}>
            {r.atrasados} atrasados · {r.sinActividad} sin nada
          </span>
        </>,
      )}
      {celda(
        "libre",
        s.libres,
        "Ya cerraron lo que tenían",
        <>
          <span className={s.etiqueta}>Libres</span>
          <span className={s.cifra}>{r.libres}</span>
          <span className={s.pista}>terminaron lo suyo</span>
        </>,
      )}
    </div>
  );
}
