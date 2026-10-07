"use client";

import Link from "next/link";
import { Avatar, Badge } from "@/components/base";
import { formatPctKpi, type KpiPersonaFila } from "@/lib/kpis-equipo";
import {
  avisosDePersona,
  detalleDeFila,
  horasEnPalabras,
  tonoCumplimiento,
  tonoProductividad,
  type OrdenRanking,
} from "@/lib/kpis-lectura";
import s from "./kpis.module.css";

// Solo lo crítico se pinta: si todo va en naranja, nada destaca.
const CLASE_PCT = {
  ok: "",
  atencion: "",
  critico: s.pctCritico,
  sin_datos: s.pctSinDatos,
} as const;

/**
 * Una fila por persona: quién es, cómo le fue y solo los avisos que piden atención. Toda la
 * fila abre su detalle.
 *
 * Por omisión el % grande es el cumplimiento en tiempo y forma y la barra sus entregas (a tiempo
 * en teal, tarde en ámbar, sin entregar en rojo). Con `orden="productividad"` («Tiempo en
 * actividades»), o si la API aún no manda el cumplimiento, el % y la barra son los de horas.
 */
export default function RankingPersonas({
  personas,
  hrefDe,
  orden,
}: {
  personas: KpiPersonaFila[];
  hrefDe: (p: KpiPersonaFila) => string;
  orden?: OrdenRanking;
}) {
  const verTiempo = orden === "productividad";
  return (
    <ul className={s.lista} aria-label={verTiempo ? "Tiempo en actividades por persona" : "Cumplimiento por persona"}>
      {personas.map((p, i) => {
        const t = p.totales;
        // Una API vieja no manda `cumplimientoPct` (undefined): se queda la productividad, como antes.
        const porTiempo = verTiempo || t.cumplimientoPct === undefined;
        const pct = porTiempo ? t.productividadPct : (t.cumplimientoPct ?? null);
        const tono = porTiempo ? tonoProductividad(pct) : tonoCumplimiento(pct);
        const queEs = porTiempo ? "de tiempo en actividades" : "de cumplimiento";
        const e = t.entregas;
        const conEntregas = !porTiempo && e != null && e.medidas > 0;
        const ancho = (n: number) => (e && e.medidas > 0 ? `${Math.min(100, (n / e.medidas) * 100)}%` : "0%");
        const pctProductivo = t.minutosLaborados > 0 ? Math.min(100, (t.minutosProductivos / t.minutosLaborados) * 100) : 0;
        // Dos avisos como mucho; el resto se ve al abrir a la persona.
        const todos = avisosDePersona(t);
        const avisos = todos.slice(0, 2);
        const demas = todos.length - avisos.length;
        return (
          <li key={p.persona.id}>
          <Link
            href={hrefDe(p)}
            className={s.fila}
            aria-label={`${p.persona.nombre}: ${formatPctKpi(pct)} ${queEs}. Ver su detalle`}
          >
            <span className={s.pos} aria-hidden="true">
              {i + 1}
            </span>
            <span className={s.persona}>
              <Avatar url={p.persona.avatarUrl} name={p.persona.nombre} size={32} />
              <span style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
                <span className={s.nombre}>{p.persona.nombre}</span>
                <span className={s.puesto}>{p.persona.puesto || p.horario.etiqueta}</span>
              </span>
            </span>
            <span className={s.medio}>
              {conEntregas && e ? (
                <span
                  className={s.barra}
                  role="img"
                  aria-label={`${e.aTiempo} a tiempo, ${e.tarde} tarde y ${e.sinEntregar} sin entregar de ${e.medidas} entregas`}
                >
                  <span className={s.barraProductiva} style={{ width: ancho(e.aTiempo) }} />
                  <span className={s.barraTarde} style={{ width: ancho(e.tarde) }} />
                  <span className={s.barraSinEntregar} style={{ width: ancho(e.sinEntregar) }} />
                </span>
              ) : (
                <span
                  className={s.barra}
                  role="img"
                  aria-label={`${horasEnPalabras(t.minutosProductivos)} en actividades de ${horasEnPalabras(t.minutosLaborados)} en jornada`}
                >
                  <span className={s.barraProductiva} style={{ width: `${pctProductivo}%` }} />
                </span>
              )}
              <span className={s.detalle}>
                <span
                  title={
                    porTiempo
                      ? "Horas con una actividad corriendo de sus horas en jornada"
                      : "Entregas a tiempo de las que se miden · aprobadas a la primera de las revisadas · horas con una actividad corriendo de sus horas en jornada"
                  }
                >
                  {detalleDeFila(t, { tiempo: porTiempo })}
                </span>
                {avisos.map((a) => (
                  <Badge key={a.clave} tone={a.tono === "neutral" ? "neutral" : a.tono} title={a.titulo}>
                    {a.texto}
                  </Badge>
                ))}
                {demas > 0 ? <span title={todos.slice(2).map((a) => a.texto).join(" · ")}>+{demas}</span> : null}
              </span>
            </span>
            <span
              className={`${s.pct} ${CLASE_PCT[tono]}`}
              title={!porTiempo && pct == null ? "Sin entregas que medir en estas fechas" : undefined}
            >
              {formatPctKpi(pct)}
            </span>
          </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Leyenda de la barra y de la línea de tiempo. `entregas` = la barra del ranking por
 * cumplimiento (a tiempo / tarde / sin entregar); `jornada` = horas en actividades.
 */
export function LeyendaJornada({
  conComida = false,
  modo = "jornada",
}: {
  conComida?: boolean;
  modo?: "jornada" | "entregas";
}) {
  if (modo === "entregas") {
    return (
      <span className={s.leyenda}>
        <span>
          <i className={`${s.muestra} ${s.muestraProductiva}`} aria-hidden="true" />
          A tiempo
        </span>
        <span>
          <i className={`${s.muestra} ${s.muestraTarde}`} aria-hidden="true" />
          Tarde
        </span>
        <span>
          <i className={`${s.muestra} ${s.muestraSinEntregar}`} aria-hidden="true" />
          Sin entregar
        </span>
      </span>
    );
  }
  return (
    <span className={s.leyenda}>
      <span>
        <i className={`${s.muestra} ${s.muestraProductiva}`} aria-hidden="true" />
        En actividades
      </span>
      <span>
        <i className={`${s.muestra} ${s.muestraJornada}`} aria-hidden="true" />
        Sin actividad
      </span>
      {conComida ? (
        <span>
          <i className={`${s.muestra} ${s.muestraComida}`} aria-hidden="true" />
          Comida
        </span>
      ) : null}
    </span>
  );
}
