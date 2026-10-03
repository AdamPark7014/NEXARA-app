"use client";

import Link from "next/link";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { statusTone } from "./estado-tono";
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
  size = "md",
  icon,
}: {
  tone?: Tone;
  dot?: boolean;
  title?: string;
  children: ReactNode;
  className?: string;
  /** `sm` = 20 px, para celdas densas. */
  size?: "sm" | "md";
  icon?: ReactNode;
}) {
  return (
    <span
      title={title}
      className={[s.badge, TONO[tone], dot ? s.badgeDot : "", size === "sm" ? s.badgeSm : "", className].filter(Boolean).join(" ")}
    >
      {icon ? (
        <span className={s.badgeIco} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}

/**
 * Insignia de estado con UN solo mapa estado→tono (`estado-tono.ts`). Recibe el código
 * del backend o la etiqueta legible; `label` y `tone` sirven para forzar ambos.
 */
export function StatusBadge({
  status,
  label,
  tone,
  dot = true,
  size = "md",
  title,
  className,
}: {
  status?: string | null;
  label?: ReactNode;
  tone?: Tone;
  dot?: boolean;
  size?: "sm" | "md";
  title?: string;
  className?: string;
}) {
  const m = statusTone(status);
  return (
    <Badge tone={tone ?? m.tone} dot={dot} size={size} title={title} className={className}>
      {label ?? m.label}
    </Badge>
  );
}

export type KindId = "cctv" | "red" | "acceso" | "obra";

const KIND_ICON: Record<KindId, ReactNode> = {
  cctv: <path d="M3 7h11l3 3v0l-3 3H3zM17 10l4-2v6l-4-2M6 13v4h3" />,
  red: <path d="M5 12.5a10 10 0 0 1 14 0M8 15.5a5.5 5.5 0 0 1 8 0M12 19h.01M2 9.5a14.5 14.5 0 0 1 20 0" />,
  acceso: <path d="M14.5 9.5a4 4 0 1 1-5.66 5.66 4 4 0 0 1 5.66-5.66zM14.5 9.5 20 4M17.5 6.5l2 2M15.5 8.5l1.5 1.5" />,
  obra: <path d="M12 3 4 20h16L12 3zM8.5 13h7M7 16.5h10" />,
};

/** Tipo de trabajo (color de categoría, nunca de estado): CCTV · Redes · Acceso · Obra. */
export function Kind({ kind, label, icon }: { kind: KindId; label?: ReactNode; icon?: ReactNode }) {
  return (
    <span className={s.kind} data-kind={kind}>
      <span className={s.kindIco} aria-hidden="true">
        {icon ?? (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {KIND_ICON[kind]}
          </svg>
        )}
      </span>
      {label != null ? <span>{label}</span> : null}
    </span>
  );
}

/** Barra de avance con la cifra a la derecha («4/6»). */
export function Progress({
  value,
  max = 100,
  tone = "brand",
  label,
  ariaLabel,
}: {
  value: number;
  max?: number;
  tone?: Tone;
  /** Texto a la derecha; por defecto, el porcentaje. */
  label?: ReactNode;
  ariaLabel?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span className={s.prog}>
      <span
        className={s.progBar}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={ariaLabel}
      >
        <span style={{ width: `${pct}%`, background: TONE_COLOR[tone] }} />
      </span>
      <span className={s.progN}>{label ?? `${Math.round(pct)}%`}</span>
    </span>
  );
}

/** Tarjeta: superficie con borde de 1 px, radio de 16 px y elevación mínima. */
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
      {actions ? <div className={s.cardActions}>{actions}</div> : null}
    </div>
  );
}

/**
 * Fila de cifras. `cards` (por defecto) = una tarjeta por cifra con separación;
 * `strip` = una sola tarjeta con divisiones, para tiras densas (finanzas).
 */
export function StatRow({
  children,
  cols,
  variant = "cards",
  ariaLabel,
  className,
}: {
  children: ReactNode;
  cols?: number;
  variant?: "cards" | "strip";
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      aria-label={ariaLabel}
      className={[s.stats, variant === "strip" ? s.statsStrip : "", className].filter(Boolean).join(" ")}
      data-cols={cols ? "fijo" : undefined}
      style={cols ? ({ "--stat-cols": cols } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}

export type StatTone = "default" | "brand" | "success" | "warning" | "danger";
export type StatTrend = {
  value: ReactNode;
  direction: "up" | "down" | "flat";
  /** Si subir es malo (p. ej. retardos), fuerza el color. Por defecto: sube = verde. */
  tone?: "success" | "danger" | "neutral";
};
export type StatMeterSegment = { value: number; tone?: Tone; color?: string; label?: ReactNode };
export type Semaforo = "verde" | "ambar" | "rojo" | "gris";

const SEMAFORO_LABEL: Record<Semaforo, string> = { verde: "verde", ambar: "ámbar", rojo: "rojo", gris: "sin dato" };

function TrendArrow({ direction }: { direction: StatTrend["direction"] }) {
  const d = direction === "up" ? "M3 11l4-4 3 3 4-5M10 5h4v4" : direction === "down" ? "M3 5l4 4 3-3 4 5M10 11h4V7" : "M3 8h10";
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Una cifra: etiqueta, número grande y una pista corta. `tone` solo colorea el número.
 * Opcionales v2: `icon` (pastilla de color), `trend` (▲ 18 %), `meter` (barra de
 * composición con leyenda), `semaforo` y `spark` (barritas de la serie).
 */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
  dot,
  title,
  href,
  icon,
  iconTone,
  trend,
  meter,
  meterMax,
  semaforo,
  suffix,
  spark,
  footer,
  onClick,
  pressed,
  loading = false,
  ariaLabel,
  density = "default",
  as,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  /** Punto de color antes de la etiqueta (p. ej. estado de la pizarra). */
  dot?: string;
  title?: string;
  /** Si se da, la cifra abre esa página (p. ej. la lista de lo que la compone). */
  href?: string;
  icon?: ReactNode;
  /** Color de la pastilla del icono; por defecto sigue a `tone` (marca si no hay). */
  iconTone?: Tone;
  trend?: StatTrend;
  /** Composición de la cifra (hechas / en curso / tarde). */
  meter?: StatMeterSegment[];
  /** Total contra el que se mide la barra; por defecto, la suma de los segmentos. */
  meterMax?: number;
  semaforo?: Semaforo;
  /** Texto chico pegado al número («/ 38», «M», «%»). */
  suffix?: ReactNode;
  spark?: number[];
  footer?: ReactNode;
  /** La cifra filtra la vista en el sitio (botón). */
  onClick?: () => void;
  /** Cifra usada como filtro: marca la activa (`aria-pressed`). */
  pressed?: boolean;
  loading?: boolean;
  ariaLabel?: string;
  density?: "default" | "compact";
  /** Elemento contenedor cuando no es enlace; con `onClick` y `as`, se vuelve role="button". */
  as?: "div" | "article";
  className?: string;
}) {
  const valor =
    tone === "brand"
      ? s.statValueBrand
      : tone === "success"
        ? s.statValueSuccess
        : tone === "warning"
          ? s.statValueWarning
          : tone === "danger"
            ? s.statValueDanger
            : "";
  const tonoIcono: Tone = iconTone ?? (tone === "default" ? "brand" : tone);
  const totalMedidor = meter ? (meterMax ?? meter.reduce((a, m) => a + Math.max(0, m.value), 0)) : 0;
  const leyenda = meter?.filter((m) => m.label != null) ?? [];
  const trendTone = trend ? (trend.tone ?? (trend.direction === "up" ? "success" : trend.direction === "down" ? "danger" : "neutral")) : null;
  const sparkMax = spark && spark.length ? Math.max(...spark) || 1 : 1;

  const contenido = (
    <>
      <span className={s.statTop}>
        {icon ? (
          <span className={[s.statIco, TONO[tonoIcono]].filter(Boolean).join(" ")} aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span className={s.statLabel}>
          {dot ? <span className={s.statDot} style={{ background: dot }} aria-hidden="true" /> : null}
          {label}
        </span>
        {semaforo ? (
          <span className={s.semaf} data-s={semaforo} role="img" aria-label={`Semáforo ${SEMAFORO_LABEL[semaforo]}`} />
        ) : null}
      </span>
      {spark && spark.length > 1 ? (
        <span className={s.spark} aria-hidden="true">
          {spark.slice(-8).map((v, i) => (
            <span key={i} style={{ height: `${Math.max(12, (Math.max(0, v) / sparkMax) * 100)}%` }} />
          ))}
        </span>
      ) : null}
      <span className={[s.statValue, valor].filter(Boolean).join(" ")}>
        {loading ? <span className={`ui-skeleton ${s.statSkeleton}`} aria-hidden="true" /> : value}
        {!loading && suffix != null ? <small className={s.statSuffix}>{suffix}</small> : null}
        {href ? (
          <span className={s.statArrow} aria-hidden="true">
            ›
          </span>
        ) : null}
      </span>
      {meter && meter.length ? (
        <>
          <span className={s.meter} aria-hidden="true">
            {meter.map((m, i) => (
              <span
                key={i}
                style={{
                  width: `${totalMedidor > 0 ? (Math.max(0, m.value) / totalMedidor) * 100 : 0}%`,
                  background: m.color ?? TONE_COLOR[m.tone ?? "brand"],
                }}
              />
            ))}
          </span>
          {leyenda.length ? (
            <span className={s.legend}>
              {leyenda.map((m, i) => (
                <span key={i}>
                  <i style={{ background: m.color ?? TONE_COLOR[m.tone ?? "brand"] }} aria-hidden="true" />
                  {m.label}
                </span>
              ))}
            </span>
          ) : null}
        </>
      ) : null}
      {trend || hint ? (
        <span className={s.statFoot}>
          {trend ? (
            <span className={s.trend} data-tone={trendTone ?? undefined}>
              <TrendArrow direction={trend.direction} />
              {trend.value}
            </span>
          ) : null}
          {hint ? <span className={s.statHint}>{hint}</span> : null}
        </span>
      ) : null}
      {footer ? <span className={s.statFooter}>{footer}</span> : null}
    </>
  );

  const clases = [s.stat, density === "compact" ? s.statCompact : "", href || onClick ? s.statLink : "", className].filter(Boolean).join(" ");

  if (href) {
    return (
      <Link href={href} className={clases} title={title} aria-label={ariaLabel} aria-busy={loading || undefined}>
        {contenido}
      </Link>
    );
  }
  if (onClick && !as) {
    return (
      <button
        type="button"
        className={clases}
        title={title}
        onClick={onClick}
        aria-label={ariaLabel}
        aria-pressed={pressed}
        aria-busy={loading || undefined}
      >
        {contenido}
      </button>
    );
  }
  const Tag = as ?? "div";
  const interactivo = Boolean(onClick);
  return (
    <Tag
      className={clases}
      title={title}
      onClick={onClick}
      onKeyDown={
        interactivo
          ? (e: KeyboardEvent<HTMLElement>) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      role={interactivo ? "button" : undefined}
      tabIndex={interactivo ? 0 : undefined}
      aria-label={interactivo ? ariaLabel : undefined}
      aria-pressed={interactivo ? pressed : undefined}
      aria-busy={loading || undefined}
      data-selected={pressed ? "true" : undefined}
    >
      {contenido}
    </Tag>
  );
}

export type SegmentItem<T extends string> = { id: T; label: ReactNode; count?: number; title?: string };

/**
 * Control segmentado de 36 px (Hoy / Semana / Mes…). Botones con `aria-pressed`
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
