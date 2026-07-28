"use client";

import { ReactNode } from "react";

/**
 * NEXARA · PageHeader (premium)
 * Jerarquía: eyebrow → título grande → subtítulo + acciones.
 * Variantes:
 *  - default: header limpio sin fondo
 *  - hero: card translúcida con glow del panel
 */

type Variant = "default" | "hero";

export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  meta,
  variant = "default",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Píldoras/badges extra debajo del subtítulo (status, sla, dueño…). */
  meta?: ReactNode;
  variant?: Variant;
}) {
  const isHero = variant === "hero";

  return (
    <header
      style={{
        position: "relative",
        marginBottom: isHero ? 28 : 24,
        padding: isHero ? "24px 26px" : "0",
        background: isHero ? "var(--nx-panel-surface-overlay)" : "transparent",
        border: isHero ? "1px solid var(--nx-panel-hairline)" : "none",
        borderRadius: isHero ? "var(--nx-panel-radius)" : 0,
        boxShadow: isHero ? "var(--nx-panel-elev-1)" : "none",
        overflow: isHero ? "hidden" : "visible",
      }}
    >
      {isHero && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: "-40% -10% auto auto",
            width: "min(360px, 50%)",
            aspectRatio: "1",
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--panel-accent, var(--primary)) 26%, transparent), transparent 60%)",
            filter: "blur(8px)",
            opacity: 0.55,
            pointerEvents: "none",
          }}
        />
      )}

      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 360px" }}>
          {eyebrow && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 10.5,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "var(--nx-panel-eyebrow-letter, 0.12em)",
                color: "var(--text-tertiary)",
                marginBottom: 10,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 14,
                  height: 1.5,
                  background: "currentColor",
                  borderRadius: 2,
                  opacity: 0.45,
                }}
              />
              {eyebrow}
            </div>
          )}
          <h1
            style={{
              fontFamily: "var(--nx-font-display, 'Space Grotesk', sans-serif)",
              fontSize: "clamp(1.55rem, 1.1rem + 1.4vw, 2.15rem)",
              fontWeight: 700,
              letterSpacing: "var(--nx-panel-title-letter, -0.02em)",
              margin: 0,
              lineHeight: 1.08,
              color: "var(--text-primary)",
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              style={{
                marginTop: 10,
                marginBottom: 0,
                fontSize: "0.95rem",
                color: "var(--text-secondary)",
                maxWidth: 760,
                lineHeight: 1.55,
              }}
            >
              {subtitle}
            </p>
          )}
          {meta && (
            <div
              style={{
                marginTop: 14,
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
              }}
            >
              {meta}
            </div>
          )}
        </div>

        {actions && (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexShrink: 0,
              alignItems: "center",
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
