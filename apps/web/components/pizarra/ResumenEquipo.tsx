"use client";

import { resumenEquipo } from "@/components/pizarra/equipo-estado";
import type { TeamBoardUser } from "@/lib/team-board-api";
import s from "./ResumenEquipo.module.css";

/**
 * Las tres cifras de «Mi equipo»: trabajando, con retraso, libres.
 *
 * Regla 7: sin nadie en el tablero, una fila de ceros no informa y no se pinta;
 * lo que ayuda ahí es el vacío con el primer paso, no tres ceros encima.
 */
export default function ResumenEquipo({ users }: { users: readonly TeamBoardUser[] }) {
  if (users.length === 0) return null;
  const r = resumenEquipo(users);
  const desgloseRetraso = `${r.atrasados} pasados de su fecha máxima · ${r.sinActividad} sin nada abierto`;
  return (
    <div className={s.fila} aria-label="Resumen del equipo">
      <div className={[s.celda, s.trabajando].join(" ")} title="Con una actividad en curso">
        <span className={s.etiqueta}>Trabajando</span>
        <span className={s.cifra}>{r.trabajando}</span>
        <span className={s.pista}>de {r.total} en el equipo</span>
      </div>
      <div className={[s.celda, s.retraso].join(" ")} title={desgloseRetraso}>
        <span className={s.etiqueta}>Con retraso</span>
        <span className={s.cifra}>{r.retraso}</span>
        <span className={s.pista}>{r.atrasados} atrasados · {r.sinActividad} sin nada</span>
      </div>
      <div className={[s.celda, s.libres].join(" ")} title="Ya cerraron lo que tenían">
        <span className={s.etiqueta}>Libres</span>
        <span className={s.cifra}>{r.libres}</span>
        <span className={s.pista}>terminaron lo suyo</span>
      </div>
    </div>
  );
}
