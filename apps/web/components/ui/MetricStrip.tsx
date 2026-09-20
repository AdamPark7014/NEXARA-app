"use client";

import Link from "next/link";
import { ReactNode } from "react";

/**
 * NEXARA · Tira de cifras.
 *
 * Sustituye a las rejillas de `KpiCard` en las pantallas financieras. Una
 * tarjeta con resplandor, elevación al pasar el ratón y minigráfica ocupa
 * cuatro veces el alto y dice lo mismo: el número. Aquí el dato manda, el
 * adorno desaparece, y la tira entera ocupa lo que antes una sola tarjeta.
 *
 * El color solo entra cuando pide acción (`tone`), nunca como decoración: si
 * todo va bien, la tira es neutra y la vista se lee sin ruido.
 */

export type MetricTone = "default" | "warning" | "danger" | "success";

export type Metric = {
  /** Qué es la cifra. Frase corta, en minúsculas. */
  label: ReactNode;
  /** El número ya formateado (moneda, conteo, porcentaje). */
  value: ReactNode;
  /** De qué se compone, o qué implica. Ej. «7 gastos», «bloquean el cierre». */
  hint?: ReactNode;
  tone?: MetricTone;
  /** Si se pasa, la celda es un botón: filtra la vista en el sitio. */
  onClick?: () => void;
  /**
   * Si la celda LLEVA a otra pantalla, usa esto en vez de `onClick`: navegar
   * con un manejador rompe ctrl+clic y «abrir en pestaña nueva», que es justo
   * lo que hace una contadora cuando quiere revisar dos cosas a la vez.
   */
  href?: string;
};

const TONE_COLOR: Record<MetricTone, string> = {
  default: "var(--text-primary)",
  warning: "var(--state-warning-text, #b45309)",
  danger: "var(--state-danger-text, #b91c1c)",
  success: "var(--state-success-text, #15803d)",
};

export default function MetricStrip({
  metrics,
  ariaLabel = "Resumen del periodo",
}: {
  metrics: Metric[];
  ariaLabel?: string;
}) {
  if (metrics.length === 0) return null;

  return (
    <div
      aria-label={ariaLabel}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(150px, 1fr))`,
        background: "var(--surface-2, var(--surface))",
        border: "1px solid var(--nx-panel-hairline, var(--border))",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {metrics.map((m, i) => {
        const color = TONE_COLOR[m.tone ?? "default"];
        const inner = (
          <>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 3 }}>
              {m.label}
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1.15,
                color,
              }}
            >
              {m.value}
            </div>
            {m.hint ? (
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                {m.hint}
              </div>
            ) : null}
          </>
        );

        const cellStyle = {
          padding: "12px 16px",
          borderRight:
            i < metrics.length - 1
              ? "1px solid var(--nx-panel-hairline, var(--border))"
              : undefined,
          textAlign: "left" as const,
        };

        const interactiveStyle = {
          ...cellStyle,
          background: "transparent",
          border: "none",
          borderRight: cellStyle.borderRight,
          cursor: "pointer",
          font: "inherit",
          display: "block",
          textDecoration: "none",
          color: "inherit",
        };

        return m.href ? (
          <Link key={i} href={m.href} style={interactiveStyle}>
            {inner}
          </Link>
        ) : m.onClick ? (
          <button key={i} type="button" onClick={m.onClick} style={interactiveStyle}>
            {inner}
          </button>
        ) : (
          <div key={i} style={cellStyle}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
