"use client";

import Link from "next/link";
import { Avatar, Badge } from "@/components/base";
import { formatPctKpi, type KpiPersonaFila } from "@/lib/kpis-equipo";
import { avisosDePersona, horasEnPalabras, tonoProductividad } from "@/lib/kpis-lectura";
import s from "./kpis.module.css";

// Solo lo crítico (< 50 %) se pinta: si todo va en naranja, nada destaca.
const CLASE_PCT = {
  ok: "",
  atencion: "",
  critico: s.pctCritico,
  sin_datos: s.pctSinDatos,
} as const;

/**
 * Una fila por persona: quién es, cómo se le fue la jornada (productivo en teal, el resto
 * en gris), su % de productividad y solo los avisos que piden atención. Toda la fila abre su detalle.
 */
export default function RankingPersonas({ personas, hrefDe }: { personas: KpiPersonaFila[]; hrefDe: (p: KpiPersonaFila) => string }) {
  return (
    <ul className={s.lista} aria-label="Productividad por persona">
      {personas.map((p, i) => {
        const t = p.totales;
        const pctProductivo = t.minutosLaborados > 0 ? Math.min(100, (t.minutosProductivos / t.minutosLaborados) * 100) : 0;
        const avisos = avisosDePersona(t);
        return (
          <li key={p.persona.id}>
          <Link
            href={hrefDe(p)}
            className={s.fila}
            aria-label={`${p.persona.nombre}: ${formatPctKpi(t.productividadPct)} de productividad. Ver su detalle`}
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
              <span
                className={s.barra}
                role="img"
                aria-label={`${horasEnPalabras(t.minutosProductivos)} en actividades de ${horasEnPalabras(t.minutosLaborados)} en jornada`}
              >
                <span className={s.barraProductiva} style={{ width: `${pctProductivo}%` }} />
              </span>
              <span className={s.detalle}>
                <span>
                  {t.minutosLaborados > 0
                    ? `${horasEnPalabras(t.minutosProductivos)} en actividades de ${horasEnPalabras(t.minutosLaborados)}`
                    : "Sin horas en jornada"}
                </span>
                {avisos.map((a) => (
                  <Badge key={a.clave} tone={a.tono === "neutral" ? "neutral" : a.tono}>
                    {a.texto}
                  </Badge>
                ))}
              </span>
            </span>
            <span className={`${s.pct} ${CLASE_PCT[tonoProductividad(t.productividadPct)]}`}>{formatPctKpi(t.productividadPct)}</span>
          </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Leyenda de la barra y de la línea de tiempo. */
export function LeyendaJornada({ conComida = false }: { conComida?: boolean }) {
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
