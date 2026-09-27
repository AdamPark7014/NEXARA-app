"use client";

import { ReactNode } from "react";
import EmptyState from "./EmptyState";
import Skeleton from "./Skeleton";
import styles from "./DataTable.module.scss";

/**
 * NEXARA · DataTable
 *  - Render personalizado por celda
 *  - Encabezado fijo al desplazar, sombras laterales cuando hay más columnas
 *    a la derecha/izquierda (solo CSS)
 *  - Tipografía tabular en montos / cifras
 *  - Densidad `comfortable` o `compact`; `zebra` opcional
 *  - Fila con onClick (selección/navegación), hover sutil, foco visible
 *  - `loading`: renglones esqueleto con los encabezados reales (sin salto)
 *  - Estado vacío amable
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
  /** Nombre de la región desplazable: `role="region"` sin nombre no se anuncia. */
  ariaLabel?: string;
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;
  /** Mientras llegan los datos: renglones esqueleto bajo los encabezados reales. */
  loading?: boolean;
  /** Cuántos renglones esqueleto mostrar con `loading` y sin filas. */
  loadingRows?: number;
  /** Fondo alterno en filas pares (tablas largas y anchas). */
  zebra?: boolean;
  /** Título de la tabla para el lector de pantalla (no se ve). */
  caption?: ReactNode;
  /** Alto máximo del área desplazable con `stickyHeader`. */
  maxHeight?: number | string;
  className?: string;
};

function alignOf<T>(col: Column<T>) {
  return col.align ?? (col.numeric ? "right" : "left");
}

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  density = "comfortable",
  stickyHeader = true,
  emptyTitle = "Sin datos",
  ariaLabel = "Tabla",
  emptyDescription = "No hay registros para mostrar todavía.",
  emptyAction,
  loading = false,
  loadingRows = 6,
  zebra = false,
  caption,
  maxHeight,
  className,
}: Props<T>) {
  const showSkeleton = loading && rows.length === 0;

  if (rows.length === 0 && !showSkeleton) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      tabIndex={0}
      className={[styles.wrap, "nx-table-wrap", className].filter(Boolean).join(" ")}
      data-sticky={stickyHeader ? "true" : undefined}
      style={stickyHeader ? { maxHeight: maxHeight ?? "min(72vh, 720px)" } : undefined}
    >
      <table
        className={styles.table}
        data-density={density}
        data-zebra={zebra ? "true" : undefined}
        data-clickable={onRowClick ? "true" : undefined}
        data-loading={loading && !showSkeleton ? "true" : undefined}
      >
        {caption ? <caption className="ui-sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col" style={{ textAlign: alignOf(col), width: col.width }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {showSkeleton
            ? Array.from({ length: loadingRows }, (_, r) => (
                <tr key={`sk-${r}`} aria-hidden="true" className={styles.skeletonRow}>
                  {columns.map((col, c) => (
                    <td key={col.key} style={{ textAlign: alignOf(col) }}>
                      <Skeleton
                        height={10}
                        width={c === 0 ? `${58 + ((r * 13) % 32)}%` : `${40 + ((r * 7 + c * 11) % 40)}%`}
                        style={alignOf(col) === "right" ? { marginLeft: "auto" } : undefined}
                      />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
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
                  className={`${styles.row} nx-row`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      data-numeric={col.numeric ? "true" : undefined}
                      style={{ textAlign: alignOf(col) }}
                    >
                      {col.render ? col.render(row) : col.accessor ? col.accessor(row) : ""}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {showSkeleton ? <span className="ui-sr-only">Cargando registros…</span> : null}
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
