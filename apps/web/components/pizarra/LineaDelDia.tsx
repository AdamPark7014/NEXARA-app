"use client";

/**
 * Pizarra · «Mi equipo» en modo «Línea del día» (28-10, propuesta UI/UX aprobada).
 * Una fila por persona sobre una regla de horas: lo que trabajó, lo que corre, lo programado,
 * lo atrasado, la comida y los huecos libres. Las cuentas viven en `lib/linea-del-dia.ts`.
 */
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { AvatarAro } from "@/components/pizarra/EquipoPersonaCard";
import { ARO_DE_ESTADO } from "@/components/pizarra/equipo-estado";
import type { TeamBoardUser } from "@/lib/team-board-api";
import {
  armaFila,
  diaMx,
  fetchLineaDelDia,
  hhmmMx,
  posicion,
  ventanaDelDia,
  type LineaDelDiaResponse,
  type TipoBloque,
} from "@/lib/linea-del-dia";
import s from "./LineaDelDia.module.css";

export type ModoEquipo = "tarjetas" | "linea";

const CLASE_TIPO: Record<TipoBloque, string> = {
  trabajada: s.trabajada,
  en_curso: s.enCurso,
  programada: s.programada,
  atrasada: s.atrasada,
  comida: s.comida,
  libre: s.libre,
};

/** El tipo de actividad se lee en la franja izquierda del bloque, con los colores del logo. */
function claseTipoCore(coreKind: string | null): string {
  switch (coreKind) {
    case "comercial":
      return s.kindComercial;
    case "obra":
    case "proyecto":
      return s.kindObra;
    case "servicio":
      return s.kindServicio;
    case "tarea":
      return s.kindTarea;
    default:
      return "";
  }
}

/** Conmutador «Tarjetas | Línea del día» de la barra de «Mi equipo». */
export function ConmutadorModo({ modo, onChange }: { modo: ModoEquipo; onChange: (m: ModoEquipo) => void }) {
  return (
    <div className={s.modo} role="group" aria-label="Cómo ver al equipo">
      <button type="button" aria-pressed={modo === "tarjetas"} onClick={() => onChange("tarjetas")}>
        Tarjetas
      </button>
      <button type="button" aria-pressed={modo === "linea"} onClick={() => onChange("linea")}>
        Línea del día
      </button>
    </div>
  );
}

export default function LineaDelDia({
  token,
  users,
  refresco,
  asignarHref,
}: {
  token: string | null;
  users: TeamBoardUser[];
  /** Cambia cada vez que la pizarra se actualiza: la línea se vuelve a pedir. */
  refresco?: number | null;
  /** Sin enlace = quien mira no puede asignarle a esa persona: el hueco se ve, sin acción. */
  asignarHref: (u: TeamBoardUser) => string | undefined;
}) {
  const [datos, setDatos] = useState<LineaDelDiaResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    fetchLineaDelDia(token)
      .then((d) => {
        if (!vivo) return;
        setDatos(d);
        setError(null);
        setAhora(Date.now());
      })
      .catch(() => {
        if (vivo) setError("No se pudo cargar la línea del día. Las tarjetas siguen al día.");
      });
    return () => {
      vivo = false;
    };
  }, [token, refresco]);

  const fecha = datos?.fecha ?? diaMx(ahora);
  const porId = useMemo(() => new Map((datos?.personas ?? []).map((p) => [p.persona.id, p])), [datos]);
  const filas = useMemo(
    () => users.map((u) => ({ u, f: armaFila(porId.get(u.id), u, ahora, fecha) })),
    [users, porId, ahora, fecha],
  );
  const v = useMemo(() => ventanaDelDia(filas.map((x) => x.f), fecha), [filas, fecha]);
  const tramos = v.horas.length - 1;
  const ahoraPct = ahora >= v.inicio && ahora <= v.fin ? ((ahora - v.inicio) / (v.fin - v.inicio)) * 100 : null;
  const cargando = !datos && !error;

  return (
    <section className={s.linea} aria-label="Línea del día del equipo" aria-busy={cargando}>
      {error ? (
        <p className={s.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={s.scroll}>
        <div className={s.tabla} style={{ "--tramos": tramos } as CSSProperties}>
          <div className={s.cabecera} aria-hidden="true">
            <span className={s.colPersona}>Persona</span>
            <div className={s.regla}>
              {v.horas.map((h, i) => (
                <span key={h} className={s.hora} style={{ left: `${(i / tramos) * 100}%` }}>
                  {String(h).padStart(2, "0")}
                </span>
              ))}
              {ahoraPct != null ? (
                <span className={s.ahoraEtiqueta} style={{ left: `${ahoraPct}%` }}>
                  {hhmmMx(ahora)}
                </span>
              ) : null}
            </div>
          </div>

          {filas.map(({ u, f }) => {
            const jornada = f.jornada ? posicion(f.jornada.inicio, f.jornada.fin, v) : null;
            return (
              <div key={u.id} className={s.fila}>
                <Link href={`/erp/pizarra/${u.id}`} className={s.persona}>
                  <AvatarAro
                    nombre={u.nombre}
                    avatarUrl={u.avatarUrl}
                    estado={ARO_DE_ESTADO[u.status] ?? null}
                    atrasada={u.status === "atrasado"}
                    size={38}
                    className={s.foto}
                  />
                  <span className={s.quien}>
                    <strong>{u.nombre}</strong>
                    <span className={f.estado === "sin_checar" || f.retardo ? s.notaAlerta : s.nota}>{f.nota}</span>
                  </span>
                </Link>
                <div className={s.pista}>
                  {jornada ? (
                    <span
                      className={s.jornada}
                      style={{ left: `${jornada.left}%`, width: `${jornada.width}%` }}
                      aria-hidden="true"
                    />
                  ) : null}
                  {f.bloques.map((b) => {
                    const p = posicion(b.inicio, b.fin, v);
                    if (!p) return null;
                    const estilo = { left: `${p.left}%`, width: `${p.width}%` };
                    const clase = [s.bloque, CLASE_TIPO[b.tipo], claseTipoCore(b.coreKind)].filter(Boolean).join(" ");
                    const etiqueta = `${b.titulo}: ${b.detalle}`;
                    const hrefAsignar = b.tipo === "libre" ? asignarHref(u) : undefined;
                    const contenido = (
                      <>
                        <span className={s.bloqueTitulo}>{b.tipo === "libre" ? "Libre" : b.titulo}</span>
                        <span className={s.bloqueDetalle}>{hrefAsignar ? "Asignar" : b.detalle}</span>
                      </>
                    );
                    if (hrefAsignar) {
                      return (
                        <Link key={b.clave} href={hrefAsignar} className={clase} style={estilo} title={etiqueta} aria-label={`${u.nombre}: ${etiqueta}. Asignar`}>
                          {contenido}
                        </Link>
                      );
                    }
                    if (b.activityId) {
                      return (
                        <Link key={b.clave} href={`/erp/actividades/${b.activityId}`} className={clase} style={estilo} title={etiqueta} aria-label={`${u.nombre}: ${etiqueta}`}>
                          {contenido}
                        </Link>
                      );
                    }
                    return (
                      <span key={b.clave} className={clase} style={estilo} title={etiqueta}>
                        {contenido}
                      </span>
                    );
                  })}
                  {ahoraPct != null ? <span className={s.ahora} style={{ left: `${ahoraPct}%` }} aria-hidden="true" /> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ul className={s.leyenda} aria-label="Cómo leer la línea">
        <li><span className={[s.muestra, s.enCurso].join(" ")} />En curso</li>
        <li><span className={[s.muestra, s.trabajada].join(" ")} />Trabajada</li>
        <li><span className={[s.muestra, s.programada].join(" ")} />Programada</li>
        <li><span className={[s.muestra, s.atrasada].join(" ")} />No ha iniciado y ya era su hora</li>
        <li><span className={[s.muestra, s.libre].join(" ")} />Libre: clic para asignar</li>
        <li><span className={[s.muestra, s.comida].join(" ")} />Comida</li>
        <li className={s.leyendaTipos}>
          Franja: <span className={[s.punto, s.kindObra].join(" ")} />obra y proyecto
          <span className={[s.punto, s.kindServicio].join(" ")} />servicio
          <span className={[s.punto, s.kindComercial].join(" ")} />comercial
          <span className={[s.punto, s.kindTarea].join(" ")} />tarea
        </li>
      </ul>
    </section>
  );
}
