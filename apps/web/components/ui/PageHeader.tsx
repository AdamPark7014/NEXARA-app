"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * NEXARA · PageHeader
 *
 * Jerarquía: eyebrow → título → subtítulo → meta · acciones.
 *
 * `hero` era una tarjeta translúcida con borde, sombra y un resplandor
 * radial detrás del título. Ahora `hero` significa **más aire y más
 * tamaño**, que es lo que de verdad lo hacía importante; la caja, el
 * degradado y el glow se fueron. Ningún variante dibuja un rectángulo.
 *
 * Variantes: default · hero (portada de módulo) — densidad: default · ops.
 */

type Variant = "default" | "hero";
type Density = "default" | "ops";

export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  meta,
  variant = "default",
  density = "default",
  className,
  style,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Píldoras/badges extra debajo del subtítulo (status, sla, dueño…). */
  meta?: ReactNode;
  variant?: Variant;
  /** ops = título compacto, subtítulo corto, menos aire (ERP/OPS). */
  density?: Density;
  className?: string;
  style?: CSSProperties;
}) {
  const isHero = variant === "hero";
  const isOps = density === "ops";

  const titleSize = isHero
    ? "clamp(1.7rem, 1.2rem + 1.6vw, 2.4rem)"
    : isOps
      ? "clamp(1.2rem, 1rem + 0.7vw, 1.55rem)"
      : "clamp(1.5rem, 1.1rem + 1.3vw, 2rem)";

  return (
    <header
      className={className}
      style={{
        // El aire es lo único que separa la cabecera del contenido.
        marginBottom: isHero ? 32 : isOps ? 12 : 20,
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          // Las acciones se alinean con el título, no con el final del
          // subtítulo: así la fila superior se lee de un golpe.
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: isOps ? 14 : 16,
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
                fontSize: isOps ? 10 : 10.5,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "var(--nx-panel-eyebrow-letter, 0.12em)",
                color: "var(--text-tertiary)",
                marginBottom: isOps ? 4 : 6,
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
              fontSize: titleSize,
              fontWeight: 700,
              letterSpacing: "var(--nx-panel-title-letter, -0.02em)",
              margin: 0,
              lineHeight: 1.1,
              color: "var(--text-primary)",
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              style={{
                marginTop: isOps ? 4 : 6,
                marginBottom: 0,
                fontSize: isOps ? "0.8125rem" : "0.9rem",
                color: "var(--text-secondary)",
                // Una línea que se lee, no un párrafo que se salta.
                maxWidth: isOps ? 640 : 720,
                lineHeight: 1.45,
              }}
            >
              {subtitle}
            </p>
          )}
          {meta && (
            <div
              style={{
                marginTop: isOps ? 8 : 12,
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
              // Compensa la diferencia de línea base contra el título grande.
              marginTop: isHero ? 6 : 2,
            }}
          >
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
