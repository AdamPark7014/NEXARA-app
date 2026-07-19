"use client";

/**
 * FilterToolbar — barra de filtros reutilizable y consistente.
 *
 * Provee una API simple para listas/tablas del ERP:
 *   <FilterToolbar
 *     search={{ value, onChange, placeholder: "Buscar productos…" }}
 *     selects={[
 *       { label: "Almacén", value: warehouseId, onChange: setWarehouseId, options: warehouses },
 *       { label: "Tipo", value: type, onChange: setType, options: [...] }
 *     ]}
 *     toggles={[{ label: "Solo activos", value: onlyActive, onChange: setOnlyActive }]}
 *     onClear={() => { ... }}
 *   />
 *
 * - Persiste un look-and-feel coherente con `PageState.tsx`.
 * - Auto-muestra "Limpiar filtros" cuando algo está aplicado.
 * - Responsive: en mobile las pills se apilan.
 */

import type { ReactNode } from "react";

export type FilterSelectOption = { value: string; label: string };

export type FilterToolbarProps = {
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
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
};

export default function FilterToolbar({
  search,
  dates = [],
  selects = [],
  toggles = [],
  rightActions,
  onClear,
  resultCount,
}: FilterToolbarProps) {
  const hasAny =
    (search && search.value.trim().length > 0) ||
    dates.some((d) => d.value !== "") ||
    selects.some((s) => s.value !== "" && s.value !== "all") ||
    toggles.some((t) => t.value);

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "center",
        padding: 12,
        background: "var(--bg-primary)",
        border: "1px solid var(--border)",
        borderRadius: 12,
      }}
    >
      {search && (
        <input
          type="search"
          placeholder={search.placeholder || "🔍 Buscar…"}
          value={search.value}
          onChange={(e) => search.onChange(e.target.value)}
          style={{
            flex: "1 1 220px",
            minWidth: 180,
            padding: "8px 12px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "var(--bg-secondary)",
            color: "var(--text-primary)",
            fontSize: 13,
          }}
        />
      )}

      {dates.map((date, i) => (
        <label
          key={i}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--text-secondary)",
            whiteSpace: "nowrap",
          }}
        >
          <span>{date.label}</span>
          <input
            type="date"
            value={date.value}
            onChange={(e) => date.onChange(e.target.value)}
            aria-label={date.label}
            style={{
              padding: "7px 9px",
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              fontSize: 12,
            }}
          />
        </label>
      ))}

      {selects.map((sel, i) => (
        <select
          key={i}
          value={sel.value}
          onChange={(e) => sel.onChange(e.target.value)}
          title={sel.label}
          style={{
            padding: "8px 12px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "var(--bg-secondary)",
            color: "var(--text-primary)",
            fontSize: 13,
            minWidth: 140,
          }}
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
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            cursor: "pointer",
            padding: "6px 10px",
            background: t.value ? "color-mix(in srgb, var(--primary, #0ea5e9) 15%, var(--bg-secondary))" : "var(--bg-secondary)",
            border: `1px solid ${t.value ? "var(--primary, #0ea5e9)" : "var(--border)"}`,
            borderRadius: 8,
            transition: "background 0.15s, border-color 0.15s",
          }}
        >
          <input
            type="checkbox"
            checked={t.value}
            onChange={(e) => t.onChange(e.target.checked)}
            style={{ accentColor: "var(--primary, #0ea5e9)" }}
          />
          {t.icon && <span aria-hidden="true">{t.icon}</span>}
          <span>{t.label}</span>
        </label>
      ))}

      {hasAny && onClear && (
        <button
          type="button"
          onClick={onClear}
          style={{
            padding: "6px 12px",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 12,
            color: "var(--text-secondary)",
          }}
        >
          Limpiar
        </button>
      )}

      {resultCount != null && (
        <span style={{ fontSize: 11, color: "var(--text-secondary)", marginLeft: "auto", whiteSpace: "nowrap" }}>
          {resultCount} resultado{resultCount === 1 ? "" : "s"}
        </span>
      )}

      {rightActions && <div style={{ marginLeft: resultCount != null ? 8 : "auto", display: "flex", gap: 8 }}>{rightActions}</div>}
    </div>
  );
}
