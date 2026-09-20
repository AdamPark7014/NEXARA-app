"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * NEXARA · Section
 *
 * Bloque de sección: eyebrow → título → subtítulo · acciones · cuerpo · pie.
 *
 * Antes cada sección era una tarjeta: borde, radio, sombra, cabecera con
 * degradado y **dos** líneas divisorias. Apiladas, la pantalla eran cajas
 * dentro de cajas. Ahora la separación la dan el aire y la tipografía:
 *
 *   default → sin caja. Ni borde, ni fondo, ni sombra.
 *   muted   → superficie propia (fondo + radio). El fondo ya delimita; no
 *             lleva borde encima.
 *   accent  → una regla de 2px a la izquierda. Una línea, no un marco.
 *
 * `flush` y `dense` siguen significando lo mismo; en `default` el cuerpo ya
 * va a ras, así que `flush` no cambia nada y no rompe a quien lo pasaba.
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
  className,
  style,
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
  /** Antes había que envolver la sección en un div solo para esto. */
  className?: string;
  style?: CSSProperties;
}) {
  // Solo `muted` es de verdad una superficie; el resto vive sobre la página.
  const surfaced = tone === "muted";
  const accented = tone === "accent";

  const padX = dense ? 14 : 16;
  const padY = dense ? 12 : 14;

  const hasHeader = Boolean(title || actions || eyebrow || subtitle);
  const headerGap = dense ? 10 : 14;

  return (
    <section
      className={className}
      style={{
        marginBottom: dense ? 16 : 24,
        background: surfaced ? "color-mix(in srgb, var(--surface-2) 60%, var(--surface))" : undefined,
        borderRadius: surfaced ? "var(--nx-panel-radius-sm, 12px)" : undefined,
        // Una regla, no un marco.
        borderLeft: accented ? "2px solid var(--panel-accent, var(--primary))" : undefined,
        paddingLeft: accented ? 14 : undefined,
        ...style,
      }}
    >
      {hasHeader && (
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
            // Sin línea divisoria ni degradado: el espacio separa la cabecera
            // del cuerpo mejor que un borde que además dibuja otro rectángulo.
            marginBottom: headerGap,
            padding: surfaced ? `${padY}px ${padX}px 0` : undefined,
          }}
        >
          <div style={{ minWidth: 200, flex: "1 1 240px", maxWidth: "100%" }}>
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
                  fontWeight: 650,
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
                  marginTop: 3,
                  lineHeight: 1.45,
                  maxWidth: 560,
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
          {actions && (
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "flex-end",
                minWidth: 0,
              }}
            >
              {actions}
            </div>
          )}
        </header>
      )}

      {/* Sin tarjeta, un padding interior solo desalinea el cuerpo del título.
          Con superficie (`muted`), el aire va aquí — salvo que `flush` pida el
          cuerpo a ras, que es lo que quiere una tabla dentro de la sección. */}
      <div
        style={
          surfaced
            ? { padding: flush ? 0 : `0 ${padX}px`, paddingBottom: flush || footer ? 0 : padY }
            : undefined
        }
      >
        {children}
      </div>

      {footer && (
        <footer
          style={{
            marginTop: dense ? 10 : 14,
            padding: surfaced ? `0 ${padX}px ${padY}px` : undefined,
            fontSize: 12,
            color: "var(--text-tertiary)",
            lineHeight: 1.45,
          }}
        >
          {footer}
        </footer>
      )}
    </section>
  );
}
