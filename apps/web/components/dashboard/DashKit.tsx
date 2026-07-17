"use client";

import { ReactNode } from "react";
import Link from "next/link";
import styles from "./DashKit.module.css";

/**
 * NEXARA · DashKit — primitivas limpias para los dashboards ejecutivos
 * de los 5 paneles (ERP, CRM, OPS, Studio, Lab).
 *
 * Filosofía: superficies planas, hairlines, números tabulares grandes,
 * el acento del panel (--panel-accent) usado con moderación.
 */

export type DashTone = "default" | "accent" | "positive" | "warning" | "danger";

const TONE_CLASS: Record<DashTone, string> = {
  default: "",
  accent: styles.toneAccent,
  positive: styles.tonePositive,
  warning: styles.toneWarning,
  danger: styles.toneDanger,
};

const PILL_CLASS: Record<DashTone | "neutral", string> = {
  default: styles.pillNeutral,
  neutral: styles.pillNeutral,
  accent: styles.pillAccent,
  positive: styles.pillPositive,
  warning: styles.pillWarning,
  danger: styles.pillDanger,
};

export function DashPage({ children }: { children: ReactNode }) {
  return <div className={styles.page}>{children}</div>;
}

export function DashHero({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.hero}>
      <div>
        <span className={styles.heroEyebrow}>{eyebrow}</span>
        <h1 className={styles.heroTitle}>{title}</h1>
        {subtitle && <p className={styles.heroSub}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.heroActions}>{actions}</div>}
    </header>
  );
}

export function DashGrid({ children }: { children: ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}

export function DashCol({
  span,
  children,
}: {
  span: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;
  children: ReactNode;
}) {
  const cls =
    span === 3 ? styles.col3
    : span === 4 ? styles.col4
    : span === 5 ? styles.col5
    : span === 6 ? styles.col6
    : span === 7 ? styles.col7
    : span === 8 ? styles.col8
    : span === 9 ? styles.col9
    : styles.col12;
  return <div className={cls}>{children}</div>;
}

/** Franja de métricas separadas por hairlines — la pieza principal del dashboard. */
export function StatStrip({
  stats,
}: {
  stats: Array<{
    label: string;
    value: ReactNode;
    sub?: ReactNode;
    tone?: DashTone;
    delta?: { value: string; direction: "up" | "down" | "flat" };
    big?: boolean;
  }>;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.strip}>
        {stats.map((s, i) => (
          <div key={i} className={`${styles.stripCell} ${TONE_CLASS[s.tone ?? "default"]}`}>
            <span className={styles.statLabel}>{s.label}</span>
            <div className={styles.statValueRow}>
              <span className={`${styles.statValue} ${s.big ? styles.statValueBig : ""}`}>{s.value}</span>
              {s.delta && <DeltaChip {...s.delta} />}
            </div>
            {s.sub && <span className={styles.statSub}>{s.sub}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DeltaChip({ value, direction }: { value: string; direction: "up" | "down" | "flat" }) {
  const cls = direction === "up" ? styles.deltaUp : direction === "down" ? styles.deltaDown : styles.deltaFlat;
  return (
    <span className={`${styles.delta} ${cls}`}>
      {direction === "up" ? "▲" : direction === "down" ? "▼" : "—"} {value}
    </span>
  );
}

/** Stat individual, opcionalmente clickeable (Link). */
export function StatCard({
  label,
  value,
  sub,
  tone = "default",
  delta,
  href,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: DashTone;
  delta?: { value: string; direction: "up" | "down" | "flat" };
  href?: string;
}) {
  const body = (
    <>
      <span className={styles.statLabel}>{label}</span>
      <div className={styles.statValueRow}>
        <span className={styles.statValue}>{value}</span>
        {delta && <DeltaChip {...delta} />}
      </div>
      {sub && <span className={styles.statSub}>{sub}</span>}
    </>
  );
  const cls = `${styles.statCard} ${TONE_CLASS[tone]}`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** Panel con encabezado, subtítulo y acción tipo "Ver todo →". */
export function DashPanel({
  title,
  subtitle,
  action,
  actionHref,
  children,
  flush,
  headExtra,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: string;
  actionHref?: string;
  children: ReactNode;
  flush?: boolean;
  headExtra?: ReactNode;
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <div style={{ minWidth: 0 }}>
          <h2 className={styles.panelTitle}>{title}</h2>
          {subtitle && <p className={styles.panelSub}>{subtitle}</p>}
        </div>
        {headExtra}
        {action && actionHref && (
          <Link href={actionHref} className={styles.panelAction}>
            {action} →
          </Link>
        )}
      </div>
      <div className={`${styles.panelBody} ${flush ? styles.panelBodyFlush : ""}`}>{children}</div>
    </section>
  );
}

/** Fila de lista con título / subtítulo / contenido a la derecha. */
export function ListRow({
  title,
  sub,
  trail,
  href,
  leading,
  accent,
}: {
  title: ReactNode;
  sub?: ReactNode;
  trail?: ReactNode;
  href?: string;
  leading?: ReactNode;
  accent?: string;
}) {
  const inner = (
    <>
      {leading}
      <div className={styles.rowMain}>
        <div className={styles.rowTitle}>{title}</div>
        {sub && <div className={styles.rowSub}>{sub}</div>}
      </div>
      {trail && <div className={styles.rowTrail}>{trail}</div>}
    </>
  );
  const style = accent
    ? { boxShadow: `inset 3px 0 0 0 ${accent}` }
    : undefined;
  if (href) {
    return (
      <Link href={href} className={`${styles.row} ${styles.rowHover}`} style={style}>
        {inner}
      </Link>
    );
  }
  return (
    <div className={styles.row} style={style}>
      {inner}
    </div>
  );
}

/** Lista de barras horizontales: distribución / ranking. */
export function BarList({
  items,
  max,
  formatValue,
}: {
  items: Array<{ label: string; value: number; display?: ReactNode; color?: string }>;
  max?: number;
  formatValue?: (v: number) => ReactNode;
}) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {items.map((it, i) => (
        <div key={i} className={styles.barRow}>
          <span className={styles.barLabel} title={it.label}>{it.label}</span>
          <div className={styles.barTrack}>
            <div
              className={styles.barFill}
              style={{ width: `${Math.max(2, (it.value / m) * 100)}%`, ...(it.color ? { background: it.color } : null) }}
            />
          </div>
          <span className={styles.barValue}>
            {it.display ?? (formatValue ? formatValue(it.value) : it.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Rejilla de mini-métricas para usar dentro de un DashPanel. */
export function MiniStatGrid({
  items,
}: {
  items: Array<{ label: string; value: ReactNode; tone?: DashTone }>;
}) {
  return (
    <div className={styles.miniGrid}>
      {items.map((it, i) => (
        <div key={i} className={`${styles.miniCell} ${TONE_CLASS[it.tone ?? "default"]}`}>
          <span className={styles.statLabel}>{it.label}</span>
          <span className={styles.miniValue}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}

export function DashPill({ tone = "neutral", children }: { tone?: DashTone | "neutral"; children: ReactNode }) {
  return <span className={`${styles.pill} ${PILL_CLASS[tone]}`}>{children}</span>;
}

export function DashEmpty({ title, description }: { title: string; description?: string }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyTitle}>{title}</div>
      {description && <div>{description}</div>}
    </div>
  );
}

export function AlertRow({
  level,
  title,
  message,
}: {
  level: "critical" | "warning" | "info";
  title: string;
  message?: string;
}) {
  const color = level === "critical" ? "var(--danger)" : level === "warning" ? "var(--warning)" : "var(--panel-accent, var(--primary))";
  return (
    <div className={styles.alertRow} style={{ borderLeftColor: color }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className={styles.alertTitle}>{title}</div>
        {message && <div className={styles.alertMsg}>{message}</div>}
      </div>
    </div>
  );
}

export function RankIndex({ n }: { n: number }) {
  return <span className={styles.rankIndex}>{n}</span>;
}
