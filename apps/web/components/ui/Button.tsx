"use client";

import { ButtonHTMLAttributes, forwardRef, ReactNode } from "react";

/**
 * NEXARA · Button
 *
 * Cuatro niveles, y se distinguen de verdad:
 *
 *   primary   — la acción a la que vino la persona. **Una por pantalla.**
 *   secondary — superficie + borde de 1px. Todo lo demás que es un botón.
 *   ghost     — terciario: sin fondo ni borde hasta que lo tocas.
 *   danger    — destructivo. Mismo peso que primary, color de alarma.
 *
 * `accent` y `link` siguen existiendo por compatibilidad: `accent` es un
 * primario de otro módulo, `link` es texto que navega.
 *
 * Se fueron los degradados, el brillo interior y la sombra de color: el
 * relleno sólido ya dice «esto es el botón». Lo que queda de profundidad es
 * un borde de 1px y una sombra mínima, solo en los sólidos.
 *
 * Tamaños: sm (32/13 · el que fija .ai/DISENO-FINANZAS.md) · md · lg.
 */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent" | "link";
type Size = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
};

const SIZES: Record<Size, { height: number; padX: number; fontSize: number; radius: number; iconSize: number }> = {
  // 32/13, no 30/12: a 12px el texto de un botón se lee barato, y era parte
  // de por qué las pantallas se sentían poco serias. Es el tamaño que fija
  // .ai/DISENO-FINANZAS.md para todo lo que no es la acción principal.
  sm: { height: 32, padX: 12, fontSize: 13, radius: 8, iconSize: 15 },
  md: { height: 36, padX: 14, fontSize: 13, radius: 9, iconSize: 15 },
  lg: { height: 44, padX: 20, fontSize: 14, radius: 10, iconSize: 16 },
};

/**
 * Los sólidos se oscurecen contra `--nx-ink` (un token real, fijo en los dos
 * temas) en vez de pintarse con el color de marca tal cual: así el texto
 * blanco mantiene contraste también en oscuro, donde `--primary` aclara.
 */
const VARIANT_BASE: Record<Variant, React.CSSProperties> = {
  primary: {
    background: "color-mix(in srgb, var(--primary) 85%, var(--nx-ink))",
    color: "#fff",
    border: "1px solid color-mix(in srgb, var(--primary) 62%, var(--nx-ink))",
    boxShadow: "0 1px 2px rgba(8, 24, 38, 0.14)",
  },
  secondary: {
    background: "var(--surface)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
  },
  ghost: {
    background: "transparent",
    color: "var(--text-secondary)",
    // Borde transparente, no `none`: así queda a la misma altura que un
    // secondary cuando van uno al lado del otro.
    border: "1px solid transparent",
  },
  danger: {
    background: "color-mix(in srgb, var(--danger) 85%, var(--nx-ink))",
    color: "#fff",
    border: "1px solid color-mix(in srgb, var(--danger) 62%, var(--nx-ink))",
    boxShadow: "0 1px 2px rgba(8, 24, 38, 0.14)",
  },
  accent: {
    background: "color-mix(in srgb, var(--accent) 85%, var(--nx-ink))",
    color: "#fff",
    border: "1px solid color-mix(in srgb, var(--accent) 62%, var(--nx-ink))",
    boxShadow: "0 1px 2px rgba(8, 24, 38, 0.14)",
  },
  link: {
    background: "transparent",
    color: "var(--primary)",
    border: "1px solid transparent",
  },
};

const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = "secondary",
    size = "md",
    iconLeft,
    iconRight,
    loading,
    fullWidth,
    children,
    style,
    disabled,
    className,
    title,
    "aria-label": ariaLabel,
    ...rest
  },
  ref,
) {
  const s = SIZES[size];

  // Un botón que solo es un icono tiene que decir qué hace: al puntero con
  // tooltip nativo, al lector de pantalla con nombre accesible. Con dar uno
  // de los dos basta; el componente completa el otro.
  const iconOnly = !children && Boolean(iconLeft || iconRight);
  const resolvedLabel = ariaLabel ?? (iconOnly && typeof title === "string" ? title : undefined);
  const resolvedTitle = title ?? (iconOnly ? ariaLabel : undefined);

  return (
    <button
      ref={ref}
      type={rest.type || "button"}
      disabled={disabled || loading}
      aria-label={resolvedLabel}
      aria-busy={loading || undefined}
      title={resolvedTitle}
      className={["nx-btn", `nx-btn--${variant}`, className].filter(Boolean).join(" ")}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        height: s.height,
        padding: variant === "link" ? "0 2px" : `0 ${iconOnly ? Math.max(8, s.padX - 4) : s.padX}px`,
        fontSize: s.fontSize,
        borderRadius: variant === "link" ? 6 : s.radius,
        fontFamily: "var(--nx-font-ui, 'Inter Tight', 'Manrope', sans-serif)",
        fontWeight: 600,
        letterSpacing: "0.005em",
        whiteSpace: "nowrap",
        cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        width: fullWidth ? "100%" : undefined,
        // Corta y natural: no hay nada que celebrar al pasar el ratón.
        transition:
          "background 140ms var(--nx-ease-out, ease-out), border-color 140ms var(--nx-ease-out, ease-out), color 140ms var(--nx-ease-out, ease-out), transform 90ms var(--nx-ease-out, ease-out)",
        ...VARIANT_BASE[variant],
        ...style,
      }}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          style={{
            width: s.iconSize,
            height: s.iconSize,
            borderRadius: "50%",
            border: `2px solid ${variant === "primary" || variant === "danger" || variant === "accent" ? "rgba(255,255,255,0.55)" : "var(--border-strong)"}`,
            borderTopColor: "transparent",
            animation: "nx-spin 0.7s linear infinite",
          }}
        />
      )}
      {!loading && iconLeft && (
        <span aria-hidden="true" style={{ display: "inline-flex", fontSize: s.iconSize, lineHeight: 1 }}>
          {iconLeft}
        </span>
      )}
      {children && <span>{children}</span>}
      {!loading && iconRight && (
        <span aria-hidden="true" style={{ display: "inline-flex", fontSize: s.iconSize, lineHeight: 1, opacity: 0.85 }}>
          {iconRight}
        </span>
      )}

      <style jsx>{`
        @keyframes nx-spin {
          to {
            transform: rotate(360deg);
          }
        }

        /* El foco va en outline, no en box-shadow: los sólidos traen su propia
           sombra en línea y tapaban el anillo, así que con el teclado no se
           veía dónde estabas. */
        .nx-btn:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }
        .nx-btn--danger:focus-visible {
          outline-color: var(--danger);
        }
        .nx-btn--accent:focus-visible {
          outline-color: var(--accent);
        }
        .nx-btn--primary:focus-visible,
        .nx-btn--danger:focus-visible,
        .nx-btn--accent:focus-visible {
          /* Sobre relleno oscuro, el anillo necesita un hueco claro detrás. */
          box-shadow: 0 0 0 2px var(--surface) !important;
        }

        .nx-btn--primary:hover:not(:disabled) {
          background: color-mix(in srgb, var(--primary) 68%, var(--nx-ink)) !important;
        }
        .nx-btn--danger:hover:not(:disabled) {
          background: color-mix(in srgb, var(--danger) 68%, var(--nx-ink)) !important;
        }
        .nx-btn--accent:hover:not(:disabled) {
          background: color-mix(in srgb, var(--accent) 68%, var(--nx-ink)) !important;
        }
        /* En oscuro, --primary/--accent/--danger se aclaran (están pensados
           para texto sobre fondo oscuro): con texto blanco encima el contraste
           caía a ~2.5:1. Aquí se oscurecen más para volver a pasar AA. */
        :global(body.dark) .nx-btn--primary {
          background: color-mix(in srgb, var(--primary) 65%, var(--nx-ink)) !important;
        }
        :global(body.dark) .nx-btn--danger {
          background: color-mix(in srgb, var(--danger) 65%, var(--nx-ink)) !important;
        }
        :global(body.dark) .nx-btn--accent {
          background: color-mix(in srgb, var(--accent) 65%, var(--nx-ink)) !important;
        }
        :global(body.dark) .nx-btn--primary:hover:not(:disabled) {
          background: color-mix(in srgb, var(--primary) 50%, var(--nx-ink)) !important;
        }
        :global(body.dark) .nx-btn--danger:hover:not(:disabled) {
          background: color-mix(in srgb, var(--danger) 50%, var(--nx-ink)) !important;
        }
        :global(body.dark) .nx-btn--accent:hover:not(:disabled) {
          background: color-mix(in srgb, var(--accent) 50%, var(--nx-ink)) !important;
        }

        .nx-btn--secondary:hover:not(:disabled) {
          background: var(--surface-2) !important;
          border-color: var(--border-strong) !important;
        }
        .nx-btn--ghost:hover:not(:disabled) {
          background: color-mix(in srgb, var(--text-primary) 7%, transparent) !important;
          color: var(--text-primary) !important;
        }
        .nx-btn--link:hover:not(:disabled) {
          color: var(--primary-hover) !important;
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        /* Pulsado: un píxel. Se siente, no se ve. */
        .nx-btn:active:not(:disabled) {
          transform: translateY(1px);
        }

        @media (prefers-reduced-motion: reduce) {
          .nx-btn {
            transition: none !important;
          }
          .nx-btn:active:not(:disabled) {
            transform: none;
          }
        }
      `}</style>
    </button>
  );
});

export default Button;
