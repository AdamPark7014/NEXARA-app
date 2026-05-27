"use client";

import { ReactNode } from "react";

/**
 * NEXARA · Section (premium)
 * Bloque visual de sección con jerarquía clara:
 *   eyebrow opcional → título → subtítulo · acciones · cuerpo.
 *
 * Props extra:
 *  - eyebrow: kicker pequeño arriba del título
 *  - tone: "default" | "muted" | "accent" — variante de fondo
 *  - dense: reduce padding y separadores
 *  - flush: cuerpo sin padding (útil para tablas/listas)
 */

type Tone = "default" | "muted" | "accent";

export default function Section({
  eyebrow,
  title,
  subtitle,
  actions,
  footer,
  children,
  tone = "default",
  dense = false,
  flush = false,
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  tone?: Tone;
  dense?: boolean;
  flush?: boolean;
}) {
  const headerPadY = dense ? 12 : 16;
  const bodyPad = flush ? 0 : dense ? "12px 16px" : "20px 22px";

  const toneBg: Record<Tone, string> = {
    default: "var(--surface)",
    muted: "color-mix(in srgb, var(--surface-2) 60%, var(--surface))",
    accent:
      "linear-gradient(168deg, color-mix(in srgb, var(--panel-accent, var(--primary)) 6%, var(--surface)) 0%, var(--surface) 60%)",
  };

  return (
    <section
      style={{
        position: "relative",
        background: toneBg[tone],
        border: "1px solid var(--nx-panel-hairline)",
        borderRadius: "var(--nx-panel-radius)",
        overflow: "hidden",
        marginBottom: 20,
        boxShadow: "var(--nx-panel-elev-1)",
      }}
    >
      {tone === "accent" && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            background:
              "linear-gradient(180deg, var(--panel-accent, var(--primary)) 0%, color-mix(in srgb, var(--panel-accent, var(--primary)) 40%, transparent) 100%)",
          }}
        />
      )}

      {(title || actions || eyebrow) && (
        <header
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 14,
            padding: `${headerPadY}px 22px ${dense ? 10 : 14}px`,
            borderBottom: "1px solid var(--nx-panel-hairline-soft)",
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--surface-2) 45%, transparent) 0%, transparent 100%)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            {eyebrow && (
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "var(--nx-panel-eyebrow-letter, 0.12em)",
                  color: "var(--text-tertiary)",
                  marginBottom: 4,
                }}
              >
                {eyebrow}
              </div>
            )}
            {title && (
              <h2
                style={{
                  fontFamily: "var(--nx-font-display)",
                  fontSize: 15.5,
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                  margin: 0,
                  color: "var(--text-primary)",
                  lineHeight: 1.25,
                }}
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--text-secondary)",
                  marginTop: 4,
                  lineHeight: 1.45,
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
          {actions && (
            <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
              {actions}
            </div>
          )}
        </header>
      )}

      <div style={{ padding: bodyPad }}>{children}</div>

      {footer && (
        <footer
          style={{
            padding: "12px 22px",
            borderTop: "1px solid var(--nx-panel-hairline-soft)",
            background: "color-mix(in srgb, var(--surface-2) 35%, transparent)",
            fontSize: 12,
            color: "var(--text-tertiary)",
          }}
        >
          {footer}
        </footer>
      )}
    </section>
  );
}
