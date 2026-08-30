"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
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
        <p className={styles.igEmpty}>{empty || "Sin datos"}</p>
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

export function IgError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className={styles.error}>{children}</p>;
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
