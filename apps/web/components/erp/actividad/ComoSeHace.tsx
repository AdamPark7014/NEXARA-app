"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge, Progress, RecordSection } from "@/components/base";
import { agruparCampos } from "@/lib/evidencia-grupos";
import {
  MOMENTO_LABEL,
  obtenerCamposEvidencia,
  progresoDeCampos,
  type CampoEvidencia,
  type Momento,
} from "@/lib/evidencia-campos";
import {
  listActivityTimeline,
  type ActivityTimelineEvent,
} from "@/lib/ops-activities-api";
import s from "./ComoSeHace.module.css";

export type LigadoItem = {
  id: string;
  etiqueta: string;
  texto: string;
  href?: string;
};

type Props = {
  activityId: number;
  token: string;
  indicaciones?: string | null;
  ligados?: LigadoItem[];
  /** Pasos del formato ya materializados como campos (nombre + nota). */
  mostrarPasosFormato?: boolean;
};

type CeldaMomento = {
  momento: Momento;
  hechos: number;
  total: number;
  pedido: boolean;
};

type FilaGrupo = {
  key: string;
  etiqueta: string;
  nota: string;
  celdas: CeldaMomento[];
};

const COLUMNAS: Momento[] = ["ANTES", "EN_PROGRESO", "DESPUES"];
const COL_LABEL: Record<Momento, string> = {
  ANTES: "Antes",
  EN_PROGRESO: "Durante",
  DESPUES: "Después",
};

function filasDesdeCampos(campos: CampoEvidencia[]): FilaGrupo[] {
  const ordenados = [...campos].sort((a, b) => a.orden - b.orden || a.id - b.id);
  const grupos = agruparCampos(
    ordenados.map((c) => ({ nombre: c.nombre, momentos: c.momentos, notas: c.notas })),
  );
  return grupos.map((g) => {
    const miembros = g.indices.map((i) => ordenados[i]);
    const celdas: CeldaMomento[] = COLUMNAS.map((momento) => {
      const quePiden = miembros.filter((c) => c.momentos.includes(momento));
      const hechos = quePiden.filter((c) => Boolean(c.fotos?.[momento])).length;
      return {
        momento,
        hechos,
        total: quePiden.length,
        pedido: quePiden.length > 0,
      };
    });
    const etiqueta =
      g.cantidad > 1 ? `${g.base} 1–${g.cantidad}` : g.base;
    return {
      key: `${g.base}-${g.indices.join("-")}`,
      etiqueta,
      nota: g.notas,
      celdas,
    };
  });
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(Math.abs(diff) / 60000);
  if (mins < 2) return diff < 0 ? "En un momento" : "Justo ahora";
  const fmt = (v: string) => (diff < 0 ? `En ${v}` : `Hace ${v}`);
  if (mins < 60) return fmt(`${mins} min`);
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return fmt(`${hrs} h`);
  return fmt(`${Math.round(hrs / 24)} d`);
}

export default function ComoSeHace({
  activityId,
  token,
  indicaciones,
  ligados = [],
  mostrarPasosFormato = true,
}: Props) {
  const [campos, setCampos] = useState<CampoEvidencia[]>([]);
  const [eventos, setEventos] = useState<ActivityTimelineEvent[]>([]);
  const [cargandoCampos, setCargandoCampos] = useState(true);

  useEffect(() => {
    if (!token || !activityId) return;
    let vivo = true;
    setCargandoCampos(true);
    void obtenerCamposEvidencia(token, activityId)
      .then((rows) => {
        if (vivo) setCampos(rows);
      })
      .catch(() => {
        if (vivo) setCampos([]);
      })
      .finally(() => {
        if (vivo) setCargandoCampos(false);
      });
    void listActivityTimeline(token, activityId)
      .then((data) => {
        if (vivo) setEventos((data.events ?? []).slice(0, 5));
      })
      .catch(() => {
        if (vivo) setEventos([]);
      });
    return () => {
      vivo = false;
    };
  }, [token, activityId]);

  const filas = useMemo(() => filasDesdeCampos(campos), [campos]);
  const progreso = useMemo(() => progresoDeCampos(campos), [campos]);
  const ligadosVisibles = ligados.filter((l) => l.texto.trim());

  return (
    <div className={s.layout}>
      <RecordSection
        title="Cómo se hace"
        subtitle={
          cargandoCampos
            ? "Cargando fotos pedidas…"
            : progreso.requeridas === 0
              ? "Sin puntos de evidencia definidos"
              : `${progreso.cumplidas} de ${progreso.requeridas} fotos`
        }
        end={
          progreso.requeridas > 0 ? (
            <div className={s.avance}>
              <Progress
                value={progreso.cumplidas}
                max={progreso.requeridas}
                ariaLabel="Avance de fotos por punto"
              />
            </div>
          ) : null
        }
      >
        {filas.length > 0 ? (
          <div className={s.tablaWrap}>
            <table className={s.tabla}>
              <thead>
                <tr>
                  <th scope="col">Elemento</th>
                  {COLUMNAS.map((m) => (
                    <th key={m} scope="col">
                      {COL_LABEL[m]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <tr key={fila.key}>
                    <td>
                      <div className={s.elemento}>{fila.etiqueta}</div>
                      {fila.nota ? <div className={s.nota}>{fila.nota}</div> : null}
                    </td>
                    {fila.celdas.map((c) => (
                      <td key={c.momento} className={s.celda}>
                        {!c.pedido ? (
                          <span className={s.vacio}>—</span>
                        ) : (
                          <span
                            className={c.hechos >= c.total ? s.ok : s.pendiente}
                            title={MOMENTO_LABEL[c.momento]}
                          >
                            {c.hechos} de {c.total}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {mostrarPasosFormato && filas.length > 0 ? (
          <ol className={s.pasos}>
            {filas.map((fila, i) => (
              <li key={`paso-${fila.key}`}>
                <span className={s.pasoN}>{i + 1}</span>
                <span>
                  {fila.etiqueta}
                  {fila.nota ? <span className={s.pasoNota}> — {fila.nota}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        ) : null}

        {indicaciones?.trim() ? (
          <div className={s.indicaciones}>
            <h3 className={s.indicacionesT}>Indicaciones</h3>
            <p className={s.indicacionesP}>{indicaciones}</p>
          </div>
        ) : null}
      </RecordSection>

      <div className={s.lado}>
        {ligadosVisibles.length > 0 ? (
          <RecordSection title="Ligado a">
            <ul className={s.lista}>
              {ligadosVisibles.map((item) => (
                <li key={item.id} className={s.listaItem}>
                  <span className={s.listaEtiqueta}>{item.etiqueta}</span>
                  {item.href ? (
                    <Link href={item.href} className={s.listaLink}>
                      {item.texto}
                    </Link>
                  ) : (
                    <span>{item.texto}</span>
                  )}
                </li>
              ))}
            </ul>
          </RecordSection>
        ) : null}

        <RecordSection title="Lo último" subtitle={eventos.length ? "Historial reciente" : undefined}>
          {eventos.length === 0 ? (
            <p className={s.vacioTexto}>Todavía no hay eventos.</p>
          ) : (
            <ul className={s.lista}>
              {eventos.map((ev) => (
                <li key={ev.id} className={s.evento}>
                  <div className={s.eventoTitulo}>{ev.title}</div>
                  <div className={s.eventoMeta}>
                    <Badge tone="neutral" size="sm">
                      {relativeTime(ev.at)}
                    </Badge>
                    {ev.subtitle ? <span>{ev.subtitle}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </RecordSection>
      </div>
    </div>
  );
}

/** Pure helper exported for tests. */
export function filasComoSeHace(campos: CampoEvidencia[]): FilaGrupo[] {
  return filasDesdeCampos(campos);
}
