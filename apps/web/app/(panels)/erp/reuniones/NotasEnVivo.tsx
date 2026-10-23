"use client";

import { useEffect, useRef } from "react";
import { duracionLegible } from "@/lib/voz-api";
import { PRIORIDAD_LABEL, type NotasGuardadas } from "@/lib/grabacion-api";
import s from "./reuniones.module.css";

const fechaCorta = (iso: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : null;
};

/**
 * Las notas que la IA toma por tramos mientras sigue la junta: temas con lo que se dijo,
 * decisiones, acuerdos y pendientes. La minuta final las une al concluir.
 */
export default function NotasEnVivo({ notas, grabando }: { notas: NotasGuardadas[]; grabando: boolean }) {
  const final = useRef<HTMLDivElement>(null);
  const previas = useRef(0);
  useEffect(() => {
    // Al llegar un tramo nuevo, se muestra sin mover al usuario si estaba leyendo arriba.
    if (notas.length > previas.current && previas.current > 0) final.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    previas.current = notas.length;
  }, [notas.length]);

  return (
    <div className={s.notas}>
      <p className={s.notasTitle}>Notas en vivo</p>
      {notas.length === 0 ? (
        <p className={s.hint} style={{ margin: 0 }}>
          {grabando ? "Las primeras notas aparecen a los ~4 minutos de junta." : "Esta reunión no tiene notas por tramo."}
        </p>
      ) : (
        <ol className={s.tramos}>
          {notas.map((g) => {
            const n = g.notas;
            const rango =
              g.inicioMs != null && g.finMs != null ? `${duracionLegible(g.inicioMs)}–${duracionLegible(g.finMs)}` : `Parte ${g.desde}–${g.hasta}`;
            const vacio =
              !n.temas.length && !n.decisiones.length && !n.acuerdos.length && !n.pendientes.length && !n.riesgos.length;
            return (
              <li key={`${g.desde}-${g.hasta}`} className={s.tramo}>
                <span className={s.tramoHora}>{rango}</span>
                <div className={s.tramoCuerpo}>
                  {vacio ? <p className={s.hint} style={{ margin: 0 }}>Sin asuntos de trabajo en este tramo.</p> : null}
                  {n.temas.map((t, i) => (
                    <div key={i}>
                      <p className={s.tramoTema}>{t.titulo}</p>
                      <ul className={s.tramoPuntos}>
                        {t.puntos.map((p, j) => (
                          <li key={j}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {n.decisiones.map((d, i) => (
                    <p key={`d${i}`} className={s.tramoMarca}>
                      <span className={`${s.marca} ${s.marcaDecision}`}>Decisión</span> {d}
                    </p>
                  ))}
                  {n.acuerdos.map((a, i) => (
                    <p key={`a${i}`} className={s.tramoMarca}>
                      <span className={`${s.marca} ${s.marcaAcuerdo}`}>Acuerdo</span> {a.que}
                      <span className={s.tramoDato}>
                        {[a.responsable ?? "sin responsable", fechaCorta(a.fecha), a.prioridad === "alta" ? `prioridad ${PRIORIDAD_LABEL.alta.toLowerCase()}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </p>
                  ))}
                  {n.pendientes.map((p, i) => (
                    <p key={`p${i}`} className={s.tramoMarca}>
                      <span className={`${s.marca} ${s.marcaPendiente}`}>Pendiente</span> {p}
                    </p>
                  ))}
                  {n.riesgos.map((r, i) => (
                    <p key={`r${i}`} className={s.tramoMarca}>
                      <span className={`${s.marca} ${s.marcaRiesgo}`}>Riesgo</span> {r}
                    </p>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div ref={final} />
    </div>
  );
}
