"use client";

import { ReactNode } from "react";

/**
 * NEXARA · Escala que además filtra.
 *
 * Es el control que aparece cuando una cifra es también un filtro: los tramos
 * de antigüedad de la cartera, los contadores de la conciliación. Se hizo dos
 * veces por separado y quedó casi idéntico en ambos sitios; separarlo evita que
 * la tercera vez salga distinta, que es justo cómo se dispersa el estilo.
 *
 * Va pegado y en orden para que se lea como una escala —vencido, hoy, 7, 30—
 * no como botones sueltos. `share` dibuja bajo la celda una regla cuyo ancho es
 * su parte del total: así se ve hacia qué lado carga sin añadir una gráfica.
 */

export type ScaleTone = "default" | "mute" | "warning" | "danger" | "success";

export type ScaleItem = {
  key: string;
  label: ReactNode;
  /** La cifra, ya formateada. */
  value: ReactNode;
  /** De qué se compone. Ej. «4 facturas». */
  hint?: ReactNode;
  tone?: ScaleTone;
  /** 0..1 — parte del total. Si se omite, no se dibuja la regla. */
  share?: number;
};

const TONE_COLOR: Record<ScaleTone, string> = {
  default: "var(--text-primary)",
  mute: "var(--text-tertiary)",
  warning: "var(--state-warning-text, #b45309)",
  danger: "var(--state-danger-text, #b91c1c)",
  success: "var(--state-success-text, #15803d)",
};

export default function FilterScale({
  items,
  active,
  onSelect,
  ariaLabel,
  minCellWidth = 126,
}: {
  items: ScaleItem[];
  /** La clave activa, o "" / null cuando no hay filtro. */
  active: string | null;
  /** Recibe "" cuando se pulsa la celda ya activa: pulsar dos veces quita el filtro. */
  onSelect: (key: string) => void;
  ariaLabel: string;
  minCellWidth?: number;
}) {
  if (items.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${minCellWidth}px, 1fr))`,
        border: "1px solid var(--nx-panel-hairline, var(--border))",
        borderRadius: 10,
        overflow: "hidden",
        background: "var(--surface)",
        marginBottom: 14,
      }}
    >
      {items.map((item, i) => {
        const esActivo = active === item.key;
        const color = TONE_COLOR[item.tone ?? "default"];
        const parte =
          typeof item.share === "number"
            ? Math.max(0, Math.min(100, item.share * 100))
            : null;

        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={esActivo}
            onClick={() => onSelect(esActivo ? "" : item.key)}
            style={{
              position: "relative",
              display: "grid",
              gap: 2,
              padding: parte === null ? "10px 14px" : "9px 12px 11px",
              textAlign: "left",
              cursor: "pointer",
              font: "inherit",
              color: "var(--text-primary)",
              // Solo propiedades largas, igual que en MetricStrip: mezclar el
              // atajo `border` con `borderRight` deja el resultado a merced del
              // orden de claves. Aquí hoy sale bien, pero es un patrón frágil
              // que el siguiente en copiarlo hereda roto.
              borderTop: "none",
              borderBottom: "none",
              borderLeft: "none",
              // `border: none` se lleva por delante el anillo del navegador.
              outlineOffset: -2,
              borderRight:
                i < items.length - 1
                  ? "1px solid var(--nx-panel-hairline, var(--border))"
                  : undefined,
              boxShadow: esActivo ? "inset 0 -2px 0 var(--primary)" : undefined,
              background: esActivo
                ? "color-mix(in srgb, var(--primary) 7%, var(--surface))"
                : "transparent",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: esActivo ? 700 : 500,
                color: item.tone === "mute" ? "var(--text-tertiary)" : color,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {item.label}
            </span>
            <span
              style={{
                fontSize: 18,
                fontWeight: 600,
                lineHeight: 1.15,
                fontVariantNumeric: "tabular-nums",
                color,
              }}
            >
              {item.value}
            </span>
            {item.hint ? (
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{item.hint}</span>
            ) : null}
            {parte !== null ? (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: 0,
                  bottom: 0,
                  height: 2,
                  width: `${parte}%`,
                  background: item.tone === "mute" ? "var(--border)" : color,
                  opacity: 0.55,
                }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
