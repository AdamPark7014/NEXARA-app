"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import "@react-pdf-viewer/core/lib/styles/index.css";
import { pdfDeCotizacion } from "@/lib/cotizaciones-api";
import styles from "./editor.module.css";

/*
 * Se dibuja con pdf.js (el mismo visor de «Hoja de servicio» y tickets), no con un <iframe>: la CSP
 * de la web (`default-src 'self'`, sin `frame-src`) bloquea enmarcar un `blob:` y la vista previa
 * se quedaba en blanco.
 */
const Worker = dynamic(() => import("@react-pdf-viewer/core").then((m) => m.Worker), { ssr: false });
const Viewer = dynamic(() => import("@react-pdf-viewer/core").then((m) => m.Viewer), { ssr: false });

/**
 * El PDF real, el mismo que recibe el cliente, al lado del editor.
 *
 * Se vuelve a pedir después de cada guardado (con una pausa, para no generar un PDF por tecla) y
 * solo mientras está a la vista. Mientras llega el nuevo se sigue viendo el anterior, en la misma
 * página en la que estaba quien edita.
 */
export default function VistaPrevia({
  cotizacionId,
  token,
  version,
  visible,
}: {
  cotizacionId: number | null;
  token: string | null;
  /** Sube con cada guardado: es la señal para volver a pedir el PDF. */
  version: number;
  visible: boolean;
}) {
  const [pdf, setPdf] = useState<{ datos: Uint8Array; url: string; n: number } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const pagina = useRef(0);
  const urlActual = useRef<string | null>(null);

  useEffect(() => {
    if (!visible || !cotizacionId || !token) return;
    const control = new AbortController();
    const t = setTimeout(
      () => {
        setCargando(true);
        setError(null);
        pdfDeCotizacion(token, cotizacionId, control.signal)
          .then(async (blob) => {
            const bytes = new Uint8Array(await blob.arrayBuffer());
            // pdf.js se queda (transfiere al worker) el ArrayBuffer de un Uint8Array que lo ocupa
            // completo, y el visor vuelve a leer ese arreglo al compararlo: «detached ArrayBuffer»
            // tumbaba la página. Con un byte de holgura pdf.js trabaja con una copia.
            const datos = new Uint8Array(new ArrayBuffer(bytes.byteLength + 1), 0, bytes.byteLength);
            datos.set(bytes);
            const url = URL.createObjectURL(blob);
            if (urlActual.current) URL.revokeObjectURL(urlActual.current);
            urlActual.current = url;
            setPdf((previo) => ({ datos, url, n: (previo?.n ?? 0) + 1 }));
          })
          .catch((e) => {
            if ((e as Error)?.name === "AbortError") return;
            setError(e instanceof Error ? e.message : "No se pudo generar el PDF");
          })
          .finally(() => {
            if (!control.signal.aborted) setCargando(false);
          });
      },
      pdf ? 900 : 150,
    );
    return () => {
      clearTimeout(t);
      control.abort();
    };
    // `pdf` solo decide la pausa; no debe volver a disparar la petición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cotizacionId, token, version, visible, intento]);

  useEffect(
    () => () => {
      if (urlActual.current) URL.revokeObjectURL(urlActual.current);
    },
    [],
  );

  return (
    <aside className={styles.vista} aria-label="Vista previa del PDF">
      <div className={styles.vistaCabeza}>
        <span>
          <strong>Vista previa</strong> · el PDF que recibe el cliente
        </span>
        <span className={styles.hojaAcciones}>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={() => setIntento((n) => n + 1)}
            disabled={!cotizacionId || cargando}
          >
            ↻ Actualizar
          </button>
          {pdf ? (
            <a className={styles.ghostBtn} href={pdf.url} target="_blank" rel="noreferrer">
              ↗ Abrir
            </a>
          ) : null}
        </span>
      </div>
      <div className={styles.vistaMarco} data-testid="vista-previa-pdf">
        {pdf ? (
          <div className={styles.vistaVisor}>
            <Worker workerUrl="/pdf.worker.min.js">
              <Viewer
                key={pdf.n}
                fileUrl={pdf.datos}
                initialPage={pagina.current}
                defaultScale={"PageWidth" as never}
                onPageChange={(e: { currentPage: number }) => {
                  pagina.current = e.currentPage;
                }}
              />
            </Worker>
          </div>
        ) : null}
        {!cotizacionId ? (
          <div className={styles.vistaCapa}>
            La vista previa aparece en cuanto el borrador se guarda: escribe para quién es la cotización.
          </div>
        ) : error ? (
          <div className={styles.vistaCapa} role="alert">
            <span>
              {error}
              <br />
              <button type="button" className={styles.secondaryBtn} style={{ marginTop: 10 }} onClick={() => setIntento((n) => n + 1)}>
                Reintentar
              </button>
            </span>
          </div>
        ) : cargando && !pdf ? (
          <div className={styles.vistaCapa}>Armando el PDF…</div>
        ) : cargando ? (
          <div className={`${styles.vistaCapa} ${styles.vistaCapaSuave}`} aria-live="polite">
            <span>Actualizando…</span>
          </div>
        ) : null}
      </div>
      <p className={styles.pista}>Se actualiza sola cada vez que se guarda. «Abrir» la muestra en otra pestaña.</p>
    </aside>
  );
}
