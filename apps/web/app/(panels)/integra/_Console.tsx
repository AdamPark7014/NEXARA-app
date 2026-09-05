"use client";

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import styles from "./integra.module.css";

/** Página de módulo — toolbar compacta, sin hero DashKit. */
export function IgPage({ children }: { children: ReactNode }) {
  return <div className={styles.igPage}>{children}</div>;
}

export function IgToolbar({
  title,
  meta,
  actions,
}: {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.igToolbar}>
      <div className={styles.igToolbarLeft}>
        <h1 className={styles.igToolbarTitle}>{title}</h1>
        {meta != null && <div className={styles.igToolbarMeta}>{meta}</div>}
      </div>
      {actions != null && <div className={styles.igToolbarActions}>{actions}</div>}
    </header>
  );
}

export function IgFilters({ children }: { children: ReactNode }) {
  return <div className={styles.filterBar}>{children}</div>;
}

export function IgField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className={styles.filterField}>
      <span className={styles.filterLabel}>{label}</span>
      {children}
    </label>
  );
}

export function IgSplit({
  left,
  right,
  leftWidth = "42%",
}: {
  left: ReactNode;
  right: ReactNode;
  leftWidth?: string;
}) {
  return (
    <div className={styles.igSplit} style={{ ["--ig-split-left" as string]: leftWidth }}>
      <div className={styles.igSplitPane}>{left}</div>
      <div className={styles.igSplitPane}>{right}</div>
    </div>
  );
}

export function IgPanel({
  title,
  count,
  actions,
  children,
  flush,
}: {
  title: string;
  count?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className={styles.igPanel}>
      <div className={styles.igPanelHead}>
        <div>
          <h2 className={styles.igPanelTitle}>{title}</h2>
          {count != null && <span className={styles.igPanelCount}>{count}</span>}
        </div>
        {actions}
      </div>
      <div className={flush ? styles.igPanelBodyFlush : styles.igPanelBody}>{children}</div>
    </section>
  );
}

export function IgTable({
  columns,
  rows,
  empty,
  onRowClick,
  selectedKey,
}: {
  columns: Array<{ key: string; label: string; width?: string; mono?: boolean; align?: "left" | "right" }>;
  rows: Array<{ key: string; cells: Record<string, ReactNode>; tone?: "ok" | "warn" | "danger" | "muted" }>;
  empty?: string;
  onRowClick?: (key: string) => void;
  selectedKey?: string | null;
}) {
  return (
    <div className={styles.igTableWrap}>
      <table className={styles.igTable}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  width: c.width,
                  textAlign: c.align || "left",
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.key}
              data-tone={r.tone || undefined}
              data-selected={selectedKey === r.key ? "1" : undefined}
              data-click={onRowClick ? "1" : undefined}
              onClick={onRowClick ? () => onRowClick(r.key) : undefined}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  data-mono={c.mono ? "1" : undefined}
                  style={{ textAlign: c.align || "left" }}
                >
                  {r.cells[c.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className={styles.igEmpty}>
          <strong className={styles.igEmptyTitle}>{empty || "Sin datos"}</strong>
        </div>
      )}
    </div>
  );
}

export function IgBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger" | "accent";
}) {
  return <span className={styles.igBadge} data-tone={tone}>{children}</span>;
}

/**
 * Error de consola.
 *
 * Antes pintaba el mensaje crudo de la API y nada más: el operador leía
 * «Request failed with status code 502» sin saber qué había fallado ni qué
 * podía hacer. Ahora lleva titular, cuerpo y una acción opcional de reintento.
 *
 * La firma vieja `<IgError>{error}</IgError>` sigue funcionando igual: todas
 * las props nuevas son opcionales y el titular tiene texto por defecto.
 */
export function IgError({
  children,
  title,
  tone = "danger",
  onRetry,
  retryLabel = "Reintentar",
  retrying,
}: {
  children: ReactNode;
  /** Qué ha fallado, en cristiano. Por defecto según el tono. */
  title?: string;
  /** `danger` = la operación no salió. `warn` = salió a medias. */
  tone?: "danger" | "warn";
  /** Si se pasa, aparece el botón de reintento. */
  onRetry?: () => void;
  retryLabel?: string;
  /** Deshabilita el botón mientras el reintento está en vuelo. */
  retrying?: boolean;
}) {
  if (!children) return null;
  const heading = title ?? (tone === "warn" ? "Terminó con avisos" : "No se pudo completar");
  return (
    <div className={styles.error} data-tone={tone} role="alert">
      <strong className={styles.errorTitle}>{heading}</strong>
      <span className={styles.errorBody}>{children}</span>
      {onRetry != null && (
        <div className={styles.errorActions}>
          <button
            type="button"
            className={styles.errorRetry}
            onClick={onRetry}
            disabled={retrying}
          >
            {retrying ? "Reintentando…" : retryLabel}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Skeleton de carga.
 *
 * No había ni uno en todo el panel: el contenido saltaba de vacío a lleno y,
 * mientras el ISAPI respondía, la consola parecía colgada. La gracia está en
 * calcar la geometría de lo que va a aparecer, así que la variante `row` lleva
 * el mismo número de columnas que la tabla a la que sustituye.
 */
export function IgSkeleton({
  variant = "block",
  rows = 3,
  columns = 4,
  height,
  width,
  label = "Cargando…",
}: {
  /** `block` = un rectángulo. `text` = líneas de párrafo. `row` = filas de tabla/lista. */
  variant?: "block" | "text" | "row";
  /** Cuántas líneas o filas pintar. Ignorado en `block`. */
  rows?: number;
  /** Columnas de cada fila en `row`: pásale las mismas que la tabla real. */
  columns?: number;
  /** Alto del bloque en `block` (por defecto 72px). */
  height?: string;
  width?: string;
  label?: string;
}) {
  const n = Math.max(1, rows);
  const body =
    variant === "block" ? (
      <div
        className={styles.igSkelBlock}
        style={{ height: height ?? "72px", width: width ?? "100%" }}
      />
    ) : variant === "text" ? (
      Array.from({ length: n }, (_, i) => (
        <div
          key={i}
          className={`${styles.igSkelBlock} ${styles.igSkelLine}`}
          // La última línea corta, como corta un párrafo de verdad.
          style={{ width: i === n - 1 ? "62%" : `${92 - (i % 3) * 7}%` }}
        />
      ))
    ) : (
      Array.from({ length: n }, (_, r) => (
        <div
          key={r}
          className={styles.igSkelRow}
          style={{ ["--ig-skel-cols" as string]: Math.max(1, columns) }}
        >
          {Array.from({ length: Math.max(1, columns) }, (_, c) => (
            <div key={c} className={styles.igSkelBlock} />
          ))}
        </div>
      ))
    );

  return (
    <div className={styles.igSkeleton} role="status" aria-busy="true" aria-live="polite">
      {body}
      <span className={styles.igSrOnly}>{label}</span>
    </div>
  );
}

export function IgNotice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warn" | "ok";
}) {
  if (!children) return null;
  return (
    <p
      className={styles.igNotice}
      data-tone={tone === "warn" ? "warn" : tone === "ok" ? "ok" : undefined}
    >
      {children}
    </p>
  );
}

/**
 * Vacío con explicación. Admite icono, título, descripción y acción para que
 * las páginas puedan pasar de «Sin datos» a decir qué falta y qué hacer.
 *
 * `title` y `hint` se mantienen tal cual porque son las props que ya usan las
 * páginas; `description` es la versión ReactNode de `hint` (para meter un
 * <code> o un enlace) y gana si se pasan las dos.
 */
export function IgEmptyState({
  icon,
  title,
  hint,
  description,
  action,
  children,
}: {
  /** Glifo o SVG decorativo. No se anuncia: el texto ya lo dice. */
  icon?: ReactNode;
  title?: string;
  hint?: string;
  description?: ReactNode;
  /** Botón o enlace que resuelve el vacío (crear, sincronizar, cambiar filtro). */
  action?: ReactNode;
  children?: ReactNode;
}) {
  const body = description ?? (hint ? hint : null);
  const bare = !title && body == null && !icon && !action;
  return (
    <div className={styles.igEmpty}>
      {icon != null && (
        <span className={styles.igEmptyIcon} aria-hidden>
          {icon}
        </span>
      )}
      {title ? <strong className={styles.igEmptyTitle}>{title}</strong> : null}
      {body != null ? <span className={styles.igEmptyHint}>{body}</span> : null}
      {bare ? children || "Sin datos" : children}
      {action != null && <div className={styles.igEmptyActions}>{action}</div>}
    </div>
  );
}

export function IgBtn({
  children,
  variant = "ghost",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "ghost" | "primary" | "danger";
}) {
  const cls =
    variant === "primary"
      ? styles.btnPrimary
      : variant === "danger"
        ? `${styles.btnGhost} ${styles.igBtnDanger}`
        : styles.btnGhost;
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}

/* ── Ops workbench primitives ─────────────────────────────── */

export function IgWorkbench({
  tree,
  canvas,
  feed,
}: {
  tree: ReactNode;
  canvas: ReactNode;
  feed: ReactNode;
}) {
  return (
    <div className={styles.igWorkbench}>
      <aside className={styles.igWorkbenchTree}>{tree}</aside>
      <section className={styles.igWorkbenchCanvas}>{canvas}</section>
      <aside className={styles.igWorkbenchFeed}>{feed}</aside>
    </div>
  );
}

export type IgTreeNode = {
  id: string;
  label: string;
  kind: "region" | "door" | "camera" | "group";
  online?: boolean | null;
  children?: IgTreeNode[];
};

export function IgTree({
  nodes,
  selectedId,
  onSelect,
  empty,
}: {
  nodes: IgTreeNode[];
  selectedId?: string | null;
  onSelect?: (id: string, kind: IgTreeNode["kind"]) => void;
  empty?: string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  const renderNode = (n: IgTreeNode, depth: number) => {
    const hasKids = Boolean(n.children?.length);
    const isOpen = open[n.id] !== false; // default expanded
    const selectable = n.kind === "door" || n.kind === "camera";
    return (
      <div key={n.id} className={styles.igTreeNode} style={{ ["--ig-depth" as string]: depth }}>
        <button
          type="button"
          className={styles.igTreeRow}
          data-selected={selectedId === n.id ? "1" : undefined}
          data-kind={n.kind}
          data-online={n.online === false ? "0" : n.online === true ? "1" : undefined}
          onClick={() => {
            if (hasKids) toggle(n.id);
            if (selectable) onSelect?.(n.id, n.kind);
            else if (n.kind === "region" || n.kind === "group") onSelect?.(n.id, n.kind);
          }}
        >
          <span className={styles.igTreeTwist} aria-hidden>
            {hasKids ? (isOpen ? "▾" : "▸") : "·"}
          </span>
          <span className={styles.igTreeKind} data-kind={n.kind} aria-hidden>
            {n.kind === "door" ? "D" : n.kind === "camera" ? "C" : n.kind === "region" ? "R" : "·"}
          </span>
          <span className={styles.igTreeLabel}>{n.label}</span>
          {n.online != null && (
            <span className={styles.igTreeDot} data-online={n.online ? "1" : "0"} />
          )}
        </button>
        {hasKids && isOpen && (
          <div className={styles.igTreeKids}>
            {n.children!.map((c) => renderNode(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (!nodes.length) {
    return (
      <div className={styles.igEmpty}>
        <strong className={styles.igEmptyTitle}>{empty || "Sin recursos"}</strong>
        <span className={styles.igEmptyHint}>Sincroniza el sitio o elige otro en la barra superior.</span>
      </div>
    );
  }

  return <div className={styles.igTree}>{nodes.map((n) => renderNode(n, 0))}</div>;
}

export function IgCanvas({
  tabs,
  active,
  onTab,
  children,
  actions,
}: {
  tabs: Array<{ id: string; label: string }>;
  active: string;
  onTab: (id: string) => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={styles.igCanvas}>
      <div className={styles.igCanvasBar}>
        <div className={styles.igCanvasTabs} role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active === t.id}
              className={styles.igCanvasTab}
              data-active={active === t.id ? "1" : undefined}
              onClick={() => onTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {actions != null && <div className={styles.igCanvasActions}>{actions}</div>}
      </div>
      <div className={styles.igCanvasBody}>{children}</div>
    </div>
  );
}

export type IgFeedItem = {
  id: string;
  time: string;
  title: string;
  meta?: string;
  tone?: "ok" | "warn" | "danger" | "muted";
};

export function IgFeed({
  title,
  items,
  onItemClick,
  empty,
  actions,
}: {
  title: string;
  items: IgFeedItem[];
  onItemClick?: (id: string) => void;
  empty?: string;
  actions?: ReactNode;
}) {
  return (
    <div className={styles.igFeed}>
      <div className={styles.igFeedHead}>
        <h2 className={styles.igFeedTitle}>{title}</h2>
        {actions}
      </div>
      <div className={styles.igFeedList}>
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            className={styles.igFeedItem}
            data-tone={it.tone || undefined}
            data-click={onItemClick ? "1" : undefined}
            onClick={onItemClick ? () => onItemClick(it.id) : undefined}
          >
            <span className={styles.igFeedTime}>{it.time}</span>
            <span className={styles.igFeedMain}>
              <span className={styles.igFeedItemTitle}>{it.title}</span>
              {it.meta && <span className={styles.igFeedMeta}>{it.meta}</span>}
            </span>
          </button>
        ))}
        {items.length === 0 && (
          <div className={styles.igEmpty}>
            <strong className={styles.igEmptyTitle}>{empty || "Sin eventos"}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

