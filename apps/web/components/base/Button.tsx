"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import s from "./base.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost";

const VARIANTE: Record<ButtonVariant, string> = {
  primary: s.btnPrimary,
  secondary: s.btnSecondary,
  ghost: s.btnGhost,
};

/** Clases del botón, para cuando el elemento no es <button> ni <Link>. */
export function buttonClass(variant: ButtonVariant = "secondary", opts: { size?: "md" | "lg"; icon?: boolean } = {}) {
  return [s.btn, VARIANTE[variant], opts.size === "lg" ? s.btnLg : "", opts.icon ? s.btnIcon : ""].filter(Boolean).join(" ");
}

/** Botón de 32 px (36 px en `lg`): primario teal, secundario con borde o fantasma. */
export function Button({
  variant = "secondary",
  size = "md",
  icon = false,
  className,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "md" | "lg"; icon?: boolean }) {
  return <button type={type} className={[buttonClass(variant, { size, icon }), className].filter(Boolean).join(" ")} {...rest} />;
}

/** El mismo botón, pero navega (next/link). */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: "md" | "lg" }) {
  return <Link className={[buttonClass(variant, { size }), className].filter(Boolean).join(" ")} {...rest} />;
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
