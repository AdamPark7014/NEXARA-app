"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import EmptyState from "./EmptyState";
import Skeleton from "./Skeleton";
import { Checkbox } from "@/components/base/campos";
import { Avatar, type Presence } from "@/components/base/estados";
import { Progress, StatusBadge, TONE_COLOR, type Tone } from "@/components/base/piezas";
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
 *
 * v2 (plantillas de página), todo opcional y sin cambiar la API anterior:
 *  - `rowActions={(row) => <Button …/>}`: columna final de acciones que aparece al
 *    pasar el mouse o con foco en la fila; en pantalla táctil, siempre visible.
 *  - `selectable` + `selectedKeys` + `onSelectionChange`: casilla por fila y en la
 *    cabecera (todas / ninguna / indeterminada). La fila seleccionada se tiñe.
 *  - `selectionBar`: contenido (acciones) de la barra flotante «N seleccionadas»
 *    que aparece abajo mientras hay selección; trae la × para quitarla.
 *  - `flush`: sin marco propio (dentro de la tarjeta de `ModulePage`).
 *  - Celdas auxiliares: `PersonCell`, `ProgressCell`, `StatusCell`, `WhenCell`.
 *
 *   <DataTable
 *     columns={[
 *       { key: "titulo", label: "Actividad", render: (r) => r.titulo },
 *       { key: "quien", label: "Responsable", render: (r) => <PersonCell name={r.tecnico} avatarUrl={r.foto} /> },
 *       { key: "cuando", label: "Cuándo", render: (r) => <WhenCell time="Hoy 10:00" hint="En sitio desde 10:06" tone="success" /> },
 *       { key: "ev", label: "Evidencia", width: 150, render: (r) => <ProgressCell value={r.hechas} max={r.pasos} /> },
 *       { key: "estado", label: "Estado", render: (r) => <StatusCell status={r.estado} /> },
 *     ]}
 *     rows={filas}
 *     rowKey={(r) => r.id}
 *     rowActions={(r) => <Button size="sm" variant="ghost" icon aria-label="Más">···</Button>}
 *     selectable
 *     selectedKeys={sel}
 *     onSelectionChange={setSel}
 *     selectionBar={<><Button size="sm" variant="ghost">Reasignar</Button><Button size="sm" variant="ghost">Avisar</Button></>}
 *   />
 */

export type RowKey = string | number;

export type SelectionContext<T> = {
  count: number;
  keys: RowKey[];
  /** Filas seleccionadas que están en la tabla ahora (las de otras páginas no). */
  rows: T[];
  clear: () => void;
};

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
  /** Acciones por fila (columna final); visibles al pasar el mouse o con foco, siempre en táctil. */
  rowActions?: (row: T) => ReactNode;
  /** Encabezado (solo lector de pantalla) de la columna de acciones. */
  rowActionsLabel?: string;
  /** Casilla por fila y en la cabecera. Controlado: `selectedKeys` + `onSelectionChange`. */
  selectable?: boolean;
  selectedKeys?: ReadonlyArray<RowKey> | ReadonlySet<RowKey>;
  onSelectionChange?: (keys: RowKey[], rows: T[]) => void;
  /** Nombre accesible de la casilla de una fila. */
  selectRowLabel?: (row: T) => string;
  /** Acciones de la barra flotante; `null` la oculta. Recibe `{ count, keys, rows, clear }` si es función. */
  selectionBar?: ReactNode | ((ctx: SelectionContext<T>) => ReactNode);
  /** Texto de la barra («3 seleccionadas»). */
  selectionLabel?: (count: number) => ReactNode;
  /** Sin borde, radio ni sombra propios (va dentro de una tarjeta). */
  flush?: boolean;
};

function alignOf<T>(col: Column<T>) {
  return col.align ?? (col.numeric ? "right" : "left");
}

function etiquetaSeleccion(n: number): string {
  return n === 1 ? "1 seleccionada" : `${n} seleccionadas`;
}

function detener(e: { stopPropagation: () => void }) {
  e.stopPropagation();
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
  rowActions,
  rowActionsLabel = "Acciones",
  selectable = false,
  selectedKeys,
  onSelectionChange,
  selectRowLabel,
  selectionBar,
  selectionLabel = etiquetaSeleccion,
  flush = false,
}: Props<T>) {
  const showSkeleton = loading && rows.length === 0;

  // Selección controlada: el padre guarda las llaves; aquí solo se calcula qué está marcado.
  const seleccion = useMemo(() => new Set<RowKey>(selectedKeys ?? []), [selectedKeys]);
  const llavesVisibles = useMemo(() => rows.map(rowKey), [rows, rowKey]);
  const todasMarcadas = llavesVisibles.length > 0 && llavesVisibles.every((k) => seleccion.has(k));
  const algunaMarcada = !todasMarcadas && llavesVisibles.some((k) => seleccion.has(k));
  const cabeceraRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (cabeceraRef.current) cabeceraRef.current.indeterminate = algunaMarcada;
  }, [algunaMarcada]);

  const avisar = (siguiente: Set<RowKey>) => {
    const llaves = Array.from(siguiente);
    onSelectionChange?.(llaves, rows.filter((r) => siguiente.has(rowKey(r))));
  };
  const alternarFila = (key: RowKey) => {
    const siguiente = new Set(seleccion);
    if (siguiente.has(key)) siguiente.delete(key);
    else siguiente.add(key);
    avisar(siguiente);
  };
  const alternarTodas = () => {
    const siguiente = new Set(seleccion);
    if (todasMarcadas) llavesVisibles.forEach((k) => siguiente.delete(k));
    else llavesVisibles.forEach((k) => siguiente.add(k));
    avisar(siguiente);
  };
  const limpiar = () => avisar(new Set());

  if (rows.length === 0 && !showSkeleton) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  const conAcciones = Boolean(rowActions);

  const tabla = (
    <div
      role="region"
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      tabIndex={0}
      className={[styles.wrap, "nx-table-wrap", className].filter(Boolean).join(" ")}
      data-sticky={stickyHeader ? "true" : undefined}
      data-flush={flush ? "true" : undefined}
      style={stickyHeader ? { maxHeight: maxHeight ?? "min(72vh, 720px)" } : undefined}
    >
      <table
        className={styles.table}
        data-density={density}
        data-zebra={zebra ? "true" : undefined}
        data-clickable={onRowClick ? "true" : undefined}
        data-loading={loading && !showSkeleton ? "true" : undefined}
        data-selectable={selectable ? "true" : undefined}
      >
        {caption ? <caption className="ui-sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {selectable ? (
              <th scope="col" className={styles.selCell}>
                <Checkbox
                  ref={cabeceraRef}
                  checked={todasMarcadas}
                  onChange={alternarTodas}
                  aria-label={todasMarcadas ? "Quitar selección de todas" : "Seleccionar todas"}
                  disabled={llavesVisibles.length === 0}
                />
              </th>
            ) : null}
            {columns.map((col) => (
              <th key={col.key} scope="col" style={{ textAlign: alignOf(col), width: col.width }}>
                {col.label}
              </th>
            ))}
            {conAcciones ? (
              <th scope="col" className={styles.actionsCell}>
                <span className="ui-sr-only">{rowActionsLabel}</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {showSkeleton
            ? Array.from({ length: loadingRows }, (_, r) => (
                <tr key={`sk-${r}`} aria-hidden="true" className={styles.skeletonRow}>
                  {selectable ? <td className={styles.selCell} /> : null}
                  {columns.map((col, c) => (
                    <td key={col.key} style={{ textAlign: alignOf(col) }}>
                      <Skeleton
                        height={10}
                        width={c === 0 ? `${58 + ((r * 13) % 32)}%` : `${40 + ((r * 7 + c * 11) % 40)}%`}
                        style={alignOf(col) === "right" ? { marginLeft: "auto" } : undefined}
                      />
                    </td>
                  ))}
                  {conAcciones ? <td className={styles.actionsCell} /> : null}
                </tr>
              ))
            : rows.map((row) => {
                const key = rowKey(row);
                const marcada = selectable && seleccion.has(key);
                return (
                  <tr
                    key={key}
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
                    aria-selected={selectable ? marcada : undefined}
                    data-selected={marcada ? "true" : undefined}
                  >
                    {selectable ? (
                      <td className={styles.selCell} onClick={detener} onKeyDown={detener}>
                        <Checkbox
                          checked={marcada}
                          onChange={() => alternarFila(key)}
                          aria-label={selectRowLabel ? selectRowLabel(row) : "Seleccionar fila"}
                        />
                      </td>
                    ) : null}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        data-numeric={col.numeric ? "true" : undefined}
                        style={{ textAlign: alignOf(col) }}
                      >
                        {col.render ? col.render(row) : col.accessor ? col.accessor(row) : ""}
                      </td>
                    ))}
                    {conAcciones ? (
                      <td className={styles.actionsCell} onClick={detener} onKeyDown={detener}>
                        <div className={styles.rowActions}>{rowActions?.(row)}</div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
        </tbody>
      </table>
      {showSkeleton ? <span className="ui-sr-only">Cargando registros…</span> : null}
    </div>
  );

  if (!selectable) return tabla;

  const cuenta = seleccion.size;
  const ctx: SelectionContext<T> = { count: cuenta, keys: Array.from(seleccion), rows: rows.filter((r) => seleccion.has(rowKey(r))), clear: limpiar };
  const acciones = typeof selectionBar === "function" ? selectionBar(ctx) : selectionBar;

  return (
    <div className={styles.outer}>
      {tabla}
      {cuenta > 0 && selectionBar !== null ? (
        <SelectionBar count={cuenta} label={selectionLabel(cuenta)} onClear={limpiar}>
          {acciones}
        </SelectionBar>
      ) : null}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */

/**
 * Barra flotante de selección: «N seleccionadas» · acciones · ×. Pegada abajo
 * (`sticky`) mientras la tabla está a la vista; `DataTable` la pinta sola con
 * `selectable`, y se puede usar suelta sobre cualquier lista.
 */
export function SelectionBar({
  count,
  label,
  onClear,
  clearLabel = "Quitar selección",
  children,
  className,
}: {
  count: number;
  label?: ReactNode;
  onClear?: () => void;
  clearLabel?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={[styles.selBarHost, className].filter(Boolean).join(" ")}>
      <div className={styles.selBar} role="toolbar" aria-label="Acciones de la selección">
        <strong className={styles.selCount} aria-live="polite">
          {label ?? etiquetaSeleccion(count)}
        </strong>
        {children ? (
          <>
            <span className={styles.selSep} aria-hidden="true" />
            <div className={styles.selActions}>{children}</div>
          </>
        ) : null}
        {onClear ? (
          <button type="button" className={styles.selX} onClick={onClear} aria-label={clearLabel} title={clearLabel}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ─── Celdas auxiliares ─────────────────────────────────────────────── */

/** Avatar (foto real o iniciales) + nombre + subtítulo chico. */
export function PersonCell({
  name,
  avatarUrl,
  subtitle,
  size = 28,
  presence,
  title,
}: {
  name: string;
  avatarUrl?: string | null;
  subtitle?: ReactNode;
  size?: number;
  presence?: Presence;
  title?: string;
}) {
  return (
    <span className={styles.person} title={title}>
      <Avatar name={name} avatarUrl={avatarUrl} size={size} presence={presence} />
      <span className={styles.personText}>
        <span className={styles.personName}>{name}</span>
        {subtitle ? <span className={styles.personSub}>{subtitle}</span> : null}
      </span>
    </span>
  );
}

/** Barra de avance con «4/6» a la derecha. */
export function ProgressCell({
  value,
  max,
  label,
  tone,
  width = 112,
  ariaLabel,
}: {
  value: number;
  max: number;
  /** Texto a la derecha; por defecto «valor/máximo». */
  label?: ReactNode;
  /** Por defecto: marca; `success` cuando está completo. */
  tone?: Tone;
  width?: number | string;
  ariaLabel?: string;
}) {
  const completo = max > 0 && value >= max;
  return (
    <span className={styles.progress} style={{ width }}>
      <Progress value={value} max={max} tone={tone ?? (completo ? "success" : "brand")} label={label ?? `${value}/${max}`} ariaLabel={ariaLabel ?? "Avance"} />
    </span>
  );
}

/** Insignia de estado con el mapa único estado → tono (`StatusBadge`). */
export function StatusCell({
  status,
  label,
  tone,
  dot = true,
  size = "md",
  title,
}: {
  status?: string | null;
  label?: ReactNode;
  tone?: Tone;
  dot?: boolean;
  size?: "sm" | "md";
  title?: string;
}) {
  return <StatusBadge status={status} label={label} tone={tone} dot={dot} size={size} title={title} />;
}

/** Hora + estado relativo («En sitio desde 10:06») con punto de color del tono. */
export function WhenCell({
  time,
  hint,
  tone = "neutral",
  title,
}: {
  time: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  title?: string;
}) {
  return (
    <span className={styles.when} title={title}>
      <span className={styles.whenDot} style={{ background: TONE_COLOR[tone] }} aria-hidden="true" />
      <span className={styles.whenText}>
        <span className={styles.whenT}>{time}</span>
        {hint ? <span className={styles.whenS}>{hint}</span> : null}
      </span>
    </span>
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
