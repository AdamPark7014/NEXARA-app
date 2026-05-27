"use client";

import { ReactNode } from "react";

/**
 * NEXARA · KpiCard (premium)
 * Tarjeta de KPI consistente con:
 *  - glow del variant (positive / warning / danger / accent / default)
 *  - tipografía tabular en el valor
 *  - hover lift sutil
 *  - sparkline opcional (array de números 0..1 escalados internamente)
 *  - delta direccional
 *  - footer opcional para meta-info
 */

export type KpiVariant = "default" | "positive" | "warning" | "danger" | "accent";

type Trend = { value: string; direction: "up" | "down" | "flat" };

export default function KpiCard({
  label,
  value,
  hint,
  icon,
  variant = "default",
  trend,
  sparkline,
  footer,
  onClick,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  variant?: KpiVariant;
  trend?: Trend;
  sparkline?: number[];
  footer?: ReactNode;
  onClick?: () => void;
}) {
  const variantStyles: Record<KpiVariant, { glow: string; accent: string; ring: string }> = {
    default: {
      glow: "var(--surface-2)",
      accent: "var(--text-secondary)",
      ring: "var(--nx-panel-hairline)",
    },
    positive: {
      glow: "var(--state-success-bg)",
      accent: "var(--success)",
      ring: "color-mix(in srgb, var(--success) 32%, var(--border))",
    },
    warning: {
      glow: "var(--state-warning-bg)",
      accent: "var(--warning)",
      ring: "color-mix(in srgb, var(--warning) 32%, var(--border))",
    },
    danger: {
      glow: "var(--state-danger-bg)",
      accent: "var(--danger)",
      ring: "color-mix(in srgb, var(--danger) 32%, var(--border))",
    },
    accent: {
      glow: "var(--state-info-bg)",
      accent: "var(--primary)",
      ring: "color-mix(in srgb, var(--primary) 32%, var(--border))",
    },
  };

  const { glow, accent, ring } = variantStyles[variant];
  const interactive = Boolean(onClick);

  return (
    <article
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      className="nx-kpi"
      style={{
        position: "relative",
        background: "var(--nx-panel-surface-overlay)",
        border: `1px solid ${ring}`,
        borderRadius: "var(--nx-panel-radius)",
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        overflow: "hidden",
        cursor: interactive ? "pointer" : "default",
        boxShadow: "var(--nx-panel-elev-1)",
        transition:
          "transform 200ms var(--nx-ease-out), box-shadow 240ms var(--nx-ease-out), border-color 200ms var(--nx-ease-out)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(140deg, ${glow} 0%, transparent 55%)`,
          opacity: 0.7,
          pointerEvents: "none",
        }}
      />
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, ${accent} 0%, color-mix(in srgb, ${accent} 35%, transparent) 100%)`,
          opacity: variant === "default" ? 0 : 0.85,
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-tertiary)",
          }}
        >
          {label}
        </span>
        {icon && (
          <span
            style={{
              fontSize: 16,
              width: 32,
              height: 32,
              borderRadius: 10,
              background: `color-mix(in srgb, ${accent} 16%, var(--surface))`,
              border: `1px solid color-mix(in srgb, ${accent} 28%, var(--border))`,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: accent,
            }}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
      </div>

      <div
        style={{
          fontFamily: "var(--nx-font-display)",
          fontSize: "clamp(1.7rem, 1.4rem + 0.8vw, 2.1rem)",
          fontWeight: 700,
          letterSpacing: "-0.025em",
          color: "var(--text-primary)",
          lineHeight: 1,
          position: "relative",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>

      {sparkline && sparkline.length > 1 && (
        <Sparkline data={sparkline} color={accent} />
      )}

      {(hint || trend) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            position: "relative",
          }}
        >
          {hint && (
            <span
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                lineHeight: 1.35,
              }}
            >
              {hint}
            </span>
          )}
          {trend && (
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: 8,
                background:
                  trend.direction === "up"
                    ? "var(--state-success-bg)"
                    : trend.direction === "down"
                      ? "var(--state-danger-bg)"
                      : "var(--surface-2)",
                color:
                  trend.direction === "up"
                    ? "var(--state-success-text)"
                    : trend.direction === "down"
                      ? "var(--state-danger-text)"
                      : "var(--text-secondary)",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {trend.direction === "up" ? "▲" : trend.direction === "down" ? "▼" : "—"}{" "}
              {trend.value}
            </span>
          )}
        </div>
      )}

      {footer && (
        <div
          style={{
            position: "relative",
            marginTop: 6,
            paddingTop: 10,
            borderTop: "1px dashed var(--nx-panel-hairline-soft)",
            fontSize: 11.5,
            color: "var(--text-tertiary)",
          }}
        >
          {footer}
        </div>
      )}

      <style jsx>{`
        .nx-kpi:hover {
          transform: ${interactive ? "translateY(-2px)" : "translateY(-1px)"};
          box-shadow: var(--nx-panel-elev-hover);
          border-color: color-mix(in srgb, ${accent} 50%, var(--border));
        }
      `}</style>
    </article>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 100;
  const h = 26;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = w / (data.length - 1);

  const pts = data.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    return [x, y] as const;
  });

  const dLine = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const dArea = `${dLine} L ${w} ${h} L 0 ${h} Z`;
  const gradId = `nx-spark-${color.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={h}
      preserveAspectRatio="none"
      style={{ position: "relative", display: "block" }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.32} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={dArea} fill={`url(#${gradId})`} />
      <path d={dLine} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
