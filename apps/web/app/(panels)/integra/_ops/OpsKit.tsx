"use client";

/**
 * NEXARA Integra · piezas compartidas por ANPR, Auditoría, Vehículos y Plano.
 *
 * Existen para que las cuatro pantallas respondan igual a las tres preguntas
 * que un operador se hace delante de una tabla vacía:
 *
 *   1. ¿Está cargando o está vacío?        → `OpsSkeletonTable`
 *   2. Si falló, ¿qué hago?                → `OpsErrorState` (título + reintento)
 *   3. ¿Estoy viendo todo o solo un trozo? → `OpsCount` / `OpsPager`
 *
 * Ninguna de ellas toca `integra.module.css`; solo consume sus tokens.
 */

import { useEffect, useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import NavigateBeforeOutlinedIcon from "@mui/icons-material/NavigateBeforeOutlined";
import NavigateNextOutlinedIcon from "@mui/icons-material/NavigateNextOutlined";
import { IgBtn } from "../_Console";
import s from "./ops.module.css";

/* ── Carga ────────────────────────────────────────────────────────────── */

/**
 * Esqueleto con la MISMA rejilla de columnas que la tabla que sustituye, para
 * que al llegar los datos no salte el layout.
 */
export function OpsSkeletonTable({
  columns,
  rows = 6,
  label = "Cargando…",
}: {
  /** Anchos CSS por columna, en el orden real de la tabla. */
  columns: string[];
  rows?: number;
  label?: string;
}) {
  const template = columns.join(" ");
  return (
    <div className={s.skelTable} role="status" aria-live="polite" aria-busy="true">
      <div className={`${s.skelRow} ${s.skelHeadRow}`} style={{ gridTemplateColumns: template }}>
        {columns.map((_, i) => (
          <span key={`h${i}`} className={`${s.skel} ${s.skelCell}`} style={{ width: "62%" }} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className={s.skelRow} style={{ gridTemplateColumns: template }}>
          {columns.map((_, c) => (
            <span
              key={`${r}-${c}`}
              className={`${s.skel} ${s.skelCell}`}
              /* Anchos irregulares: un esqueleto perfectamente uniforme parece
                 una tabla de verdad y confunde más de lo que informa. */
              style={{ width: `${58 + ((r * 7 + c * 23) % 40)}%` }}
            />
          ))}
        </div>
      ))}
      <span className={s.skelLabel}>{label}</span>
    </div>
  );
}

/** Esqueleto de bloque suelto (planos, fichas, reproductor). */
export function OpsSkeletonBlock({
  height = 180,
  label,
}: {
  height?: number | string;
  label?: string;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span
        className={`${s.skel} ${s.skelBlock}`}
        style={{ height: typeof height === "number" ? `${height}px` : height }}
      />
      {label ? <span className={s.skelLabel}>{label}</span> : null}
    </div>
  );
}

/* ── Error ────────────────────────────────────────────────────────────── */

/**
 * Un error de API no es un mensaje: es una decisión pendiente. Se enseña qué
 * pasó en castellano, qué puede hacer el operador, y el texto crudo queda
 * plegado para quien tenga que abrir un ticket.
 */
export function OpsErrorState({
  title,
  hint,
  detail,
  onRetry,
  retryLabel = "Reintentar",
  extraActions,
}: {
  title: string;
  hint: ReactNode;
  /** Mensaje literal de la API. Va plegado: es para soporte, no para el turno. */
  detail?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  extraActions?: ReactNode;
}) {
  return (
    <div className={s.errorBox} role="alert">
      <span className={s.errorIcon} aria-hidden="true">
        <ErrorOutlineIcon fontSize="small" />
      </span>
      <div className={s.errorBody}>
        <strong className={s.errorTitle}>{title}</strong>
        <p className={s.errorText}>{hint}</p>
        {(onRetry || extraActions) && (
          <div className={s.errorActions}>
            {onRetry && (
              <IgBtn onClick={onRetry}>
                <RefreshOutlinedIcon
                  fontSize="inherit"
                  style={{ fontSize: 14, marginRight: 5, verticalAlign: "-2px" }}
                  aria-hidden="true"
                />
                {retryLabel}
              </IgBtn>
            )}
            {extraActions}
          </div>
        )}
        {detail ? (
          <details className={s.errorDetail}>
            <summary>Detalle técnico</summary>
            <pre className={s.errorPre}>{detail}</pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}

/* ── Recuentos ────────────────────────────────────────────────────────── */

/**
 * «Mostrando 40 de 200». Si lo que se ve es un recorte del universo real, lo
 * dice con todas las letras en vez de dejar creer que eso es todo.
 */
export function OpsCount({
  shown,
  matching,
  fetched,
  total,
  scope,
  warn,
}: {
  /** Filas pintadas ahora mismo. */
  shown: number;
  /** Filas que pasan el filtro (si el filtro es de cliente). */
  matching?: number;
  /** Filas que de verdad se descargaron. */
  fetched?: number;
  /** Universo declarado por el servidor, si lo declara. */
  total?: number | null;
  /** Frase corta que explica sobre qué se está filtrando. */
  scope?: ReactNode;
  warn?: ReactNode;
}) {
  const n = (v: number) => v.toLocaleString("es-MX");
  return (
    <p className={s.countLine}>
      <span>
        Mostrando <span className={s.countStrong}>{n(shown)}</span>
        {matching != null && matching !== shown ? (
          <>
            {" "}
            de <span className={s.countStrong}>{n(matching)}</span> que coinciden
          </>
        ) : null}
        {fetched != null ? (
          <>
            {" "}
            · <span className={s.countStrong}>{n(fetched)}</span> descargadas
          </>
        ) : null}
        {total != null ? (
          <>
            {" "}
            · <span className={s.countStrong}>{n(total)}</span> en el servidor
          </>
        ) : null}
      </span>
      {scope ? <span>· {scope}</span> : null}
      {warn ? <span className={s.countWarn}>· {warn}</span> : null}
    </p>
  );
}

/* ── Paginación ───────────────────────────────────────────────────────── */

export function OpsPager({
  page,
  pageSize,
  total,
  shown,
  onPage,
  onPageSize,
  pageSizes = [25, 50, 100],
  busy,
  totalKnown = true,
}: {
  page: number;
  pageSize: number;
  /** Total del servidor. `null` = el endpoint no lo devuelve. */
  total: number | null;
  /** Filas de la página actual (para saber si hay siguiente sin total). */
  shown: number;
  onPage: (p: number) => void;
  onPageSize?: (n: number) => void;
  pageSizes?: number[];
  busy?: boolean;
  /** false → el endpoint no informa total; se navega «a ciegas» y se dice. */
  totalKnown?: boolean;
}) {
  const pages = totalKnown && total != null ? Math.max(1, Math.ceil(total / pageSize)) : null;
  const from = shown === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = (page - 1) * pageSize + shown;
  const hasNext = pages != null ? page < pages : shown === pageSize;

  return (
    <div className={s.pager}>
      <span className={s.pagerInfo}>
        {shown === 0
          ? "Sin resultados en esta página"
          : pages != null
            ? `${from.toLocaleString("es-MX")}–${to.toLocaleString("es-MX")} de ${(total ?? 0).toLocaleString("es-MX")}`
            : `${from.toLocaleString("es-MX")}–${to.toLocaleString("es-MX")} · el servidor no informa el total`}
      </span>
      <div className={s.pagerBtns}>
        {onPageSize && (
          <label className={s.pagerSize}>
            Por página
            <select
              className={s.pagerSelect}
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              disabled={busy}
            >
              {pageSizes.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className={s.iconBtn}
          aria-label="Página anterior"
          title="Página anterior"
          disabled={busy || page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <NavigateBeforeOutlinedIcon fontSize="small" />
        </button>
        <span className={s.pagerPage} aria-live="polite">
          {pages != null ? `${page} / ${pages}` : `Página ${page}`}
        </span>
        <button
          type="button"
          className={s.iconBtn}
          aria-label="Página siguiente"
          title="Página siguiente"
          disabled={busy || !hasNext}
          onClick={() => onPage(page + 1)}
        >
          <NavigateNextOutlinedIcon fontSize="small" />
        </button>
      </div>
    </div>
  );
}

/* ── Botón icónico accesible ──────────────────────────────────────────── */

/**
 * Un icono sin nombre accesible es un botón invisible para quien navega con
 * lector. `label` es obligatorio a propósito: no hay forma de crear uno mudo.
 */
export function OpsIconBtn({
  label,
  icon,
  onClick,
  tone,
  disabled,
  active,
  title,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  tone?: "danger" | "ok";
  disabled?: boolean;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={s.iconBtn}
      data-tone={tone}
      data-active={active ? "1" : undefined}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
    >
      <span aria-hidden="true" style={{ display: "inline-flex" }}>
        {icon}
      </span>
    </button>
  );
}

/* ── Fila expandible ──────────────────────────────────────────────────── */

export function OpsExpandBtn({
  expanded,
  onToggle,
  controls,
  label,
}: {
  expanded: boolean;
  onToggle: () => void;
  controls: string;
  label: string;
}) {
  return (
    <button
      type="button"
      className={s.expandBtn}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onToggle}
    >
      <span className={s.expandChevron} aria-hidden="true">
        <ChevronRightIcon style={{ fontSize: 15 }} />
      </span>
      {label}
    </button>
  );
}

/* ── URL compartible ──────────────────────────────────────────────────── */

/**
 * Vuelca los filtros vivos a la query string sin provocar navegación de Next
 * (`history.replaceState`, no `router.replace`): la vista se puede copiar y
 * pegar, y el filtrado sigue costando cero renders extra.
 */
export function useUrlFilters(values: Record<string, string | number | null | undefined>) {
  const pathname = usePathname();
  const qs = useMemo(() => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(values)) {
      if (v === null || v === undefined || v === "") continue;
      sp.set(k, String(v));
    }
    return sp.toString();
    // `values` es un objeto nuevo en cada render, pero `qs` es una cadena:
    // el efecto de abajo compara por valor y no se dispara de más.
  }, [values]);

  useEffect(() => {
    if (typeof window === "undefined" || !pathname) return;
    const next = qs ? `${pathname}?${qs}` : pathname;
    if (window.location.pathname + window.location.search !== next) {
      window.history.replaceState(null, "", next);
    }
  }, [pathname, qs]);
}

/** Lector tipado de la query string inicial. */
export function readParam(
  sp: URLSearchParams | null,
  key: string,
  fallback = "",
): string {
  const v = sp?.get(key);
  return v == null || v === "" ? fallback : v;
}

export function readIntParam(
  sp: URLSearchParams | null,
  key: string,
  fallback: number,
  min = 1,
): number {
  const raw = sp?.get(key);
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
}

export { s as opsStyles };
