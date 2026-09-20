"use client";

import type { CSSProperties, ReactNode } from "react";
import s from "./piezas.module.css";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "violet" | "brand" | "outline";

const TONO: Record<Tone, string> = {
  neutral: "",
  success: s.toneSuccess,
  warning: s.toneWarning,
  danger: s.toneDanger,
  info: s.toneInfo,
  violet: s.toneViolet,
  brand: s.toneBrand,
  outline: s.toneOutline,
};

/** Color sólido de cada tono (puntos de estado, barras). */
export const TONE_COLOR: Record<Tone, string> = {
  neutral: "var(--ui-fg-3)",
  success: "var(--ui-success)",
  warning: "var(--ui-warning)",
  danger: "var(--ui-danger)",
  info: "var(--ui-info)",
  violet: "var(--ui-violet)",
  brand: "var(--ui-brand)",
  outline: "var(--ui-fg-3)",
};

/** Píldora de estado: fondo tenue del tono y texto legible; `dot` antepone un punto. */
export function Badge({
  tone = "neutral",
  dot = false,
  title,
  children,
  className,
}: {
  tone?: Tone;
  dot?: boolean;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span title={title} className={[s.badge, TONO[tone], dot ? s.badgeDot : "", className].filter(Boolean).join(" ")}>
      {children}
    </span>
  );
}

/** Tarjeta: superficie con borde de 1 px y radio de 12 px; sin sombra. */
export function Card({
  children,
  pad = false,
  className,
  style,
  as: Tag = "section",
  ...aria
}: {
  children: ReactNode;
  pad?: boolean;
  className?: string;
  style?: CSSProperties;
  as?: "section" | "div" | "article";
  "aria-label"?: string;
}) {
  return (
    <Tag className={[s.card, pad ? s.cardPad : "", className].filter(Boolean).join(" ")} style={style} {...aria}>
      {children}
    </Tag>
  );
}

/** Cabecera de tarjeta: título, subtítulo y acciones. */
export function CardHead({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={s.cardHead}>
      <div style={{ minWidth: 0 }}>
        <h2 className={s.cardTitle}>{title}</h2>
        {subtitle ? <p className={s.cardSub}>{subtitle}</p> : null}
      </div>
      {actions ? <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{actions}</div> : null}
    </div>
  );
}

/** Fila de cifras en una sola tarjeta con divisiones (2 columnas en teléfono). */
export function StatRow({ children, cols }: { children: ReactNode; cols?: number }) {
  return (
    <div className={s.stats} style={cols ? ({ "--stat-cols": cols } as CSSProperties) : undefined}>
      {children}
    </div>
  );
}

/** Una cifra: etiqueta, número grande y una pista corta. `tone` solo colorea el número. */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
  dot,
  title,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "brand" | "warning" | "danger";
  /** Punto de color antes de la etiqueta (p. ej. estado de la pizarra). */
  dot?: string;
  title?: string;
}) {
  const valor =
    tone === "brand" ? s.statValueBrand : tone === "warning" ? s.statValueWarning : tone === "danger" ? s.statValueDanger : "";
  return (
    <div className={s.stat} title={title}>
      <span className={s.statLabel}>
        {dot ? <span className={s.statDot} style={{ background: dot }} aria-hidden="true" /> : null}
        {label}
      </span>
      <span className={[s.statValue, valor].filter(Boolean).join(" ")}>{value}</span>
      {hint ? <span className={s.statHint}>{hint}</span> : null}
    </div>
  );
}

export type SegmentItem<T extends string> = { id: T; label: ReactNode; count?: number; title?: string };

/**
 * Control segmentado de 32 px (Hoy / Semana / Mes…). Botones con `aria-pressed`
 * dentro de un `role="group"`: se prueban y se leen igual que antes.
 */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: ReadonlyArray<SegmentItem<T>>;
  value: T | null;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className={s.segmented} role="group" aria-label={ariaLabel}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={s.segment}
          aria-pressed={value === it.id}
          title={it.title}
          onClick={() => onChange(it.id)}
        >
          {it.label}
          {it.count != null ? <span className={s.segmentCount}>{it.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
