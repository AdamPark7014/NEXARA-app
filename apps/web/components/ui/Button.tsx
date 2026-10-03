"use client";

import { ButtonHTMLAttributes, forwardRef, ReactNode } from "react";
import { Button as BaseButton, type ButtonSize, type ButtonVariant } from "@/components/base/Button";

/**
 * NEXARA · Button (envoltorio de `components/base/Button`)
 *
 * Conserva la API de siempre y la traduce al botón base, así las pantallas que
 * importan este archivo heredan el sistema visual v2 sin tocarse:
 *
 *   primary   → primary   (la acción a la que vino la persona; una por pantalla)
 *   secondary → secondary
 *   ghost     → ghost     (terciario)
 *   danger    → danger
 *   accent    → primary   (era «el primario de otro módulo»)
 *   link      → link      (texto que actúa)
 *
 * Tamaños: xs y sm → 32 px (compacto) · md → 36 px · lg → 44 px.
 * Las clases `nx-btn`, `nx-btn--{variante}` y `nx-btn--{tamaño}` se conservan.
 */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent" | "link";
type Size = "xs" | "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
};

const VARIANTE: Record<Variant, ButtonVariant> = {
  primary: "primary",
  secondary: "secondary",
  ghost: "ghost",
  danger: "danger",
  accent: "primary",
  link: "link",
};

const TAMANO: Record<Size, ButtonSize> = {
  xs: "sm",
  sm: "sm",
  md: "md",
  lg: "lg",
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
    className,
    title,
    "aria-label": ariaLabel,
    ...rest
  },
  ref,
) {
  // Un botón que solo es un icono tiene que decir qué hace: al puntero con
  // tooltip nativo, al lector de pantalla con nombre accesible. Con dar uno
  // de los dos basta; el componente completa el otro.
  const iconOnly = !children && Boolean(iconLeft || iconRight);
  const resolvedLabel = ariaLabel ?? (iconOnly && typeof title === "string" ? title : undefined);
  const resolvedTitle = title ?? (iconOnly ? ariaLabel : undefined);

  return (
    <BaseButton
      ref={ref}
      {...rest}
      type={rest.type || "button"}
      variant={VARIANTE[variant] ?? "secondary"}
      size={TAMANO[size] ?? "md"}
      icon={iconOnly && !(iconLeft && iconRight)}
      loading={Boolean(loading)}
      iconStart={iconLeft}
      iconEnd={iconRight}
      fullWidth={fullWidth}
      aria-label={resolvedLabel}
      title={resolvedTitle}
      className={["nx-btn", `nx-btn--${variant}`, `nx-btn--${size}`, className].filter(Boolean).join(" ")}
    >
      {children && <span>{children}</span>}
    </BaseButton>
  );
});

export default Button;
