"use client";

import Link from "next/link";
import { Fragment, useId, useState, type ReactNode } from "react";
import { Card, CardHead } from "@/components/base";
import { AvatarAro } from "@/components/pizarra/EquipoPersonaCard";
import { ARO_DE_ESTADO, atencionEquipo, esFinDeSemanaMx } from "@/components/pizarra/equipo-estado";
import type { TeamBoardUser } from "@/lib/team-board-api";
import s from "./AtencionEquipo.module.css";
import layout from "./EquipoPersonaCard.module.css";

/** Renglones por columna antes de «Ver N más»: que la lista de gente no quede hasta abajo. */
const VISIBLES = 5;
/** Actividades visibles bajo cada persona atrasada. */
const ACTS_VISIBLES = 3;

type ActAtrasadaVista = {
  id?: number;
  folio: string | null;
  titulo: string | null;
  detalle: string;
};

type Renglon = {
  persona: TeamBoardUser;
  principal: ReactNode;
  /** Tono del renglón principal: rojo para el atraso, ámbar para «sin nada». */
  tono?: "peligro" | "aviso";
  secundaria?: ReactNode;
  /** Dato corto a la derecha del nombre («hace 3 días»). */
  meta?: string | null;
  asignarHref?: string;
};

/** Hasta 3 actividades; el resto detrás de «+N más». */
function ListaAtrasadas({ acts }: { acts: ActAtrasadaVista[] }) {
  const [todos, setTodos] = useState(false);
  const vista = todos ? acts : acts.slice(0, ACTS_VISIBLES);
  const resto = acts.length - ACTS_VISIBLES;
  return (
    <span className={s.acts}>
      {vista.map((act, i) => (
        <span key={act.id ?? `${act.folio}-${i}`} className={s.act}>
          <span className={[layout.apilar, s.actTitulo].join(" ")}>
            {act.folio ? <span className={s.folio}>{act.folio}</span> : null}
            {act.folio && act.titulo ? <span className={layout.sep}> · </span> : null}
            {act.titulo ? <span>{act.titulo}</span> : !act.folio ? <span>Actividad sin datos</span> : null}
          </span>
          <span className={s.peligro}>{act.detalle}</span>
        </span>
      ))}
      {resto > 0 ? (
        <button
          type="button"
          className={s.masActs}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setTodos((v) => !v);
          }}
          aria-expanded={todos}
        >
          {todos ? "Ver menos" : `+${resto} más`}
        </button>
      ) : null}
    </span>
  );
}

function Columna({
  titulo,
  punto,
  renglones,
  cuentaExtra,
}: {
  titulo: string;
  punto: string;
  renglones: Renglon[];
  /** Texto chico junto al número de personas, p. ej. «3 actividades». */
  cuentaExtra?: string | null;
}) {
  const [todos, setTodos] = useState(false);
  const id = useId();
  if (renglones.length === 0) return null;
  const vista = todos ? renglones : renglones.slice(0, VISIBLES);
  const resto = renglones.length - VISIBLES;
  return (
    <section className={s.columna} aria-labelledby={id}>
      <h3 id={id} className={s.columnaTitulo}>
        <span className={[s.punto, punto].join(" ")} aria-hidden="true" />
        {titulo}
        <span className={s.cuenta}>{renglones.length}</span>
        {cuentaExtra ? <span className={s.cuentaExtra}>{cuentaExtra}</span> : null}
      </h3>
      <ul className={s.lista}>
        {vista.map((r) => {
          const u = r.persona;
          return (
            <li key={u.id} className={s.renglon}>
              <Link href={`/erp/pizarra/${u.id}`} className={s.enlace}>
                <AvatarAro
                  nombre={u.nombre}
                  avatarUrl={u.avatarUrl}
                  estado={ARO_DE_ESTADO[u.status] ?? "retraso"}
                  atrasada={u.status === "atrasado"}
                  size={32}
                  className={s.avatar}
                />
                <span className={s.textos}>
                  <span className={s.cabeza}>
                    <span className={s.nombre}>{u.nombre}</span>
                    {r.meta ? <span className={s.meta}>{r.meta}</span> : null}
                  </span>
                  <span
                    className={[s.principal, r.tono === "peligro" ? s.peligro : r.tono === "aviso" ? s.aviso : ""]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {r.principal}
                  </span>
                  {r.secundaria ? <span className={s.secundaria}>{r.secundaria}</span> : null}
                </span>
              </Link>
              {r.asignarHref ? (
                <Link href={r.asignarHref} className={s.asignar} aria-label={`Asignar una actividad a ${u.nombre}`}>
                  ＋ Asignar
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
      {resto > 0 ? (
        <button type="button" className={s.mas} onClick={() => setTodos((v) => !v)} aria-expanded={todos}>
          {todos ? "Ver menos" : `Ver ${resto} más`}
        </button>
      ) : null}
    </section>
  );
}

/**
 * Actividades · «Mi equipo», debajo de la franja de KPI: a quién hay que ir a
 * ver hoy y por qué. Tres columnas (se apilan en pantallas angostas):
 * atrasados con todas sus actividades y el motivo, a quién dejaron sin nada
 * asignado y desde cuándo (con lo último que terminó), y quién no ha checado.
 *
 * Columnas vacías no se pintan; si nadie pide atención, el componente tampoco.
 * Solo tiene sentido con el rango «Hoy»: «desde hace cuánto» es de hoy.
 */
export default function AtencionEquipo({
  users,
  ahora = Date.now(),
  asignarHref,
}: {
  users: readonly TeamBoardUser[];
  /** Momento contra el que se cuentan los «hace X min» (el último refresco del tablero). */
  ahora?: number;
  /** Con permiso de asignar: a dónde lleva «＋ Asignar» para esa persona (undefined = sin botón). */
  asignarHref?: (u: TeamBoardUser) => string | undefined;
}) {
  const a = atencionEquipo(users, ahora, { finDeSemana: esFinDeSemanaMx(ahora) });
  if (a.atrasados.length === 0 && a.sinNada.length === 0 && a.sinEntrada.length === 0) return null;

  const totalActs = a.atrasados.reduce((n, x) => n + Math.max(1, x.actividades?.length ?? 1), 0);

  const atrasados: Renglon[] = a.atrasados.map((x) => {
    const acts: ActAtrasadaVista[] = x.actividades?.length
      ? x.actividades.map((act) => ({
          id: act.id,
          folio: act.folio,
          titulo: act.titulo,
          detalle: act.detalle,
        }))
      : [{ folio: x.folio, titulo: x.titulo, detalle: x.detalle }];
    return {
      persona: x.persona,
      principal: <ListaAtrasadas acts={acts} />,
    };
  });

  const sinNada: Renglon[] = a.sinNada.map((x) => {
    const jornada = [x.entrada, x.sinNadaDesde].filter(Boolean);
    return {
      persona: x.persona,
      principal:
        jornada.length > 0 ? (
          <>
            <span className={layout.junto}>{jornada.join(" · ")}</span>
            <span className={layout.partes}>
              {jornada.map((parte, i) => (
                <Fragment key={`${x.persona.id}:${i}:${parte}`}>
                  {i > 0 ? <span className={layout.sep}> · </span> : null}
                  <span>{parte}</span>
                </Fragment>
              ))}
            </span>
          </>
        ) : (
          x.ultima
        ),
      tono: jornada.length > 0 ? "aviso" : undefined,
      secundaria: jornada.length > 0 ? x.ultima : undefined,
      asignarHref: asignarHref?.(x.persona),
    };
  });

  const sinEntrada: Renglon[] = a.sinEntrada.map((x) => ({
    persona: x.persona,
    principal: x.ultima,
    meta: x.haceCuanto,
  }));

  return (
    <Card className={s.tarjeta} aria-label="Quién necesita atención hoy">
      <CardHead title="Para atender hoy" />
      <div className={s.columnas}>
        <Columna
          titulo="Atrasados"
          punto={s.puntoAtrasado}
          renglones={atrasados}
          cuentaExtra={totalActs > 0 ? `${totalActs} ${totalActs === 1 ? "actividad" : "actividades"}` : null}
        />
        <Columna titulo="Sin nada asignado" punto={s.puntoSinNada} renglones={sinNada} />
        <Columna titulo="Sin entrada hoy" punto={s.puntoSinEntrada} renglones={sinEntrada} />
      </div>
    </Card>
  );
}
