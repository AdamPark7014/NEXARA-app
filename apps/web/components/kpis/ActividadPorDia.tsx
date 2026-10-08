"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Avatar, Card, CardHead } from "@/components/base";
import type { ActividadDelDiaFila, KpiPersonaFila } from "@/lib/kpis-equipo";
import s from "./ActividadPorDia.module.css";

const ZONA = "America/Mexico_City";
/** Más columnas no caben legibles: en rangos largos se enseñan los últimos días. */
const MAX_COLUMNAS = 15;

const diaCorto = new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", weekday: "short", day: "numeric" });
const diaLargo = new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", weekday: "long", day: "numeric", month: "short" });

function etiquetaDia(fecha: string, larga = false): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  return (larga ? diaLargo : diaCorto).format(d).replace(".", "");
}

function hoyMx(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
}

/** Qué se pinta en la celda y con qué tono. */
export function celdaDeDia(d: ActividadDelDiaFila | undefined): { texto: string; tono: string; titulo: string } {
  if (!d) return { texto: "", tono: "vacio", titulo: "No le tocaba" };
  if (d.estado === "justificado") return { texto: "J", tono: "neutro", titulo: "Falta justificada o permiso" };
  if (d.estado === "pendiente") {
    return { texto: d.actividades ? String(d.actividades) : "·", tono: "neutro", titulo: "Hoy, la jornada no ha terminado" };
  }
  if (d.estado === "sin_checar") return { texto: "F", tono: "rojo", titulo: "No checó ni trabajó" };
  const entregas = d.entregas ? ` · ${d.entregas} entregada${d.entregas === 1 ? "" : "s"}` : "";
  if (d.actividades === 0) return { texto: "0", tono: "rojo", titulo: "Checó y no tocó ninguna actividad" };
  if (d.actividades === 1) return { texto: "1", tono: "ambar", titulo: `Solo una actividad${entregas}` };
  return { texto: String(d.actividades), tono: "verde", titulo: `${d.actividades} actividades${entregas}` };
}

/** Lo que más preocupa primero: días sin nada, luego con solo una, luego el menor promedio. */
export function ordenarPorActividad(personas: KpiPersonaFila[]): KpiPersonaFila[] {
  return [...personas].sort((a, b) => {
    const x = a.totales.actividadDiaria;
    const y = b.totales.actividadDiaria;
    return (
      (y?.sinActividad ?? 0) - (x?.sinActividad ?? 0) ||
      (y?.conUna ?? 0) - (x?.conUna ?? 0) ||
      (x?.promedio ?? 0) - (y?.promedio ?? 0) ||
      a.persona.nombre.localeCompare(b.persona.nombre, "es")
    );
  });
}

/** El último día laborable ya terminado en el rango, y quién no tocó nada o solo una. */
export function resumenUltimoDia(personas: KpiPersonaFila[], hoy = hoyMx()) {
  const fechas = new Set<string>();
  for (const p of personas) {
    for (const d of p.actividadPorDia ?? []) if (d.fecha < hoy && d.estado !== "pendiente") fechas.add(d.fecha);
  }
  const fecha = [...fechas].sort().pop() ?? null;
  if (!fecha) return null;
  const ninguna: string[] = [];
  const una: string[] = [];
  for (const p of personas) {
    const d = (p.actividadPorDia ?? []).find((x) => x.fecha === fecha);
    if (!d || d.estado === "justificado") continue;
    const nombre = p.persona.nombre.split(/\s+/).slice(0, 2).join(" ");
    if (d.actividades === 0) ninguna.push(d.estado === "sin_checar" ? `${nombre} (no checó)` : nombre);
    else if (d.actividades === 1) una.push(nombre);
  }
  return { fecha, ninguna, una };
}

/**
 * KPIs del equipo · «Actividad por día»: cuántas actividades tocó cada quien cada día (con su
 * reloj corriendo o entregadas ese día). Adam (08-10): «ayer tal solo registró una actividad o
 * ayer no registró ninguna; quiénes casi no han sido productivos». Rojo = ninguna, ámbar = una.
 */
export default function ActividadPorDia({
  personas,
  hrefDe,
}: {
  personas: KpiPersonaFila[];
  hrefDe: (p: KpiPersonaFila) => string;
}) {
  const conDatos = personas.filter((p) => p.actividadPorDia && p.actividadPorDia.length);
  const columnas = useMemo(() => {
    const todas = new Set<string>();
    for (const p of conDatos) for (const d of p.actividadPorDia ?? []) todas.add(d.fecha);
    const orden = [...todas].sort();
    return orden.slice(-MAX_COLUMNAS);
  }, [conDatos]);
  const filas = useMemo(() => ordenarPorActividad(conDatos), [conDatos]);
  const resumen = useMemo(() => resumenUltimoDia(conDatos), [conDatos]);

  if (!conDatos.length || !columnas.length) return null;

  return (
    <Card>
      <CardHead
        title="Actividad por día"
        subtitle="Cuántas actividades tocó cada quien cada día (con su reloj corriendo o entregadas ese día). Arriba, quien menos."
      />
      {resumen ? (
        <div className={s.resumen}>
          <strong className={s.resumenDia}>{etiquetaDia(resumen.fecha, true)}:</strong>{" "}
          {resumen.ninguna.length ? (
            <span className={s.malo}>
              sin ninguna actividad — {resumen.ninguna.join(", ")}.
            </span>
          ) : (
            <span>todos tocaron al menos una actividad.</span>
          )}{" "}
          {resumen.una.length ? <span className={s.regular}>Solo una — {resumen.una.join(", ")}.</span> : null}
        </div>
      ) : null}
      <div className={s.contenedor} role="region" aria-label="Actividades por persona y día" tabIndex={0}>
        <table className={s.tabla}>
          <thead>
            <tr>
              <th className={s.colPersona} scope="col">
                Persona
              </th>
              {columnas.map((f) => (
                <th key={f} scope="col" className={s.colDia}>
                  {etiquetaDia(f)}
                </th>
              ))}
              <th scope="col" className={s.colResumen} title="Días sin ninguna actividad · días con solo una · promedio por día">
                Sin · Una · Prom.
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((p) => {
              const porFecha = new Map((p.actividadPorDia ?? []).map((d) => [d.fecha, d]));
              const r = p.totales.actividadDiaria;
              return (
                <tr key={p.persona.id}>
                  <th scope="row" className={s.colPersona}>
                    <Link href={hrefDe(p)} className={s.persona}>
                      <Avatar url={p.persona.avatarUrl} name={p.persona.nombre} size={24} />
                      <span className={s.nombre}>{p.persona.nombre}</span>
                    </Link>
                  </th>
                  {columnas.map((f) => {
                    const c = celdaDeDia(porFecha.get(f));
                    return (
                      <td key={f} className={s.celda}>
                        {c.texto ? (
                          <span className={`${s.chip} ${s[c.tono] ?? ""}`} title={`${etiquetaDia(f, true)} · ${c.titulo}`}>
                            {c.texto}
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                  <td className={s.colResumen}>
                    <span className={r?.sinActividad ? s.malo : undefined}>{r?.sinActividad ?? 0}</span>
                    {" · "}
                    <span className={r?.conUna ? s.regular : undefined}>{r?.conUna ?? 0}</span>
                    {" · "}
                    <span>{r?.promedio ?? "—"}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={s.leyenda}>
        <span className={`${s.chip} ${s.verde}`}>2</span> dos o más · <span className={`${s.chip} ${s.ambar}`}>1</span> solo una ·{" "}
        <span className={`${s.chip} ${s.rojo}`}>0</span> checó y no hizo nada · <span className={`${s.chip} ${s.rojo}`}>F</span> no
        checó · <span className={`${s.chip} ${s.neutro}`}>J</span> justificado
        {columnas.length === MAX_COLUMNAS ? ` · se ven los últimos ${MAX_COLUMNAS} días del rango` : ""}
      </p>
    </Card>
  );
}
