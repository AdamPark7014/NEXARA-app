"use client";

import { useEffect } from "react";
import styles from "./PanelState.module.scss";

/**
 * Pantalla de error de un panel (para `error.tsx`). Una frase y Reintentar.
 * El detalle técnico queda plegado para quien lo tenga que reportar.
 */
export default function PanelError({
  error,
  reset,
  scope = "panel",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /** Se conserva para quien ya lo pasa; el estado ya no enlaza al inicio. */
  homeHref?: string;
  /** Nombre corto para el registro de consola (erp, finance, hr…). */
  scope?: string;
}) {
  useEffect(() => {
    console.error(`[${scope}] error capturado por el límite de errores`, error);
  }, [error, scope]);

  return (
    <div className={styles.wrap} role="alert">
      <div className={styles.card}>
        <span className={styles.icon} data-tone="danger" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 3.5 21.5 20h-19L12 3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            <path d="M12 10v4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            <circle cx="12" cy="17" r="1" fill="currentColor" />
          </svg>
        </span>
        <h2 className={styles.title}>Esta sección no cargó bien.</h2>
        <div className={styles.actions}>
          <button type="button" className={styles.btnPrimary} onClick={reset}>
            Reintentar
          </button>
        </div>
        {error.digest ? (
          <p className={styles.code}>
            Código: <span className="ui-num">{error.digest}</span>
          </p>
        ) : null}
        <details className={styles.details}>
          <summary>Detalles técnicos</summary>
          <pre>
            {error.message}
            {error.stack ? `\n\n${error.stack}` : ""}
          </pre>
        </details>
      </div>
    </div>
  );
}

export { PanelError };
