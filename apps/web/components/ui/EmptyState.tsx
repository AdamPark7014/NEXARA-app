"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * NEXARA · EmptyState
 *
 * Icono → título → una línea → acción. Nada más.
 *
 * Antes venía dentro de una caja de borde punteado con el icono en otra caja
 * redondeada: dos rectángulos para decir que no hay nada. El vacío ya es un
 * hueco; encerrarlo lo hace más grande, no más claro. Ahora el aire y la
 * tipografía hacen el trabajo, y el bloque cae igual de bien dentro de una
 * tabla vacía (`compact`) que en una pantalla entera (`page`).
 */

type Variant = "default" | "compact" | "page";

/** Color del icono según el motivo del vacío. `neutral` = gris (por defecto). */
export type EmptyStateTone = "neutral" | "brand" | "info" | "success" | "warning" | "danger";

const TONE_INK: Record<EmptyStateTone, { color: string; bg: string | null }> = {
  neutral: { color: "var(--ui-fg-3, var(--text-tertiary))", bg: null },
  brand: { color: "var(--ui-brand-text)", bg: "var(--ui-brand-soft)" },
  info: { color: "var(--ui-info-text)", bg: "var(--ui-info-bg)" },
  success: { color: "var(--ui-success-text)", bg: "var(--ui-success-bg)" },
  warning: { color: "var(--ui-warning-text)", bg: "var(--ui-warning-bg)" },
  danger: { color: "var(--ui-danger-text)", bg: "var(--ui-danger-bg)" },
};

function DefaultIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <rect x="3.2" y="5.2" width="17.6" height="13.6" rx="2.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7.4 11.6h9.2M7.4 14.8h5.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

const SPACE: Record<Variant, { padY: number; padX: number; icon: number; title: number; body: number; gap: number }> = {
  compact: { padY: 24, padX: 16, icon: 22, title: 14, body: 12.5, gap: 6 },
  default: { padY: 40, padX: 24, icon: 26, title: 15.5, body: 13, gap: 8 },
  page: { padY: 72, padX: 32, icon: 32, title: 18, body: 13.5, gap: 10 },
};

export default function EmptyState({
  icon,
  title,
  description,
  action,
  variant = "default",
  className,
  style,
  tone = "neutral",
  secondaryAction,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  variant?: Variant;
  className?: string;
  style?: CSSProperties;
  /** Color del icono (p. ej. `success` para «todo al día», `danger` para «no se pudo cargar»). */
  tone?: EmptyStateTone;
  /** Segunda salida, junto a `action` (p. ej. «Limpiar filtros»). */
  secondaryAction?: ReactNode;
}) {
  const s = SPACE[variant] ?? SPACE.default;
  const ink = TONE_INK[tone] ?? TONE_INK.neutral;

  return (
    <div
      role="status"
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: `${s.padY}px ${s.padX}px`,
        gap: s.gap,
        // Sin fondo, sin borde, sin radio: el hueco se entiende solo.
        ...style,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          // El icono orienta, no decora: gris terciario, sin píldora detrás
          // salvo que el tono diga algo (éxito, error…).
          color: ink.color,
          marginBottom: 2,
          ...(ink.bg
            ? { background: ink.bg, width: s.icon + 22, height: s.icon + 22, borderRadius: "50%" }
            : null),
        }}
      >
        {icon ?? <DefaultIcon />}
      </span>

      <h3
        style={{
          fontFamily: "var(--nx-font-display)",
          fontWeight: 650,
          fontSize: s.title,
          margin: 0,
          color: "var(--text-primary)",
          letterSpacing: "-0.01em",
          lineHeight: 1.3,
        }}
      >
        {title}
      </h3>

      {description && (
        <p
          style={{
            fontSize: s.body,
            color: "var(--text-secondary)",
            margin: 0,
            // Una línea corta se lee de un vistazo; un párrafo se salta.
            maxWidth: variant === "compact" ? 360 : 420,
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      )}

      {(action || secondaryAction) && (
        <div
          style={{
            marginTop: s.gap,
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            justifyContent: "center",
          }}
        >
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
