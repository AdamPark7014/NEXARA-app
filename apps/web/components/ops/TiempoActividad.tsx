"use client";

/**
 * Detalle de actividad · tarjeta «Tiempo» (28-10, propuesta UI/UX aprobada): lo trabajado contra
 * lo planeado y el tope, con un anillo que da la vuelta en el plan. Las cuentas son de
 * `medidorDeTiempo` (`lib/actividad-tiempos.ts`).
 */
import { formatoMinutos, medidorDeTiempo } from "@/lib/actividad-tiempos";
import s from "./TiempoActividad.module.css";

const R = 34;
const C = 2 * Math.PI * R;

export default function TiempoActividad({
  minutosPlan,
  minutosReales,
  tiempoMaximoMin,
  enCurso = false,
}: {
  minutosPlan?: number | null;
  minutosReales?: number | null;
  tiempoMaximoMin?: number | null;
  enCurso?: boolean;
}) {
  const m = medidorDeTiempo({ minutosPlan, minutosReales, tiempoMaximoMin });
  if (m.estado === "sin_plan" && m.real === 0) return null;
  const vuelta = Math.min(1, m.avance ?? 0);
  const etiqueta = m.plan != null ? `${formatoMinutos(m.real) ?? "0 min"} de ${formatoMinutos(m.plan)} planeadas: ${m.texto}` : m.texto;
  return (
    <section className={s.tarjeta} data-estado={m.estado} aria-label="Tiempo de la actividad">
      <h2 className={s.titulo}>Tiempo{enCurso ? <span className={s.vivo}>en curso</span> : null}</h2>
      <div className={s.cuerpo}>
        {m.plan != null ? (
          <svg className={s.anillo} width="84" height="84" viewBox="0 0 84 84" role="img" aria-label={etiqueta}>
            <circle cx="42" cy="42" r={R} fill="none" className={s.pistaAnillo} strokeWidth="9" />
            <circle
              cx="42"
              cy="42"
              r={R}
              fill="none"
              className={s.avance}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${(vuelta * C).toFixed(1)} ${C.toFixed(1)}`}
              transform="rotate(-90 42 42)"
            />
          </svg>
        ) : null}
        <div className={s.cifras}>
          <span className={s.real}>{formatoMinutos(m.real) ?? "0 min"}</span>
          <span className={s.contra}>{m.plan != null ? `de ${formatoMinutos(m.plan)} planeadas` : "trabajadas"}</span>
          <span className={s.estado}>{m.texto}</span>
        </div>
      </div>
      {m.tope != null ? <p className={s.pie}>Tope: {formatoMinutos(m.tope)}{tiempoMaximoMin ? "" : " (plan + 25 %)"}</p> : null}
    </section>
  );
}
