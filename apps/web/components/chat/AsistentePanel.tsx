"use client";

import { useEffect, useRef, useState } from "react";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import CloseIcon from "@mui/icons-material/Close";
import styles from "../WorkspaceChat.module.css";
import EntityCards from "./EntityCards";
import { renderMessageBody } from "./rich-text";
import {
  crearActividadPropuesta,
  preguntaVisible,
  type PropuestaChat,
  type RespuestaAsistenteChat,
} from "@/lib/asistente-chat-api";

export type ItemAsistente = {
  id: string;
  /** Markdown tal como se escribió (con la mención). */
  pregunta: string;
  estado: "esperando" | "listo" | "error";
  respuesta?: RespuestaAsistenteChat;
  error?: string;
};

type Creacion = { estado: "creando" } | { estado: "creada"; id: number; anNumber?: string } | { estado: "error"; error: string } | { estado: "descartada" };

/**
 * Conversación con el asistente dentro de #general, encima del redactor. Solo la ve quien pregunta y
 * se borra al recargar: el canal no recibe nada. Las propuestas de «asígnale a…» se crean una por una
 * con «Crear», nunca solas.
 */
export default function AsistentePanel({
  items,
  token,
  onSugerencia,
  onCerrar,
}: {
  items: ItemAsistente[];
  token: string;
  onSugerencia: (texto: string) => void;
  onCerrar: () => void;
}) {
  const listaRef = useRef<HTMLDivElement | null>(null);
  const [creaciones, setCreaciones] = useState<Record<string, Creacion>>({});

  useEffect(() => {
    const el = listaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);

  const crear = async (clave: string, p: PropuestaChat) => {
    setCreaciones((c) => ({ ...c, [clave]: { estado: "creando" } }));
    try {
      const r = await crearActividadPropuesta(token, p.payload);
      setCreaciones((c) => ({ ...c, [clave]: { estado: "creada", id: r.id, anNumber: r.anNumber } }));
    } catch (e) {
      setCreaciones((c) => ({ ...c, [clave]: { estado: "error", error: e instanceof Error ? e.message : "No se pudo crear." } }));
    }
  };

  if (!items.length) return null;

  return (
    <section className={styles.asistPanel} aria-label="Asistente NEXARA">
      <header className={styles.asistHead}>
        <span className={styles.asistIcon} aria-hidden="true">
          <SmartToyOutlinedIcon sx={{ fontSize: 16 }} />
        </span>
        <strong>Asistente NEXARA</strong>
        <span className={styles.asistBadge}>Solo tú lo ves</span>
        <button type="button" className={styles.asistClose} aria-label="Cerrar el asistente" onClick={onCerrar}>
          <CloseIcon aria-hidden="true" sx={{ fontSize: 16 }} />
        </button>
      </header>
      <div className={styles.asistLista} ref={listaRef} aria-live="polite">
        {items.map((it) => (
          <div key={it.id} className={styles.asistTurno}>
            <div className={styles.asistPregunta}>{preguntaVisible(it.pregunta) || "…"}</div>
            {it.estado === "esperando" ? (
              <div className={`${styles.asistRespuesta} ${styles.asistPensando}`}>
                <span className={styles.typingDots}>
                  <span />
                  <span />
                  <span />
                </span>
                Buscando…
              </div>
            ) : it.estado === "error" ? (
              <div className={`${styles.asistRespuesta} ${styles.asistError}`} role="alert">
                {it.error}
              </div>
            ) : it.respuesta ? (
              <div className={styles.asistRespuesta}>
                <div className={styles.asistTexto}>{renderMessageBody(it.respuesta.texto)}</div>
                <EntityCards body={it.respuesta.texto} token={token} />
                {it.respuesta.accion?.propuestas.map((p, i) => {
                  const clave = `${it.id}-${i}`;
                  const c = creaciones[clave];
                  if (c?.estado === "descartada") return null;
                  return (
                    <div key={clave} className={styles.asistPropuesta}>
                      <div className={styles.asistPropTitulo}>{p.titulo}</div>
                      <div className={styles.asistPropMeta}>
                        {p.responsable ? <span>Para {p.responsable}</span> : <span>Sin responsable</span>}
                        {p.cuando ? <span>{p.cuando}</span> : null}
                      </div>
                      {p.faltantes.length ? (
                        <div className={styles.asistPropFalta}>
                          Falta: {p.faltantes.join(", ")}. Complétala en{" "}
                          <a href="/erp/pizarra?vista=equipo">Mi equipo › Asignar</a>.
                        </div>
                      ) : null}
                      {p.avisos.map((a) => (
                        <div key={a} className={styles.asistPropAviso}>
                          {a}
                        </div>
                      ))}
                      <div className={styles.asistPropAcciones}>
                        {c?.estado === "creada" ? (
                          <a className={styles.ecardOpen} href={`/erp/actividades/${c.id}`}>
                            Creada {c.anNumber ?? ""} · Abrir
                          </a>
                        ) : (
                          <>
                            <button
                              type="button"
                              className={styles.asistCrear}
                              disabled={c?.estado === "creando" || p.faltantes.length > 0}
                              onClick={() => void crear(clave, p)}
                            >
                              {c?.estado === "creando" ? "Creando…" : "Crear"}
                            </button>
                            <button
                              type="button"
                              className={styles.asistDescartar}
                              onClick={() => setCreaciones((x) => ({ ...x, [clave]: { estado: "descartada" } }))}
                            >
                              Descartar
                            </button>
                          </>
                        )}
                        {c?.estado === "error" ? <span className={styles.asistPropFalta}>{c.error}</span> : null}
                      </div>
                    </div>
                  );
                })}
                <div className={styles.asistPie}>
                  {it.respuesta.sugerencias.map((s) => (
                    <button key={s} type="button" className={styles.asistChip} onClick={() => onSugerencia(s)}>
                      {s}
                    </button>
                  ))}
                  <span className={styles.asistFuente}>
                    {it.respuesta.fuente === "ia" ? "Respondido con IA" : "Respondido con datos de NEXARA"}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
