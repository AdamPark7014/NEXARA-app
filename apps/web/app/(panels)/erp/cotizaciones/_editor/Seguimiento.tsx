"use client";

import Link from "next/link";
import { useState } from "react";
import {
  aprobarCotizacion,
  formatoFecha,
  formatoMoneda,
  marcarRevisada,
  rechazarCotizacion,
  refoliarCotizacion,
  type CotizacionDetalle,
  type VersionCotizacion,
} from "@/lib/cotizaciones-api";
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
          <h2 id="seguimiento-titulo" className={styles.tituloSeccion} style={{ marginTop: 0 }}>
            Seguimiento
          </h2>
          <p className={styles.ayudaSeccion}>
            Cómo se lee el folio, quién intervino y qué versiones salieron. Esto no va en el PDF.
          </p>
        </div>
        <div className={styles.hojaAcciones}>
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
              className={styles.primaryBtn}
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
            className={styles.primaryBtn}
            disabled={ocupado}
            onClick={() => void hacer(() => refoliarCotizacion(token!, detalle.id), "Folio asignado con nomenclatura.")}
          >
            Asignar folio
          </button>
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
