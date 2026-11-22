'use client';

import styles from './horarios.module.css';
import { formatearRangoHorario, etiqFuenteHorario } from '@/lib/horarios-api';

export type HorarioHoyFichaProps = {
  horario?: {
    horaEntrada: string;
    horaSalida: string;
    fuente?: string | null;
    motivo?: string | null;
    graciaMin?: number | null;
  } | null;
  cargando?: boolean;
  onExtender?: () => void;
  onRecortar?: () => void;
  puedeEditar?: boolean;
};

export function HorarioHoyFicha({
  horario,
  cargando = false,
  onExtender,
  onRecortar,
  puedeEditar = false,
}: HorarioHoyFichaProps) {
  if (cargando) {
    return <div className={styles.meta}>Cargando horario…</div>;
  }
  if (!horario) {
    return <div className={styles.meta}>Sin horario</div>;
  }
  const gracia =
    typeof horario.graciaMin === "number" && horario.graciaMin > 0
      ? ` · gracia ${horario.graciaMin} min`
      : "";
  return (
    <div className={styles.ficha}>
      <span className={styles.rango}>{formatearRangoHorario(horario.horaEntrada, horario.horaSalida)}</span>
      <span className={styles.meta}>
        {etiqFuenteHorario(horario.fuente)}
        {gracia}
      </span>
      {horario.motivo ? <span className={styles.meta}>{horario.motivo}</span> : null}
      {puedeEditar && (onExtender || onRecortar) ? (
        <div className={styles.acciones}>
          {onExtender ? (
            <button type="button" onClick={onExtender}>
              Extender
            </button>
          ) : null}
          {onRecortar ? (
            <button type="button" onClick={onRecortar}>
              Terminar antes
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default HorarioHoyFicha;