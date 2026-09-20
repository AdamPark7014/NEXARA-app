"use client";

/**
 * FilterToolbar — barra de filtros reutilizable y consistente.
 *
 *   <FilterToolbar
 *     search={{ value, onChange, placeholder: "Buscar productos…" }}
 *     selects={[{ label: "Almacén", value, onChange, options }]}
 *     toggles={[{ label: "Solo activos", value, onChange }]}
 *     rightActions={<Button variant="primary" size="sm">Nuevo</Button>}
 *     onClear={() => { … }}
 *   />
 *
 * Es una herramienta de trabajo, no un formulario. Antes era un panel con
 * fondo, borde y 10px de padding alrededor de controles que ya tenían su
 * propio borde —un rectángulo dentro de otro— y cada control media distinto:
 * 34, 35 y 31 px de alto en la misma fila. Ahora es **una fila**: todos los
 * controles a 32px (el `size="sm"` del contrato), sin caja alrededor, y la
 * acción principal a la derecha.
 */

import type { CSSProperties, ReactNode } from "react";

export type FilterSelectOption = { value: string; label: string };

/** Alto único de la fila: el mismo `sm` (32px) que fija .ai/DISENO-FINANZAS.md. */
const H = 32;

const CONTROL: CSSProperties = {
  height: H,
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--surface)",
  color: "var(--text-primary)",
  fontSize: 13,
  fontFamily: "inherit",
};

export type FilterToolbarProps = {
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    /** Nombre accesible. Por defecto, el placeholder. */
    ariaLabel?: string;
  };
  dates?: Array<{
    label: string;
    value: string;
    onChange: (value: string) => void;
  }>;
  selects?: Array<{
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: FilterSelectOption[];
    /** Si true, el primer option se muestra como "Todos". */
    allowAll?: boolean;
    /** Etiqueta del estado "todos" (default "Todos"). */
    allLabel?: string;
  }>;
  toggles?: Array<{
    label: string;
    value: boolean;
    onChange: (value: boolean) => void;
    icon?: string;
  }>;
  /** Acciones a la derecha (ej. botón "+ Nuevo"). */
  rightActions?: ReactNode;
  /** Hook opcional para limpiar todos los filtros. */
  onClear?: () => void;
  /** Cuenta de resultados a mostrar (informativo). */
  resultCount?: number | null;
  className?: string;
  style?: CSSProperties;
};

export default function FilterToolbar({
  search,
  dates = [],
  selects = [],
  toggles = [],
  rightActions,
  onClear,
  resultCount,
  className,
  style,
}: FilterToolbarProps) {
  const hasAny =
    (search && search.value.trim().length > 0) ||
    dates.some((d) => d.value !== "") ||
    selects.some((s) => s.value !== "" && s.value !== "all") ||
    toggles.some((t) => t.value);

  const searchPlaceholder = search?.placeholder || "Buscar…";

  return (
    <div
      role="group"
      aria-label="Filtros"
      className={["nx-ft", className].filter(Boolean).join(" ")}
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        // Sin caja: los controles ya se agrupan por alineación y cercanía.
        marginBottom: 12,
        ...style,
      }}
    >
      {search && (
        <span style={{ position: "relative", display: "inline-flex", flex: "1 1 220px", minWidth: 180, maxWidth: 360 }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            focusable="false"
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-tertiary)",
              pointerEvents: "none",
            }}
          >
            <circle cx="7.2" cy="7.2" r="4.6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.6 10.6L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder={searchPlaceholder}
            // Con texto escrito el placeholder desaparece y el campo se queda
            // sin nombre. El aria-label no se va.
            aria-label={search.ariaLabel || searchPlaceholder}
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            style={{ ...CONTROL, width: "100%", padding: "0 10px 0 30px" }}
          />
        </span>
      )}

      {dates.map((date, i) => (
        <label
          key={i}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--text-tertiary)",
            whiteSpace: "nowrap",
          }}
        >
          <span>{date.label}</span>
          <input
            type="date"
            value={date.value}
            onChange={(e) => date.onChange(e.target.value)}
            aria-label={date.label}
            style={{ ...CONTROL, padding: "0 8px", fontSize: 12.5 }}
          />
        </label>
      ))}

      {selects.map((sel, i) => (
        <select
          key={i}
          value={sel.value}
          onChange={(e) => sel.onChange(e.target.value)}
          title={sel.label}
          aria-label={sel.label}
          style={{ ...CONTROL, padding: "0 8px", minWidth: 140 }}
        >
          {sel.allowAll !== false && (
            <option value="">{sel.allLabel || `Todos · ${sel.label}`}</option>
          )}
          {sel.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ))}

      {toggles.map((t, i) => (
        <label
          key={i}
          style={{
            ...CONTROL,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "0 10px",
            cursor: "pointer",
            whiteSpace: "nowrap",
            // Activo: se tiñe y el borde toma color. Sin pastilla extra.
            background: t.value ? "color-mix(in srgb, var(--primary) 12%, var(--surface))" : "var(--surface)",
            borderColor: t.value ? "color-mix(in srgb, var(--primary) 45%, var(--border))" : "var(--border)",
            color: t.value ? "var(--text-primary)" : "var(--text-secondary)",
            transition: "background 140ms var(--nx-ease-out, ease-out), border-color 140ms var(--nx-ease-out, ease-out)",
          }}
        >
          <input
            type="checkbox"
            checked={t.value}
            onChange={(e) => t.onChange(e.target.checked)}
            style={{ accentColor: "var(--primary)", width: 13, height: 13, margin: 0 }}
          />
          {t.icon && <span aria-hidden="true">{t.icon}</span>}
          <span>{t.label}</span>
        </label>
      ))}

      {hasAny && onClear && (
        <button
          type="button"
          onClick={onClear}
          // Terciario: quitar filtros no compite con nada. Sin borde.
          style={{
            height: H,
            padding: "0 10px",
            background: "transparent",
            border: "1px solid transparent",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 13,
            fontFamily: "inherit",
            color: "var(--text-secondary)",
            transition: "background 140ms var(--nx-ease-out, ease-out), color 140ms var(--nx-ease-out, ease-out)",
          }}
        >
          Limpiar
        </button>
      )}

      {(resultCount != null || rightActions) && (
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {resultCount != null && (
            <span
              role="status"
              style={{
                fontSize: 12,
                color: "var(--text-tertiary)",
                whiteSpace: "nowrap",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {resultCount} resultado{resultCount === 1 ? "" : "s"}
            </span>
          )}
          {rightActions && <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{rightActions}</div>}
        </div>
      )}

      <style jsx>{`
        .nx-ft input:focus-visible,
        .nx-ft select:focus-visible,
        .nx-ft button:focus-visible,
        .nx-ft label:focus-within {
          outline: 2px solid var(--primary);
          outline-offset: 1px;
        }
        .nx-ft input:hover:not(:focus),
        .nx-ft select:hover:not(:focus) {
          border-color: var(--border-strong);
        }
        .nx-ft button:hover {
          background: color-mix(in srgb, var(--text-primary) 7%, transparent);
          color: var(--text-primary);
        }
        @media (prefers-reduced-motion: reduce) {
          .nx-ft input,
          .nx-ft select,
          .nx-ft label,
          .nx-ft button {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
