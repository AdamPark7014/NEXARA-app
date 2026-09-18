"use client";

import { useMemo } from "react";
import { formatoFecha } from "@/lib/proyectos-api";
import {
  barraEnRango,
  diaDe,
  hitoVencido,
  marcasDeMes,
  porcentajeEnRango,
  rangoDe,
  tramosDeEtapas,
  type Rango,
} from "@/lib/proyecto-plan";
import styles from "../proyectos.module.css";

export type EtapaEnLinea = {
  id: number;
  nombre: string;
  plannedDate?: string | null;
  actualDate?: string | null;
  status?: string | null;
  responsable?: string | null;
};

/**
 * Cronograma tipo Gantt hecho con CSS: una fila para el plan del proyecto y una por etapa.
 * Cada etapa va desde que termina la anterior hasta su fecha planeada. La barra es solo
 * apoyo visual (`aria-hidden`): la etiqueta de cada fila ya dice la fecha y el estado.
 */
export default function LineaDeTiempo({
  inicio,
  fin,
  inicioReal,
  finReal,
  hoy,
  etapas,
}: {
  inicio?: string | null;
  fin?: string | null;
  inicioReal?: string | null;
  finReal?: string | null;
  hoy: string;
  etapas: EtapaEnLinea[];
}) {
  const rango = useMemo<Rango | null>(() => {
    const fechas = [
      inicio,
      fin,
      inicioReal,
      finReal,
      ...etapas.flatMap((e) => [e.plannedDate, e.actualDate]),
    ];
    const base = rangoDe(fechas);
    if (!base) return null;
    // «Hoy» entra si cae cerca del plan; un proyecto de 2027 no se aplasta por la fecha de hoy.
    const diaHoy = diaDe(hoy);
    const holgura = Math.max(14, Math.round((base.hasta - base.desde) * 0.25));
    if (diaHoy !== null && diaHoy >= base.desde - holgura && diaHoy <= base.hasta + holgura) {
      return rangoDe([...fechas, hoy]);
    }
    return base;
  }, [inicio, fin, inicioReal, finReal, etapas, hoy]);

  const tramos = useMemo(() => tramosDeEtapas(etapas.map((e) => ({ id: e.id, plannedDate: e.plannedDate })), inicio), [etapas, inicio]);

  if (!rango) {
    return (
      <p className={styles.sub}>
        Pon la fecha de inicio y las fechas de las etapas para ver el cronograma.
      </p>
    );
  }

  const diaHoy = diaDe(hoy);
  const hoyVisible = diaHoy !== null && diaHoy >= rango.desde && diaHoy <= rango.hasta;
  const posHoy = hoyVisible && diaHoy !== null ? porcentajeEnRango(diaHoy, rango) : null;
  const marcas = marcasDeMes(rango, 8);

  const dInicio = diaDe(inicio);
  const dFin = diaDe(fin);
  const dInicioReal = diaDe(inicioReal);
  const dFinReal = diaDe(finReal) ?? (dInicioReal !== null ? diaHoy : null);

  const lineaHoy = posHoy !== null ? <span className={styles.ganttToday} style={{ left: `${posHoy}%` }} /> : null;

  return (
    <div className={styles.gantt}>
      <div className={styles.ganttRow} aria-hidden="true">
        <span className={styles.ganttScaleSpacer} />
        <div className={styles.ganttScale}>
          {marcas.map((m) => (
            <span key={m.dia} className={styles.ganttMonth} style={{ left: `${m.porcentaje}%` }}>
              {m.etiqueta}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.ganttRow}>
        <span className={styles.ganttLabel}>
          Proyecto
          <span className={styles.ganttLabelSub}>
            Plan: {formatoFecha(inicio, false)} → {fin ? formatoFecha(fin, false) : "sin fin"}
            {inicioReal ? ` · Real: ${formatoFecha(inicioReal, false)} → ${finReal ? formatoFecha(finReal, false) : "en curso"}` : ""}
          </span>
        </span>
        <div className={styles.ganttTrack} aria-hidden="true">
          {dInicio !== null && dFin !== null ? (
            <span
              className={styles.ganttBarProyecto}
              style={{ left: `${barraEnRango(dInicio, dFin, rango).left}%`, width: `${barraEnRango(dInicio, dFin, rango).width}%` }}
            />
          ) : dInicio !== null ? (
            <span className={styles.ganttMarker} style={{ left: `${porcentajeEnRango(dInicio, rango)}%` }} />
          ) : null}
          {dInicioReal !== null && dFinReal !== null ? (
            <span
              className={styles.ganttBarReal}
              style={{
                left: `${barraEnRango(dInicioReal, dFinReal, rango).left}%`,
                width: `${barraEnRango(dInicioReal, dFinReal, rango).width}%`,
              }}
            />
          ) : null}
          {lineaHoy}
        </div>
      </div>

      {etapas.map((etapa, i) => {
        const tramo = tramos[i];
        const cumplida = etapa.status === "CUMPLIDO" || Boolean(etapa.actualDate);
        const cancelada = etapa.status === "CANCELADO";
        const vencida = hitoVencido(etapa, hoy);
        const estadoTexto = cancelada ? "cancelada" : cumplida ? "cumplida" : vencida ? "vencida" : "";
        const claseBarra = cancelada
          ? styles.ganttBarCancelada
          : cumplida
            ? styles.ganttBarCumplida
            : vencida
              ? styles.ganttBarVencida
              : "";
        const claseMarca = cumplida ? styles.ganttMarkerCumplida : vencida ? styles.ganttMarkerVencida : "";
        return (
          <div key={etapa.id} className={styles.ganttRow}>
            <span className={styles.ganttLabel} title={etapa.nombre}>
              {etapa.nombre}
              <span className={styles.ganttLabelSub}>
                {etapa.plannedDate ? formatoFecha(etapa.plannedDate, false) : "Sin fecha"}
                {etapa.responsable ? ` · ${etapa.responsable}` : ""}
                {estadoTexto ? ` · ${estadoTexto}` : ""}
              </span>
            </span>
            <div className={styles.ganttTrack} aria-hidden="true">
              {tramo && tramo.desde !== null && tramo.hasta !== null ? (
                <>
                  {tramo.hasta > tramo.desde ? (
                    <span
                      className={`${styles.ganttBar} ${claseBarra}`}
                      style={{
                        left: `${barraEnRango(tramo.desde, tramo.hasta, rango).left}%`,
                        width: `${barraEnRango(tramo.desde, tramo.hasta, rango).width}%`,
                      }}
                    />
                  ) : null}
                  <span
                    className={`${styles.ganttMarker} ${claseMarca}`}
                    style={{ left: `${porcentajeEnRango(tramo.hasta, rango)}%` }}
                  />
                </>
              ) : null}
              {lineaHoy}
            </div>
          </div>
        );
      })}

      <div className={styles.ganttLegend} aria-hidden="true">
        <span className={styles.ganttLegendItem}>
          <span className={styles.swatch} style={{ background: "color-mix(in srgb, var(--primary) 30%, transparent)", border: "1px solid var(--primary)" }} />
          Plan del proyecto
        </span>
        <span className={styles.ganttLegendItem}>
          <span className={styles.swatch} style={{ background: "#16a34a" }} />
          Fechas reales / etapa cumplida
        </span>
        <span className={styles.ganttLegendItem}>
          <span className={styles.swatch} style={{ background: "color-mix(in srgb, #dc2626 70%, transparent)" }} />
          Etapa vencida
        </span>
        {posHoy !== null ? (
          <span className={styles.ganttLegendItem}>
            <span className={styles.swatch} style={{ background: "#dc2626", width: 2, height: 12 }} />
            Hoy
          </span>
        ) : null}
      </div>
    </div>
  );
}
