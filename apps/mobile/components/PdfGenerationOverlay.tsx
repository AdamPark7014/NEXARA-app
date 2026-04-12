"use client";

import React from "react";
import styles from "./PdfGenerationOverlay.module.css";

type PdfGenerationOverlayProps = {
  open: boolean;
  /** 0–100 */
  progress: number;
  title?: string;
  /** `fixed`: pantalla completa. `inline`: solo tarjeta (p. ej. dentro de un modal). */
  variant?: "fixed" | "inline";
};

export default function PdfGenerationOverlay({
  open,
  progress,
  title = "Generando archivo…",
  variant = "fixed",
}: PdfGenerationOverlayProps) {
  if (!open) return null;

  const pct = Math.max(0, Math.min(100, Math.round(progress)));

  const card = (
    <div className={styles.card}>
      <p className={styles.title}>{title}</p>
      <p className={styles.sub}>{pct}%</p>
      <div className={styles.track} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
      <p className={styles.hint}>Puede tardar unos segundos según el tamaño del reporte.</p>
    </div>
  );

  if (variant === "inline") {
    return <div className={styles.inlineWrap}>{card}</div>;
  }

  return (
    <div className={styles.backdrop} role="status" aria-live="polite" aria-busy="true">
      {card}
    </div>
  );
}
