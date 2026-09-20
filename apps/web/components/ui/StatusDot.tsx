"use client";

import { ReactNode } from "react";

/**
 * NEXARA · Estado como punto y palabra.
 *
 * Reemplaza a las pastillas de color en las tablas financieras. Una pastilla
 * rellena grita lo mismo en cada renglón: con veinte filas, la tabla es un
 * semáforo y ya no se distingue lo que urge. Un punto de 5px con la palabra al
 * lado se lee igual de rápido y deja que el color signifique algo.
 *
 * Regla: `neutral` para los estados normales del flujo, y color solo cuando el
 * renglón pide una acción o algo salió mal.
 */

export type StatusTone = "neutral" | "info" | "warning" | "danger" | "success";

const TONE_COLOR: Record<StatusTone, string> = {
  neutral: "var(--text-secondary)",
  info: "var(--primary, #2563eb)",
  warning: "var(--state-warning-text, #b45309)",
  danger: "var(--state-danger-text, #b91c1c)",
  success: "var(--state-success-text, #15803d)",
};

export default function StatusDot({
  label,
  tone = "neutral",
  title,
}: {
  label: ReactNode;
  tone?: StatusTone;
  /** Explicación al pasar el ratón, cuando la palabra sola no basta. */
  title?: string;
}) {
  const color = TONE_COLOR[tone];
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color,
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: "currentColor",
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}
