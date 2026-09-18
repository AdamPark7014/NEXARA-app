"use client";

import { useEffect, useRef, useState } from "react";
import { pdfDeCotizacion } from "@/lib/cotizaciones-api";
import styles from "./editor.module.css";

/**
 * El PDF real, el mismo que recibe el cliente, al lado del editor.
 *
 * Se vuelve a pedir después de cada guardado (con una pausa, para no generar un PDF por tecla) y
 * solo mientras está a la vista. Mientras llega el nuevo se sigue viendo el anterior.
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
  const [url, setUrl] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const actual = useRef<string | null>(null);

  useEffect(() => {
    if (!visible || !cotizacionId || !token) return;
    const control = new AbortController();
    const t = setTimeout(() => {
      setCargando(true);
      setError(null);
      pdfDeCotizacion(token, cotizacionId, control.signal)
        .then((blob) => {
          const nueva = URL.createObjectURL(blob);
          if (actual.current) URL.revokeObjectURL(actual.current);
          actual.current = nueva;
          setUrl(nueva);
        })
        .catch((e) => {
          if ((e as Error)?.name === "AbortError") return;
          setError(e instanceof Error ? e.message : "No se pudo generar el PDF");
        })
        .finally(() => {
          if (!control.signal.aborted) setCargando(false);
        });
    }, url ? 900 : 150);
    return () => {
      clearTimeout(t);
      control.abort();
    };
    // `url` solo decide la pausa; no debe volver a disparar la petición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cotizacionId, token, version, visible, intento]);

  useEffect(
    () => () => {
      if (actual.current) URL.revokeObjectURL(actual.current);
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
          {url ? (
            <a className={styles.ghostBtn} href={url} target="_blank" rel="noreferrer">
              ↗ Abrir
            </a>
          ) : null}
        </span>
      </div>
      <div className={styles.vistaMarco}>
        {url ? <iframe title="Vista previa del PDF de la cotización" src={`${url}#view=FitH&toolbar=0`} /> : null}
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
        ) : cargando && !url ? (
          <div className={styles.vistaCapa}>Armando el PDF…</div>
        ) : cargando ? (
          <div className={`${styles.vistaCapa} ${styles.vistaCapaSuave}`} aria-live="polite">
            <span>Actualizando…</span>
          </div>
        ) : null}
      </div>
      <p className={styles.pista}>
        En el teléfono, si no ves el PDF aquí, usa «Abrir». Se actualiza solo cada vez que se guarda.
      </p>
    </aside>
  );
}
