"use client";

/**
 * Componentes UX unificados para los estados básicos de una pantalla:
 *   - <LoadingSpinner />  mientras se hace fetch
 *   - <Skeleton />        placeholder shimmer para listas/tablas/cards
 *   - <EmptyState />      cuando no hay datos
 *   - <ErrorState />      cuando algo falló
 *   - <PageHeader />      título + subtítulo + acciones consistente
 *   - <Card />            contenedor estandarizado
 *   - <StatCard />        KPI tile con delta opcional
 *   - <Badge />           pill de estado / categoría / prioridad
 *
 * Todos respetan las variables CSS del theme (var(--surface), var(--border)...)
 * y funcionan tanto en modo claro como oscuro sin código extra.
 *
 * Uso típico:
 *   if (loading) return <SkeletonList rows={5} />;
 *   if (error)   return <ErrorState error={error} onRetry={refetch} />;
 *   if (items.length === 0) return <EmptyState icon="📋" title="Sin datos" />;
 */

import { type CSSProperties, type ReactNode } from "react";

// ─── LOADING ────────────────────────────────────────────────────────────────
type LoadingSpinnerProps = {
  label?: string;
  size?: "sm" | "md" | "lg";
  inline?: boolean;
};

export function LoadingSpinner({ label = "Cargando…", size = "md", inline = false }: LoadingSpinnerProps) {
  const sizeMap = { sm: 18, md: 28, lg: 44 } as const;
  const px = sizeMap[size];

  if (inline) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--text-secondary, #6b7280)" }}>
        <span
          style={{
            width: px,
            height: px,
            border: `${Math.max(2, px / 10)}px solid var(--border, #e5e7eb)`,
            borderTopColor: "var(--primary, #0ea5e9)",
            borderRadius: "50%",
            animation: "nx-spin 0.8s linear infinite",
            display: "inline-block",
          }}
        />
        <style>{`@keyframes nx-spin { to { transform: rotate(360deg); } }`}</style>
        <span style={{ fontSize: 13 }}>{label}</span>
      </span>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 16px",
        gap: 14,
        color: "var(--text-secondary, #6b7280)",
      }}
    >
      <span
        style={{
          width: px,
          height: px,
          border: `${Math.max(2, px / 10)}px solid var(--border, #e5e7eb)`,
          borderTopColor: "var(--primary, #0ea5e9)",
          borderRadius: "50%",
          animation: "nx-spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes nx-spin { to { transform: rotate(360deg); } }`}</style>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
    </div>
  );
}

// ─── EMPTY STATE ────────────────────────────────────────────────────────────
type EmptyStateProps = {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Variante visual */
  variant?: "default" | "subtle";
};

export function EmptyState({ icon = "📭", title, description, actionLabel, onAction, variant = "default" }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: variant === "subtle" ? "32px 16px" : "48px 24px",
        textAlign: "center",
        background: variant === "subtle" ? "transparent" : "var(--surface, #fff)",
        border: variant === "subtle" ? "1px dashed var(--border, #e5e7eb)" : "1px solid var(--border, #e5e7eb)",
        borderRadius: 14,
        color: "var(--text-secondary, #6b7280)",
      }}
    >
      <div style={{ fontSize: 38, marginBottom: 8, opacity: 0.85 }}>{icon}</div>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text-primary, #111)" }}>{title}</h3>
      {description && (
        <p style={{ margin: "6px 0 0", fontSize: 13, maxWidth: 420, lineHeight: 1.5 }}>{description}</p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          style={{
            marginTop: 16,
            padding: "8px 18px",
            background: "var(--primary, #0ea5e9)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ─── ERROR STATE ────────────────────────────────────────────────────────────
type ErrorStateProps = {
  error: Error | string | unknown;
  title?: string;
  onRetry?: () => void;
};

export function ErrorState({ error, title = "Algo salió mal", onRetry }: ErrorStateProps) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "Error desconocido";

  return (
    <div
      role="alert"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "32px 24px",
        background: "color-mix(in srgb, #dc2626 6%, var(--surface, #fff))",
        border: "1px solid color-mix(in srgb, #dc2626 35%, var(--border, #e5e7eb))",
        borderRadius: 14,
        color: "var(--text-primary, #111)",
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 6 }}>⚠️</div>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{title}</h3>
      <p style={{ margin: "6px 0 0", fontSize: 13, maxWidth: 480, color: "var(--text-secondary, #6b7280)" }}>{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            marginTop: 16,
            padding: "8px 18px",
            background: "#dc2626",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

// ─── PAGE HEADER ────────────────────────────────────────────────────────────
type PageHeaderProps = {
  title: string;
  subtitle?: string;
  icon?: string;
  actions?: ReactNode;
  badge?: ReactNode;
  style?: CSSProperties;
};

export function PageHeader({ title, subtitle, icon, actions, badge, style }: PageHeaderProps) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        padding: "0 0 18px 0",
        marginBottom: 18,
        borderBottom: "1px solid var(--border, #e5e7eb)",
        flexWrap: "wrap",
        ...style,
      }}
    >
      <div style={{ flex: 1, minWidth: 240 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--text-primary, #111)", display: "flex", alignItems: "center", gap: 10 }}>
          {icon && <span style={{ fontSize: 26 }}>{icon}</span>}
          <span>{title}</span>
          {badge && <span style={{ marginLeft: 4 }}>{badge}</span>}
        </h1>
        {subtitle && <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary, #6b7280)", lineHeight: 1.5 }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
    </header>
  );
}

// ─── CARD ───────────────────────────────────────────────────────────────────
type CardProps = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  noPadding?: boolean;
  style?: CSSProperties;
};

export function Card({ children, title, subtitle, actions, noPadding = false, style }: CardProps) {
  return (
    <section
      style={{
        background: "var(--surface, #fff)",
        border: "1px solid var(--border, #e5e7eb)",
        borderRadius: 14,
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
        overflow: "hidden",
        ...style,
      }}
    >
      {(title || actions) && (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "14px 18px",
            borderBottom: "1px solid var(--border, #e5e7eb)",
          }}
        >
          <div>
            {title && <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text-primary, #111)" }}>{title}</h3>}
            {subtitle && <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--text-secondary, #6b7280)" }}>{subtitle}</p>}
          </div>
          {actions && <div style={{ display: "flex", gap: 6 }}>{actions}</div>}
        </header>
      )}
      <div style={{ padding: noPadding ? 0 : 18 }}>{children}</div>
    </section>
  );
}

// ─── SKELETON ───────────────────────────────────────────────────────────────
type SkeletonProps = {
  /** Ancho en px o % (default: 100%). */
  width?: number | string;
  /** Alto en px (default: 14). */
  height?: number;
  /** Borde redondo (default: 6). */
  radius?: number;
  style?: CSSProperties;
};

export function Skeleton({ width = "100%", height = 14, radius = 6, style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width,
        height,
        borderRadius: radius,
        background:
          "linear-gradient(90deg, var(--bg-secondary, #f3f4f6) 0%, var(--border, #e5e7eb) 50%, var(--bg-secondary, #f3f4f6) 100%)",
        backgroundSize: "200% 100%",
        animation: "nx-shimmer 1.4s ease-in-out infinite",
        ...style,
      }}
    >
      <style>{`@keyframes nx-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </span>
  );
}

type SkeletonListProps = {
  rows?: number;
  /** Si true, simula filas de tabla (3 columnas). */
  tableLike?: boolean;
};

export function SkeletonList({ rows = 4, tableLike = false }: SkeletonListProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: 12,
            background: "var(--surface, #fff)",
            border: "1px solid var(--border, #e5e7eb)",
            borderRadius: 10,
          }}
        >
          {tableLike ? (
            <>
              <Skeleton width={120} height={14} />
              <Skeleton width={"40%"} height={14} />
              <Skeleton width={80} height={14} style={{ marginLeft: "auto" }} />
            </>
          ) : (
            <>
              <Skeleton width={36} height={36} radius={10} />
              <div style={{ flex: 1 }}>
                <Skeleton width={"55%"} height={12} />
                <div style={{ height: 6 }} />
                <Skeleton width={"30%"} height={10} />
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── BADGE ──────────────────────────────────────────────────────────────────
type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "primary";

type BadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
  icon?: string;
  /** Estilo pill (default) o cuadrado (sharp). */
  variant?: "pill" | "sharp";
  size?: "sm" | "md";
};

const BADGE_TONES: Record<BadgeTone, { bg: string; color: string; border: string }> = {
  neutral: { bg: "var(--bg-secondary, #f3f4f6)", color: "var(--text-primary, #111)", border: "var(--border, #e5e7eb)" },
  success: { bg: "#dcfce7", color: "#166534", border: "#86efac" },
  warning: { bg: "#fef3c7", color: "#92400e", border: "#fcd34d" },
  danger: { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5" },
  info: { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd" },
  primary: { bg: "#e0f2fe", color: "#075985", border: "#7dd3fc" },
};

export function Badge({ children, tone = "neutral", icon, variant = "pill", size = "md" }: BadgeProps) {
  const palette = BADGE_TONES[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: palette.bg,
        color: palette.color,
        border: `1px solid ${palette.border}`,
        borderRadius: variant === "pill" ? 999 : 6,
        padding: size === "sm" ? "1px 6px" : "2px 8px",
        fontSize: size === "sm" ? 10 : 11,
        fontWeight: 700,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
      }}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}

// ─── STAT CARD ──────────────────────────────────────────────────────────────
type StatCardProps = {
  label: string;
  value: string | number;
  delta?: string;
  deltaPositive?: boolean;
  icon?: string;
  color?: string;
};

export function StatCard({ label, value, delta, deltaPositive = true, icon, color = "#0ea5e9" }: StatCardProps) {
  return (
    <div
      style={{
        background: "var(--surface, #fff)",
        border: "1px solid var(--border, #e5e7eb)",
        borderRadius: 14,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {icon && (
        <div
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            width: 32,
            height: 32,
            borderRadius: 8,
            background: `${color}1a`,
            color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
          }}
        >
          {icon}
        </div>
      )}
      <div style={{ fontSize: 11, color: "var(--text-secondary, #6b7280)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary, #111)" }}>{value}</div>
      {delta && (
        <div style={{ fontSize: 12, color: deltaPositive ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
          {deltaPositive ? "▲" : "▼"} {delta}
        </div>
      )}
    </div>
  );
}
