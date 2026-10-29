"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Avatar } from "@/components/base";
import { formatPctKpi, type KpiPersonaFila, type TotalesKpi } from "@/lib/kpis-equipo";
import { horasEnPalabras, tonoCumplimiento, type TonoKpi } from "@/lib/kpis-lectura";
import {
  CONFIANZA_UI,
  confianzaDe,
  diagnosticoDe,
  disciplinaTexto,
  estandarGanado,
  pilaresDe,
  resumenDesempeno,
  type Pilar,
} from "@/lib/desempeno";
import s from "./DesempenoTablero.module.css";

const TONO: Record<TonoKpi, string> = { ok: s.ok, atencion: s.atencion, critico: s.critico, sin_datos: s.sinDatos };

/** Anillo del índice del equipo (0–100). */
function Anillo({ pct }: { pct: number | null }) {
  const r = 27;
  const largo = 2 * Math.PI * r;
  const lleno = pct == null ? 0 : (Math.max(0, Math.min(100, pct)) / 100) * largo;
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" role="img" aria-label={pct == null ? "Índice sin datos" : `Índice ${pct} de 100`}>
      <circle cx="34" cy="34" r={r} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="8" />
      <circle
        cx="34"
        cy="34"
        r={r}
        fill="none"
        stroke="#6ec5d8"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${lleno} ${largo}`}
        transform="rotate(-90 34 34)"
      />
    </svg>
  );
}

function Barra({ pilar }: { pilar: Pilar }) {
  const tono = tonoCumplimiento(pilar.pct);
  return (
    <span className={s.pilar} title={`${pilar.label}: ${pilar.ayuda}`}>
      <span className={s.pilarPista} aria-hidden="true">
        <span className={`${s.pilarLleno} ${TONO[tono]}`} style={{ width: `${pilar.pct ?? 0}%` }} />
      </span>
      <span className={s.pilarValor}>{pilar.pct == null ? "—" : pilar.pct}</span>
    </span>
  );
}

function puntoDe(p: KpiPersonaFila): string {
  const area = p.persona.puesto || p.horario.etiqueta;
  return `${area} · ${CONFIANZA_UI[confianzaDe(p.totales)]}`;
}

/**
 * «Desempeño» como en el canvas: banda oscura con el índice del equipo, tabla por persona con
 * los cuatro pilares y, al lado, la lectura de quien se elija.
 */
export default function DesempenoTablero({
  equipo,
  personas,
  hrefDe,
  titulo = "Por persona",
  herramientas,
}: {
  equipo: TotalesKpi;
  personas: KpiPersonaFila[];
  hrefDe: (p: KpiPersonaFila) => string;
  titulo?: string;
  /** El orden de la tabla (u otros controles), a la derecha del título. */
  herramientas?: ReactNode;
}) {
  const [elegidaId, setElegidaId] = useState<number | null>(personas[0]?.persona.id ?? null);
  useEffect(() => {
    if (!personas.some((p) => p.persona.id === elegidaId)) setElegidaId(personas[0]?.persona.id ?? null);
  }, [personas, elegidaId]);
  const elegida = personas.find((p) => p.persona.id === elegidaId) ?? null;

  const conAlta = personas.filter((p) => confianzaDe(p.totales) === "alta").length;
  const e = equipo.entregas;
  const indice = equipo.cumplimientoPct ?? null;

  return (
    <>
      <section className={s.banda} aria-label="Resumen del equipo">
        <div className={s.indice}>
          <Anillo pct={indice} />
          <span className={s.indiceTexto}>
            <span className={s.bandaEtiqueta}>Índice del equipo</span>
            <span className={s.indiceValor}>{indice ?? "—"}</span>
            <span className={s.bandaSub}>
              {personas.length} {personas.length === 1 ? "persona" : "personas"} · {conAlta} con confianza alta
            </span>
          </span>
        </div>
        <div className={s.dato}>
          <span className={s.bandaEtiqueta}>Entregas a tiempo</span>
          <span className={s.datoValor}>{e && e.medidas ? `${e.aTiempo} de ${e.medidas}` : "—"}</span>
          <span className={s.bandaSub}>
            {e && e.medidas ? `${formatPctKpi(e.pctATiempo)} · ${e.sinEntregar} sin entregar` : "Sin entregas que medir"}
          </span>
        </div>
        <div className={s.dato}>
          <span className={s.bandaEtiqueta}>Tiempo en actividades</span>
          <span className={s.datoValor}>{horasEnPalabras(equipo.minutosProductivos)}</span>
          <span className={s.bandaSub}>
            de {horasEnPalabras(equipo.minutosLaborados)} en jornada · {formatPctKpi(equipo.productividadPct)}
          </span>
        </div>
        <div className={s.dato}>
          <span className={s.bandaEtiqueta}>Extra por decidir</span>
          <span className={s.datoValor}>{equipo.diasExtraPendientes}</span>
          <span className={s.bandaSub}>
            {equipo.diasExtraPendientes
              ? `${horasEnPalabras(equipo.minutosExtraPendientes)} sin aprobar`
              : "Todo decidido"}
          </span>
        </div>
      </section>

      <div className={s.cuerpo}>
        <section className={s.tablaCaja} aria-labelledby="desempeno-tabla-t">
          <div className={s.tablaCabeza}>
            <h2 id="desempeno-tabla-t" className={s.tablaTitulo}>
              {titulo}
            </h2>
            {herramientas}
          </div>
          <div className={s.desliza}>
            <table className={s.tabla}>
              <thead>
                <tr>
                  <th scope="col">Persona</th>
                  <th scope="col" className={s.num}>
                    Índice
                  </th>
                  <th scope="col">Confiabilidad</th>
                  <th scope="col">Calidad</th>
                  <th scope="col">Rendimiento</th>
                  <th scope="col">Disciplina</th>
                  <th scope="col" className={s.num}>
                    Horas con actividad
                  </th>
                </tr>
              </thead>
              <tbody>
                {personas.map((p) => {
                  const t = p.totales;
                  const pilares = pilaresDe(t.cumplimientoPartes);
                  const on = p.persona.id === elegidaId;
                  const pct = t.cumplimientoPct ?? null;
                  const baja = confianzaDe(t) === "baja";
                  return (
                    <tr key={p.persona.id} data-on={on ? "true" : undefined}>
                      <th scope="row">
                        <button
                          type="button"
                          className={s.persona}
                          aria-pressed={on}
                          onClick={() => setElegidaId(p.persona.id)}
                        >
                          <Avatar url={p.persona.avatarUrl} name={p.persona.nombre} size={32} />
                          <span className={s.personaTexto}>
                            <span className={s.nombre}>{p.persona.nombre}</span>
                            <span className={s.punto}>{puntoDe(p)}</span>
                          </span>
                        </button>
                      </th>
                      <td className={s.num}>
                        <span
                          className={`${s.indiceFila} ${TONO[tonoCumplimiento(pct)]}`}
                          data-baja={baja ? "true" : undefined}
                          title={baja ? "Menos de 10 entregas medidas: confianza baja, el índice es provisional y no se publica" : undefined}
                        >
                          {pct ?? "—"}
                        </span>
                      </td>
                      {pilares.map((pl) => (
                        <td key={pl.id}>
                          <Barra pilar={pl} />
                        </td>
                      ))}
                      <td className={s.num}>
                        <span className={s.horas}>{horasEnPalabras(t.minutosProductivos)}</span>
                        <span className={s.horasDe}>de {horasEnPalabras(t.minutosLaborados)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {elegida ? <Lectura persona={elegida} href={hrefDe(elegida)} /> : null}
      </div>
    </>
  );
}

function Lectura({ persona: p, href }: { persona: KpiPersonaFila; href: string }) {
  const t = p.totales;
  const pilares = pilaresDe(t.cumplimientoPartes);
  const diagnostico = diagnosticoDe(t.cumplimientoPartes);
  const e = t.entregas;
  const a = t.asistenciaPuntual;
  const nombreCorto = p.persona.nombre.split(/\s+/).slice(0, 2).join(" ");
  // Horas estándar ganadas: el pilar Rendimiento.
  const estandar = estandarGanado(t);
  const datos: Array<[string, string]> = [
    ["Horas estándar ganadas", estandar ? `${estandar.valor} (${estandar.detalle})` : "Sin entregas con tiempo estándar"],
    ["Aprobadas a la primera", e && e.revisadas ? `${e.aprobadasALaPrimera} de ${e.revisadas}` : "Sin revisar"],
    [
      "Calificación calibrada",
      t.calificacion?.n && t.calificacion.pct != null ? `${t.calificacion.pct} de 100 (${t.calificacion.n})` : "Sin calificar",
    ],
    ["Retardos", t.retardos ? `${t.retardos} · ${horasEnPalabras(t.minutosTarde)}` : "Ninguno"],
    ["Puntualidad y registro", disciplinaTexto(t) ?? (a && a.esperados ? `${a.puntuales} de ${a.esperados} días` : "—")],
    ["Uniforme", t.uniforme.revisadas ? `${t.uniforme.ok} de ${t.uniforme.revisadas}` : "Sin revisar"],
  ];
  if (t.equipo) {
    const q = t.equipo;
    datos.unshift([
      "Su equipo",
      `${q.personas} ${q.personas === 1 ? "persona" : "personas"} · ${q.aTiempo} de ${q.medidas} a tiempo${
        q.revisiones.total ? ` · revisó ${q.revisiones.enPlazo} de ${q.revisiones.total} en 24 h hábiles` : ""
      }`,
    ]);
  }
  return (
    <aside className={s.lectura} aria-label={`Lectura de ${p.persona.nombre}`}>
      <section className={s.tarjeta}>
        <div className={s.lecturaCabeza}>
          <h2 className={s.lecturaTitulo}>
            {nombreCorto} · {t.cumplimientoPct ?? "—"}
          </h2>
          <span className={s.punto}>{CONFIANZA_UI[confianzaDe(t)]}</span>
        </div>
        <p className={s.resumen}>{resumenDesempeno(t)}</p>
        <dl className={s.datos}>
          {datos.map(([k, v]) => (
            <div key={k} className={s.datoFila}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={s.tarjeta}>
        <h2 className={s.lecturaSub}>De qué sale el {t.cumplimientoPct ?? "índice"}</h2>
        <ul className={s.partes}>
          {pilares.map((pl) => (
            <li key={pl.id}>
              <div className={s.parteCabeza}>
                <span>{pl.label}</span>
                <strong>{pl.pct ?? "—"}</strong>
              </div>
              {pl.partes.length ? (
                <ul className={s.parteLista}>
                  {pl.partes.map((x) => (
                    <li key={x.clave}>
                      {x.etiqueta}: {x.detalle} <span className={s.peso}>· pesa {x.peso}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={s.parteVacia}>Sin dato en estas fechas: no pesa.</p>
              )}
            </li>
          ))}
        </ul>
        {diagnostico.length ? (
          <p className={s.multiplica}>
            No pesa, para leer: {diagnostico.map((m) => `${m.etiqueta}: ${m.detalle.replace(/ · diagnóstico$/, "")}`).join(". ")}.
          </p>
        ) : null}
        <Link href={href} className={s.verDetalle}>
          Ver el detalle de {nombreCorto} →
        </Link>
      </section>

      <p className={s.nota}>
        El número lo calcula el sistema con reglas fijas. Es una ayuda para el jefe: ninguna decisión de pago o sanción
        sale sola de aquí.
      </p>
    </aside>
  );
}
