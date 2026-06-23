"use client";

import { ButtonHTMLAttributes, forwardRef, ReactNode } from "react";

/**
 * NEXARA · Button (premium)
 * Variantes: primary · secondary · ghost · danger · accent · link
 * Tamaños: sm · md · lg
 * Microinteracciones: shimmer en primary, hover lift sutil, focus ring.
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
  sm: { height: 30, padX: 11, fontSize: 12, radius: 8, iconSize: 14 },
  md: { height: 36, padX: 14, fontSize: 13, radius: 10, iconSize: 15 },
  lg: { height: 44, padX: 20, fontSize: 14, radius: 12, iconSize: 16 },
};

const VARIANT_BASE: Record<Variant, React.CSSProperties> = {
  primary: {
    background:
      "linear-gradient(180deg, color-mix(in srgb, var(--primary) 90%, white) 0%, var(--primary) 60%, var(--primary-strong) 100%)",
    color: "#fff",
    border: "1px solid color-mix(in srgb, var(--primary-strong) 70%, transparent)",
    boxShadow:
      "0 1px 0 rgba(255,255,255,0.18) inset, 0 -1px 0 rgba(0,0,0,0.10) inset, 0 6px 14px color-mix(in srgb, var(--primary) 32%, transparent)",
  },
  secondary: {
    background: "var(--surface)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
    boxShadow: "0 1px 2px rgba(8,24,38,0.04)",
  },
  ghost: {
    background: "transparent",
    color: "var(--text-secondary)",
    border: "1px solid transparent",
  },
  danger: {
    background:
      "linear-gradient(180deg, color-mix(in srgb, var(--danger) 88%, white) 0%, var(--danger) 100%)",
    color: "#fff",
    border: "1px solid color-mix(in srgb, var(--danger) 80%, black)",
    boxShadow:
      "0 1px 0 rgba(255,255,255,0.15) inset, 0 6px 14px color-mix(in srgb, var(--danger) 30%, transparent)",
  },
  accent: {
    background:
      "linear-gradient(180deg, color-mix(in srgb, var(--accent) 92%, white) 0%, var(--accent) 100%)",
    color: "#fff",
    border: "1px solid color-mix(in srgb, var(--accent-strong) 70%, transparent)",
    boxShadow:
      "0 1px 0 rgba(255,255,255,0.18) inset, 0 6px 14px color-mix(in srgb, var(--accent) 32%, transparent)",
  },
  link: {
    background: "transparent",
    color: "var(--primary)",
    border: "1px solid transparent",
    padding: "0 4px",
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
    ...rest
  },
  ref,
) {
  const s = SIZES[size];

  return (
    <button
      ref={ref}
      type={rest.type || "button"}
      disabled={disabled || loading}
      className={["nx-btn", `nx-btn--${variant}`, className].filter(Boolean).join(" ")}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        height: s.height,
        padding: variant === "link" ? "0 2px" : `0 ${s.padX}px`,
        fontSize: s.fontSize,
        borderRadius: variant === "link" ? 6 : s.radius,
        fontFamily: "var(--nx-font-ui, 'Inter Tight', 'Manrope', sans-serif)",
        fontWeight: 600,
        letterSpacing: "0.005em",
        whiteSpace: "nowrap",
        cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        width: fullWidth ? "100%" : undefined,
        transition:
          "transform 140ms var(--nx-ease-out), box-shadow 200ms var(--nx-ease-out), background 200ms var(--nx-ease-out), border-color 200ms var(--nx-ease-out), color 160ms var(--nx-ease-out)",
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
      {children && <span style={{ textDecoration: variant === "link" ? "none" : undefined }}>{children}</span>}
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
        .nx-btn:hover:not(:disabled) {
          transform: translateY(-1px);
        }
        .nx-btn--primary:hover:not(:disabled),
        .nx-btn--danger:hover:not(:disabled),
        .nx-btn--accent:hover:not(:disabled) {
          filter: brightness(1.04) saturate(1.05);
        }
        .nx-btn--secondary:hover:not(:disabled) {
          background: var(--surface-2) !important;
          border-color: color-mix(in srgb, var(--primary) 35%, var(--border)) !important;
        }
        .nx-btn--ghost:hover:not(:disabled) {
          background: color-mix(in srgb, var(--primary) 8%, transparent) !important;
          color: var(--text-primary) !important;
        }
        .nx-btn--link:hover:not(:disabled) {
          color: var(--primary-strong) !important;
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .nx-btn:active:not(:disabled) {
          transform: translateY(0) scale(0.985);
        }
        .nx-btn:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 30%, transparent),
            var(--nx-panel-elev-1, 0 6px 14px rgba(0, 0, 0, 0.08));
        }
        .nx-btn--danger:focus-visible {
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger) 28%, transparent);
        }
      `}</style>
    </button>
  );
});

export default Button;
