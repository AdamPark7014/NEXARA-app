"use client";

import { useEffect } from "react";
import Link from "next/link";
import styles from "./integra.module.css";

export default function IntegraError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Integra] Error boundary:", error);
  }, [error]);

  return (
    <div className={styles.igBoundary}>
      <div className={styles.igBoundaryCard} role="alert">
        <h2 className={styles.igBoundaryTitle}>Error en Integra</h2>
        <p className={styles.igBoundaryCopy}>
          No se pudo cargar esta sección. Reintenta o vuelve a la consola Ops.
        </p>
        <pre className={styles.igBoundaryDetail}>
          {error.message}
          {error.digest ? `\n\nDigest: ${error.digest}` : ""}
        </pre>
        <div className={styles.igBoundaryActions}>
          <button type="button" className={styles.btnPrimary} onClick={reset}>
            Reintentar
          </button>
          <Link href="/integra" className={styles.igBoundaryLink}>
            Ir a Ops
          </Link>
        </div>
      </div>
    </div>
  );
}
