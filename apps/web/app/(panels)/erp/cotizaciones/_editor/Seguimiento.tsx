"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import ForwardToInboxOutlinedIcon from "@mui/icons-material/ForwardToInboxOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import { Alert, Button, Select, Textarea, Timeline, TimelineItem } from "@/components/base";
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
import { formatApiError } from "@/lib/erp-api";
import { Ayuda, Campo } from "./campos";
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
        if (vivo) onError(formatApiError(e, "No se pudo leer quién puede cotizar"));
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
      onError(formatApiError(e, "No se pudo completar"));
      return false;
    } finally {
      setOcupado(false);
    }
  }

  const estado = detalle.estado;

  return (
    <section id="seguimiento" className={styles.seguimiento} aria-labelledby="seguimiento-titulo">
      <div className={styles.hojaCabeza}>
        <span className={styles.numero} aria-hidden>
          <HistoryRoundedIcon />
        </span>
        <div className={styles.hojaTitulos}>
          <div className={styles.hojaLinea}>
            <h2 id="seguimiento-titulo" className={styles.tituloSeccion}>
              Seguimiento
            </h2>
            <Ayuda titulo="el seguimiento">
              Cómo se lee el folio, quién intervino y qué versiones salieron. Esto no va en el PDF.
            </Ayuda>
          </div>
          <p className={styles.ayudaSeccion}>Historial, folio y decisiones. No va en el PDF.</p>
        </div>
        <div className={styles.hojaAcciones}>
          {estado === "ENVIADA" || estado === "BORRADOR" ? (
            <Button size="sm" variant="danger-ghost" disabled={ocupado} onClick={() => setRechazo("")}>
              {estado === "BORRADOR" ? "Descartar" : "Marcar rechazada"}
            </Button>
          ) : null}
          {!detalle.bloqueada ? (
            <Button
              size="sm"
              iconStart={<ForwardToInboxOutlinedIcon />}
              disabled={ocupado || !token}
              onClick={() => setTraspaso(true)}
            >
              Enviar a un compañero
            </Button>
          ) : null}
          {estado !== "APROBADA" ? (
            <Button
              size="sm"
              disabled={ocupado}
              onClick={() => void hacer(() => marcarRevisada(token!, detalle.id), "Quedaste registrado como «Revisó».")}
            >
              Marcar revisada
            </Button>
          ) : null}
          {estado === "ENVIADA" ? (
            <Button
              size="sm"
              variant="tonal"
              iconStart={<TaskAltOutlinedIcon />}
              disabled={ocupado}
              onClick={() => void hacer(() => aprobarCotizacion(token!, detalle.id), "Cotización aprobada.")}
            >
              Aprobar
            </Button>
          ) : null}
        </div>
      </div>

      <div className={styles.hojaCuerpo}>
        {detalle.necesitaRefolio ? (
          <Alert
            tone="warning"
            className={styles.avisoBloque}
            action={
              <Button
                size="sm"
                disabled={ocupado}
                onClick={() => void hacer(() => refoliarCotizacion(token!, detalle.id), "Folio asignado con nomenclatura.")}
              >
                Asignar folio
              </Button>
            }
          >
            Este borrador trae un folio viejo (<strong>{detalle.folio}</strong>) que no dice de quién es. Asígnale el folio
            con la nomenclatura de {detalle.elaboro?.nombre || "quien la hizo"}: el anterior queda en versiones.
          </Alert>
        ) : null}

        {detalle.asignadoA ? (
          <Alert tone="info" className={styles.avisoBloque}>
            Le toca a <strong>{detalle.asignadoA.nombre}</strong>
            {detalle.asignadoA.puesto ? ` (${detalle.asignadoA.puesto})` : ""}
            {detalle.asignadoPor ? `, se la pasó ${detalle.asignadoPor.nombre}` : ""}
            {detalle.asignadoEn ? ` el ${formatoFecha(detalle.asignadoEn)}` : ""}.
            {detalle.asignadoNota ? ` «${detalle.asignadoNota}»` : ""}
          </Alert>
        ) : null}

        <FolioExplicado
          folio={detalle.folio}
          elaboro={detalle.elaboro}
          intervinieron={detalle.participantes}
          revision={detalle.revision}
          pendientes={pendientesAlEnviar}
        />

        <hr className={styles.separador} />

        <h3 className={styles.subtitulo}>Quién intervino</h3>
        {detalle.participantes.length ? (
          <Timeline ariaLabel="Quién intervino">
            {detalle.participantes.map((p) => (
              <TimelineItem
                key={`${p.userId}-${p.rol}`}
                state="done"
                icon={
                  <span className={styles.siglasPunto} title={p.clave ?? undefined}>
                    {p.siglas}
                  </span>
                }
                title={
                  <>
                    <b>{p.nombre}</b> · {p.rolEtiqueta}
                  </>
                }
                meta={[p.puesto, formatoFecha(p.at)].filter(Boolean).join(" · ")}
              />
            ))}
          </Timeline>
        ) : (
          <p className={styles.pista}>
            Nadie registrado todavía. Quien la elabora, revisa, aprueba o envía queda aquí solo, y sus siglas entran al folio.
          </p>
        )}

        {versiones.length ? (
          <>
            <hr className={styles.separador} />
            <h3 className={styles.subtitulo}>Versiones guardadas</h3>
            <ul className={styles.linea}>
              {versiones.map((v) => (
                <li className={styles.lineaItem} key={v.version}>
                  <span className={styles.lineaRol}>v{v.version}</span>
                  <span>
                    <span className={styles.mono}>{v.folio ?? "—"}</span> ·{" "}
                    <span className={styles.cifra}>{formatoMoneda(v.total)}</span>
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
          <p className={`${styles.pista} ${styles.ligadas}`}>
            Actividad comercial ligada:{" "}
            {detalle.actividades.map((a) => (
              <Link key={a.id} href={`/erp/actividades/${a.id}`} className={styles.enlace}>
                {a.anNumber || `#${a.id}`}
              </Link>
            ))}
          </p>
        ) : null}
      </div>

      {traspaso ? (
        <Dialogo
          titulo="Enviar a un compañero"
          onCerrar={cerrarTraspaso}
          ocupado={ocupado}
          pie={
            <>
              <Button variant="tertiary" onClick={cerrarTraspaso} disabled={ocupado}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                loading={ocupado}
                disabled={!destinatario}
                onClick={async () => {
                  const ok = await hacer(
                    () => asignarCotizacion(token!, detalle.id, Number(destinatario), notaTraspaso),
                    "Se la pasaste a tu compañero y ya le llegó el aviso.",
                  );
                  if (ok) cerrarTraspaso();
                }}
              >
                Enviar
              </Button>
            </>
          }
        >
          <Campo
            etiqueta="A quién"
            htmlFor="destinatario-traspaso"
            pista={
              <>
                Solo sale quien puede cotizar. La cotización sigue siendo de{" "}
                {detalle.elaboro?.nombre || "quien la elaboró"}: el folio no cambia.
              </>
            }
          >
            <Select
              id="destinatario-traspaso"
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
            </Select>
          </Campo>

          <Campo
            etiqueta={
              <>
                Nota <span className={styles.etiquetaOpcional}>(opcional)</span>
              </>
            }
            htmlFor="nota-traspaso"
            pista="Va en el aviso que le llega."
          >
            <Textarea
              id="nota-traspaso"
              className={styles.areaNota}
              maxLength={500}
              value={notaTraspaso}
              onChange={(e) => setNotaTraspaso(e.target.value)}
              placeholder="Ej. Falta el precio del NVR; revísalo y mándala tú."
            />
          </Campo>

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
              <Button variant="tertiary" onClick={() => setRechazo(null)} disabled={ocupado}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                loading={ocupado}
                disabled={rechazo.trim().length < 5}
                onClick={async () => {
                  const ok = await hacer(
                    () => rechazarCotizacion(token!, detalle.id, rechazo.trim()),
                    "Cotización marcada como rechazada.",
                  );
                  if (ok) setRechazo(null);
                }}
              >
                Confirmar
              </Button>
            </>
          }
        >
          <Campo
            etiqueta="Motivo (queda en el historial y le llega a su cadena de mando)"
            htmlFor="motivo-rechazo"
            pista="Al menos 5 caracteres."
          >
            <Textarea
              id="motivo-rechazo"
              className={styles.areaNota}
              value={rechazo}
              onChange={(e) => setRechazo(e.target.value)}
              placeholder="Ej. El cliente eligió otro proveedor por precio."
            />
          </Campo>
        </Dialogo>
      ) : null}
    </section>
  );
}
