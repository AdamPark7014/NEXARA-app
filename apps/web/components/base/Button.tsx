"use client";

import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from "react";
import s from "./base.module.css";

/**
 * Jerarquía (v2): primary · secondary · tonal · tertiary · danger · danger-ghost.
 * `ghost` es el terciario apagado (iconos de barra, acciones de fila); `link` es
 * texto que actúa, para envoltorios viejos. Un solo `primary` por pantalla.
 */
export type ButtonVariant = "primary" | "secondary" | "tonal" | "tertiary" | "ghost" | "danger" | "danger-ghost" | "link";

/** sm 32 px (compacto, tablas) · md 36 px (por defecto) · lg 44 px (grande y táctil). */
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTE: Record<ButtonVariant, string> = {
  primary: s.btnPrimary,
  secondary: s.btnSecondary,
  tonal: s.btnTonal,
  tertiary: s.btnTertiary,
  ghost: s.btnGhost,
  danger: s.btnDanger,
  "danger-ghost": s.btnDangerGhost,
  link: s.btnLink,
};

const TAMANO: Record<ButtonSize, string> = {
  sm: s.btnSm,
  md: "",
  lg: s.btnLg,
};

/** Clases del botón, para cuando el elemento no es <button> ni <Link>. */
export function buttonClass(
  variant: ButtonVariant = "secondary",
  opts: { size?: ButtonSize; icon?: boolean; fullWidth?: boolean } = {},
) {
  return [s.btn, VARIANTE[variant] ?? VARIANTE.secondary, TAMANO[opts.size ?? "md"], opts.icon ? s.btnIcon : "", opts.fullWidth ? s.btnFull : ""]
    .filter(Boolean)
    .join(" ");
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Botón cuadrado de solo icono (lleva `aria-label`). */
  icon?: boolean;
  /** Muestra el giro, bloquea el botón y anuncia `aria-busy`; el texto se queda. */
  loading?: boolean;
  /** Icono antes del texto (se oculta mientras `loading`). */
  iconStart?: ReactNode;
  /** Icono después del texto (chevron, flecha). */
  iconEnd?: ReactNode;
  /** Atajo de teclado al final («N», «Ctrl ↵»). Decorativo: no entra al nombre accesible. */
  kbd?: ReactNode;
  fullWidth?: boolean;
};

/** Botón del sistema: 36 px por defecto, peso 600, foco con anillo de marca. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    icon = false,
    loading = false,
    iconStart,
    iconEnd,
    kbd,
    fullWidth = false,
    className,
    type = "button",
    disabled,
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-loading={loading ? "true" : undefined}
      className={[buttonClass(variant, { size, icon, fullWidth }), className].filter(Boolean).join(" ")}
      {...rest}
    >
      {loading ? (
        <span className={s.spin} aria-hidden="true" />
      ) : iconStart ? (
        <span className={s.btnIco} aria-hidden="true">
          {iconStart}
        </span>
      ) : null}
      {children}
      {!loading && iconEnd ? (
        <span className={[s.btnIco, s.btnIcoEnd].join(" ")} aria-hidden="true">
          {iconEnd}
        </span>
      ) : null}
      {kbd != null && kbd !== false ? <Kbd>{kbd}</Kbd> : null}
    </button>
  );
});

/** El mismo botón, pero navega (next/link). */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  icon = false,
  iconStart,
  iconEnd,
  kbd,
  fullWidth = false,
  className,
  children,
  ...rest
}: ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: boolean;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
  kbd?: ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <Link className={[buttonClass(variant, { size, icon, fullWidth }), className].filter(Boolean).join(" ")} {...rest}>
      {iconStart ? (
        <span className={s.btnIco} aria-hidden="true">
          {iconStart}
        </span>
      ) : null}
      {children}
      {iconEnd ? (
        <span className={[s.btnIco, s.btnIcoEnd].join(" ")} aria-hidden="true">
          {iconEnd}
        </span>
      ) : null}
      {kbd != null && kbd !== false ? <Kbd>{kbd}</Kbd> : null}
    </Link>
  );
}

/** Atajo de teclado dentro de un botón («N», «/»). */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className={s.kbd} aria-hidden="true">
      {children}
    </kbd>
  );
}

/** Enlace que es botón (acciones de texto dentro de avisos o pies de tabla). */
export function LinkButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={[s.linkBtn, props.className].filter(Boolean).join(" ")} />;
}
