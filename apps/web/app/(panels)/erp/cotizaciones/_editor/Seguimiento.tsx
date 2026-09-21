"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  aprobarCotizacion,
  asignarCotizacion,
  companerosQueCotizan,
  formatoFecha,
  formatoMoneda,
  marcarRevisada,
  rechazarCotizacion,
  refoliarCotizacion,
  type CompaneroQueCotiza,
  type CotizacionDetalle,
  type VersionCotizacion,
} from "@/lib/cotizaciones-api";
import { Ayuda } from "./campos";
import Dialogo from "./Dialogo";
import FolioExplicado from "./FolioExplicado";
import styles from "./editor.module.css";

/**
 * Seguimiento: el folio explicado, quién intervino y con qué papel, versiones y las decisiones
 * (revisar, aprobar, rechazar). No es parte del documento que ve el cliente.
 */
export default function Seguimiento({
  detalle,
  versiones,
  token,
  pendientesAlEnviar,
  onDetalle,
  onError,
  onAviso,
}: {
  detalle: CotizacionDetalle;
  versiones: VersionCotizacion[];
  token: string | null;
  pendientesAlEnviar: string | null;
  onDetalle: (d: CotizacionDetalle | null) => void;
  onError: (m: string | null) => void;
  onAviso: (m: string) => void;
}) {
  const [rechazo, setRechazo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [traspaso, setTraspaso] = useState(false);
  const [companeros, setCompaneros] = useState<CompaneroQueCotiza[] | null>(null);
  const [destinatario, setDestinatario] = useState("");
  const [notaTraspaso, setNotaTraspaso] = useState("");

  // La lista de quién cotiza se pide al abrir el diálogo, no al pintar el seguimiento: es una
  // llamada que solo hace falta si de verdad vas a pasársela a alguien.
  useEffect(() => {
    if (!traspaso || !token || companeros) return;
    let vivo = true;
    companerosQueCotizan(token)
      .then((lista) => {
        if (vivo) setCompaneros(lista);
      })
      .catch((e) => {
        if (vivo) onError(e instanceof Error ? e.message : "No se pudo leer quién puede cotizar");
      });
    return () => {
      vivo = false;
    };
  }, [traspaso, token, companeros, onError]);

  function cerrarTraspaso() {
    setTraspaso(false);
    setDestinatario("");
    setNotaTraspaso("");
  }

  async function hacer(accion: () => Promise<CotizacionDetalle>, aviso: string) {
    if (!token) return false;
    setOcupado(true);
    onError(null);
    try {
      onDetalle(await accion());
      onAviso(aviso);
      return true;
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo completar");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  const estado = detalle.estado;

  return (
    <section id="seguimiento" className={styles.seguimiento} aria-labelledby="seguimiento-titulo">
      <div className={styles.hojaCabeza}>
        <div className={styles.hojaTitulos}>
          <div className={styles.hojaLinea}>
            <h2 id="seguimiento-titulo" className={styles.tituloSeccion}>
              Seguimiento
            </h2>
            <Ayuda titulo="el seguimiento">
              Cómo se lee el folio, quién intervino y qué versiones salieron. Esto no va en el PDF.
            </Ayuda>
          </div>
        </div>
        <div className={styles.hojaAcciones}>
          {!detalle.bloqueada ? (
            <button
              type="button"
              className={styles.secondaryBtn}
              disabled={ocupado || !token}
              onClick={() => setTraspaso(true)}
            >
              Enviar a un compañero
            </button>
          ) : null}
          {estado !== "APROBADA" ? (
            <button
              type="button"
              className={styles.secondaryBtn}
              disabled={ocupado}
              onClick={() => void hacer(() => marcarRevisada(token!, detalle.id), "Quedaste registrado como «Revisó».")}
            >
              Marcar revisada
            </button>
          ) : null}
          {estado === "ENVIADA" ? (
            <button
              type="button"
              className={styles.secondaryBtn}
              disabled={ocupado}
              onClick={() => void hacer(() => aprobarCotizacion(token!, detalle.id), "Cotización aprobada.")}
            >
              Aprobar
            </button>
          ) : null}
          {estado === "ENVIADA" || estado === "BORRADOR" ? (
            <button type="button" className={styles.dangerBtn} disabled={ocupado} onClick={() => setRechazo("")}>
              {estado === "BORRADOR" ? "Descartar" : "Marcar rechazada"}
            </button>
          ) : null}
        </div>
      </div>

      {detalle.necesitaRefolio ? (
        <div className={`${styles.aviso} ${styles.avisoAlerta}`}>
          <p>
            Este borrador trae un folio viejo (<strong>{detalle.folio}</strong>) que no dice de quién es. Asígnale el folio
            con la nomenclatura de {detalle.elaboro?.nombre || "quien la hizo"}: el anterior queda en versiones.
          </p>
          <button
            type="button"
            className={styles.secondaryBtn}
            disabled={ocupado}
            onClick={() => void hacer(() => refoliarCotizacion(token!, detalle.id), "Folio asignado con nomenclatura.")}
          >
            Asignar folio
          </button>
        </div>
      ) : null}

      {detalle.asignadoA ? (
        <div className={`${styles.aviso} ${styles.avisoInfo}`}>
          <p>
            Le toca a <strong>{detalle.asignadoA.nombre}</strong>
            {detalle.asignadoA.puesto ? ` (${detalle.asignadoA.puesto})` : ""}
            {detalle.asignadoPor ? `, se la pasó ${detalle.asignadoPor.nombre}` : ""}
            {detalle.asignadoEn ? ` el ${formatoFecha(detalle.asignadoEn)}` : ""}.
            {detalle.asignadoNota ? ` «${detalle.asignadoNota}»` : ""}
          </p>
        </div>
      ) : null}

      <FolioExplicado
        folio={detalle.folio}
        elaboro={detalle.elaboro}
        intervinieron={detalle.participantes}
        revision={detalle.revision}
        pendientes={pendientesAlEnviar}
      />

      <hr className={styles.separador} />

      <h3 className={styles.etiqueta} style={{ margin: "0 0 10px" }}>
        Quién intervino
      </h3>
      {detalle.participantes.length ? (
        <ul className={styles.linea}>
          {detalle.participantes.map((p) => (
            <li className={styles.lineaItem} key={`${p.userId}-${p.rol}`}>
              <span className={styles.lineaRol}>{p.rolEtiqueta}</span>
              <span>
                <span className={styles.siglas} title={p.clave}>
                  {p.siglas}
                </span>{" "}
                {p.nombre}
                {p.puesto ? <span className={styles.lineaFecha}> · {p.puesto}</span> : null}
              </span>
              <span className={styles.lineaFecha}>{formatoFecha(p.at)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.pista}>
          Nadie registrado todavía. Quien la elabora, revisa, aprueba o envía queda aquí solo, y sus siglas entran al folio.
        </p>
      )}

      {versiones.length ? (
        <>
          <hr className={styles.separador} />
          <h3 className={styles.etiqueta} style={{ margin: "0 0 10px" }}>
            Versiones guardadas
          </h3>
          <ul className={styles.linea}>
            {versiones.map((v) => (
              <li className={styles.lineaItem} key={v.version}>
                <span className={styles.lineaRol}>v{v.version}</span>
                <span>
                  <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700 }}>{v.folio ?? "—"}</span> ·{" "}
                  {formatoMoneda(v.total)}
                  {v.note ? ` · ${v.note}` : ""}
                </span>
                <span className={styles.lineaFecha}>
                  {formatoFecha(v.at)}
                  {v.por ? ` · ${v.por.nombre}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {detalle.actividades?.length ? (
        <p className={styles.pista} style={{ marginTop: 14 }}>
          Actividad comercial ligada:{" "}
          {detalle.actividades.map((a) => (
            <Link key={a.id} href={`/erp/actividades/${a.id}`} style={{ marginRight: 8 }}>
              {a.anNumber || `#${a.id}`}
            </Link>
          ))}
        </p>
      ) : null}

      {traspaso ? (
        <Dialogo
          titulo="Enviar a un compañero"
          onCerrar={cerrarTraspaso}
          ocupado={ocupado}
          pie={
            <>
              <button type="button" className={styles.ghostBtn} onClick={cerrarTraspaso} disabled={ocupado}>
                Cancelar
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={ocupado || !destinatario}
                onClick={async () => {
                  const ok = await hacer(
                    () => asignarCotizacion(token!, detalle.id, Number(destinatario), notaTraspaso),
                    "Se la pasaste a tu compañero y ya le llegó el aviso.",
                  );
                  if (ok) cerrarTraspaso();
                }}
              >
                Enviar
              </button>
            </>
          }
        >
          <div className={styles.campo}>
            <label className={styles.etiqueta} htmlFor="destinatario-traspaso">
              A quién
            </label>
            <select
              id="destinatario-traspaso"
              className={styles.select}
              value={destinatario}
              disabled={!companeros}
              onChange={(e) => setDestinatario(e.target.value)}
            >
              <option value="">{companeros ? "Elige a un compañero…" : "Cargando…"}</option>
              {(companeros ?? []).map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.nombre}
                  {c.puesto ? ` · ${c.puesto}` : ""}
                </option>
              ))}
            </select>
            <p className={styles.pista}>
              Solo sale quien puede cotizar. La cotización sigue siendo de{" "}
              {detalle.elaboro?.nombre || "quien la elaboró"}: el folio no cambia.
            </p>
          </div>

          <div className={styles.campo}>
            <label className={styles.etiqueta} htmlFor="nota-traspaso">
              Nota <span style={{ fontWeight: 400 }}>(opcional)</span>
            </label>
            <textarea
              id="nota-traspaso"
              className={styles.textoCampo}
              style={{ minHeight: "4.5rem", resize: "vertical", overflow: "auto" }}
              maxLength={500}
              value={notaTraspaso}
              onChange={(e) => setNotaTraspaso(e.target.value)}
              placeholder="Ej. Falta el precio del NVR; revísalo y mándala tú."
            />
            <p className={styles.pista}>Va en el aviso que le llega.</p>
          </div>

          {companeros?.length === 0 ? (
            <p className={styles.pista}>No hay nadie más que pueda cotizar ahora mismo.</p>
          ) : null}
        </Dialogo>
      ) : null}

      {rechazo !== null ? (
        <Dialogo
          titulo={estado === "BORRADOR" ? "Descartar la cotización" : "El cliente la rechazó"}
          onCerrar={() => setRechazo(null)}
          ocupado={ocupado}
          pie={
            <>
              <button type="button" className={styles.ghostBtn} onClick={() => setRechazo(null)} disabled={ocupado}>
                Cancelar
              </button>
              <button
                type="button"
                className={styles.dangerBtn}
                disabled={ocupado || rechazo.trim().length < 5}
                onClick={async () => {
                  const ok = await hacer(
                    () => rechazarCotizacion(token!, detalle.id, rechazo.trim()),
                    "Cotización marcada como rechazada.",
                  );
                  if (ok) setRechazo(null);
                }}
              >
                Confirmar
              </button>
            </>
          }
        >
          <div className={styles.campo}>
            <label className={styles.etiqueta} htmlFor="motivo-rechazo">
              Motivo (queda en el historial y le llega a su cadena de mando)
            </label>
            <textarea
              id="motivo-rechazo"
              className={styles.textoCampo}
              style={{ minHeight: "5rem", resize: "vertical", overflow: "auto" }}
              value={rechazo}
              onChange={(e) => setRechazo(e.target.value)}
              placeholder="Ej. El cliente eligió otro proveedor por precio."
            />
            <p className={styles.pista}>Al menos 5 caracteres.</p>
          </div>
        </Dialogo>
      ) : null}
    </section>
  );
}
