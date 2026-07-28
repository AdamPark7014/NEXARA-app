"use client";

import { ReactNode } from "react";
import EmptyState from "./EmptyState";

/**
 * NEXARA · DataTable (premium)
 *  - Render personalizado por celda
 *  - Header sticky con hairline + uppercase eyebrow
 *  - Tipografía tabular en montos / cifras
 *  - Densidad compacta o comfortable
 *  - Row con onClick (selección/navegación), hover sutil, focus ring
 *  - Estado vacío elegante
 */

export type Column<T> = {
  key: string;
  label: ReactNode;
  render?: (row: T) => ReactNode;
  accessor?: (row: T) => ReactNode;
  width?: string | number;
  align?: "left" | "center" | "right";
  /** Si es numérica, usa tipografía tabular en la celda. */
  numeric?: boolean;
  shortLabel?: string;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  density?: "comfortable" | "compact";
  stickyHeader?: boolean;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;
};

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  density = "comfortable",
  stickyHeader = true,
  emptyTitle = "Sin datos",
  emptyDescription = "No hay registros para mostrar todavía.",
  emptyAction,
}: Props<T>) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  const cellPaddingY = density === "compact" ? 8 : 12;
  const cellPaddingX = 16;
  const fontSize = density === "compact" ? 12.5 : 13;

  return (
    <div
      role="region"
      className="nx-table-wrap"
      style={{
        overflowX: "auto",
        overflowY: "auto",
        maxHeight: stickyHeader ? "min(72vh, 720px)" : undefined,
        borderRadius: "var(--nx-panel-radius)",
        border: "1px solid var(--nx-panel-hairline)",
        background: "var(--surface)",
        boxShadow: "var(--nx-panel-elev-1)",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "separate",
          borderSpacing: 0,
          fontSize,
        }}
      >
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th
                key={col.key}
                scope="col"
                style={{
                  textAlign: col.align ?? (col.numeric ? "right" : "left"),
                  padding: `${cellPaddingY + 2}px ${cellPaddingX}px`,
                  fontSize: 10.5,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--text-tertiary)",
                  background:
                    "linear-gradient(180deg, color-mix(in srgb, var(--surface-2) 80%, var(--surface)) 0%, color-mix(in srgb, var(--surface-2) 55%, var(--surface)) 100%)",
                  borderBottom: "1px solid var(--nx-panel-hairline)",
                  whiteSpace: "nowrap",
                  width: col.width,
                  position: stickyHeader ? "sticky" : undefined,
                  top: stickyHeader ? 0 : undefined,
                  zIndex: 1,
                  borderTopLeftRadius: i === 0 ? "var(--nx-panel-radius)" : 0,
                  borderTopRightRadius: i === columns.length - 1 ? "var(--nx-panel-radius)" : 0,
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              className="nx-row"
              style={{
                cursor: onRowClick ? "pointer" : "default",
                background: "transparent",
                transition: "background 140ms var(--nx-ease-out)",
              }}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    padding: `${cellPaddingY}px ${cellPaddingX}px`,
                    textAlign: col.align ?? (col.numeric ? "right" : "left"),
                    borderBottom:
                      idx === rows.length - 1
                        ? "none"
                        : "1px solid color-mix(in srgb, var(--border) 55%, transparent)",
                    color: "var(--text-primary)",
                    verticalAlign: "middle",
                    fontVariantNumeric: col.numeric ? "tabular-nums" : undefined,
                  }}
                >
                  {col.render ? col.render(row) : col.accessor ? col.accessor(row) : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <style jsx>{`
        .nx-row:hover {
          background: color-mix(in srgb, var(--primary) 6%, transparent) !important;
        }
        .nx-row:focus-visible {
          outline: none;
          background: color-mix(in srgb, var(--primary) 10%, transparent) !important;
          box-shadow: inset 3px 0 0 var(--primary);
        }
        .nx-table-wrap::-webkit-scrollbar {
          width: 9px;
          height: 9px;
        }
        .nx-table-wrap::-webkit-scrollbar-track {
          background: transparent;
        }
        .nx-table-wrap::-webkit-scrollbar-thumb {
          background: color-mix(in srgb, var(--border) 90%, transparent);
          border-radius: 999px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        .nx-table-wrap::-webkit-scrollbar-thumb:hover {
          background: color-mix(in srgb, var(--primary) 50%, transparent);
          background-clip: padding-box;
        }
      `}</style>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */

/** Tag / chip premium para celdas (estados, prioridades, etc.) */
export function Tag({
  children,
  variant = "default",
  dot = false,
  size = "md",
}: {
  children: ReactNode;
  variant?: "default" | "positive" | "warning" | "danger" | "accent" | "neutral";
  dot?: boolean;
  size?: "sm" | "md";
}) {
  const variantStyles: Record<string, { bg: string; color: string; ring: string }> = {
    default: { bg: "var(--surface-2)", color: "var(--text-secondary)", ring: "var(--border)" },
    positive: {
      bg: "var(--state-success-bg)",
      color: "var(--state-success-text)",
      ring: "var(--state-success-border)",
    },
    warning: {
      bg: "var(--state-warning-bg)",
      color: "var(--state-warning-text)",
      ring: "var(--state-warning-border)",
    },
    danger: {
      bg: "var(--state-danger-bg)",
      color: "var(--state-danger-text)",
      ring: "var(--state-danger-border)",
    },
    accent: {
      bg: "color-mix(in srgb, var(--primary) 14%, transparent)",
      color: "var(--primary)",
      ring: "color-mix(in srgb, var(--primary) 32%, var(--border))",
    },
    neutral: {
      bg: "color-mix(in srgb, var(--text-tertiary) 14%, transparent)",
      color: "var(--text-tertiary)",
      ring: "color-mix(in srgb, var(--text-tertiary) 22%, var(--border))",
    },
  };
  const { bg, color, ring } = variantStyles[variant];
  const fs = size === "sm" ? 10 : 10.5;
  const padY = size === "sm" ? 2 : 3;
  const padX = size === "sm" ? 7 : 9;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: fs,
        fontWeight: 700,
        padding: `${padY}px ${padX}px`,
        borderRadius: 999,
        background: bg,
        color,
        border: `1px solid ${ring}`,
        whiteSpace: "nowrap",
        letterSpacing: "0.03em",
        textTransform: "uppercase",
        lineHeight: 1.1,
      }}
    >
      {dot && (
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "currentColor",
            opacity: 0.85,
          }}
        />
      )}
      {children}
    </span>
  );
}

/** Monto formateado MXN para celdas. Usa tipografía tabular. */
export function Money({
  value,
  compact = false,
  currency = "MXN",
  bold = true,
}: {
  value: number;
  compact?: boolean;
  currency?: "MXN" | "USD";
  bold?: boolean;
}) {
  const negative = value < 0;
  const abs = Math.abs(value);
  const baseStyle: React.CSSProperties = {
    fontFamily: "var(--nx-font-display)",
    fontWeight: bold ? 700 : 500,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "-0.01em",
    color: negative ? "var(--danger)" : "inherit",
    whiteSpace: "nowrap",
  };

  if (compact) {
    let body: string;
    if (abs >= 1_000_000) body = `$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
    else if (abs >= 1_000) body = `$${Math.round(abs / 1000)}k`;
    else body = `$${abs.toLocaleString("es-MX")}`;
    return (
      <span style={baseStyle}>
        {negative && "−"}
        {body}
        {currency === "USD" && (
          <span style={{ fontSize: "0.7em", opacity: 0.55, marginLeft: 3, fontWeight: 600 }}>USD</span>
        )}
      </span>
    );
  }
  return (
    <span style={baseStyle}>
      {negative && "−"}${abs.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
      {currency === "USD" && (
        <span style={{ fontSize: "0.7em", opacity: 0.55, marginLeft: 4, fontWeight: 600 }}>USD</span>
      )}
    </span>
  );
}
