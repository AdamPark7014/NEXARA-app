"use client";

import type { CSSProperties, ReactNode } from "react";
import { EmptyState as BaseEmptyState, type EmptyStateTone as BaseTone } from "@/components/base/estados";

/**
 * NEXARA · EmptyState (envoltorio de `components/base/estados` EmptyState)
 *
 * Icono → título → una línea → acción. Misma API de siempre; el dibujo es el del
 * vacío base: el icono va en una pastilla de color y el bloque cae igual de bien
 * dentro de una tabla vacía (`compact`) que en una pantalla entera (`page`).
 */

type Variant = "default" | "compact" | "page";

/** Color del icono según el motivo del vacío. `neutral` = el de marca (por defecto). */
export type EmptyStateTone = "neutral" | "brand" | "info" | "success" | "warning" | "danger";

const TONO: Record<EmptyStateTone, BaseTone> = {
  neutral: "brand",
  brand: "brand",
  info: "info",
  success: "success",
  warning: "warning",
  danger: "danger",
};

function DefaultIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <rect x="3.2" y="5.2" width="17.6" height="13.6" rx="2.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7.4 11.6h9.2M7.4 14.8h5.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

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
  return (
    <BaseEmptyState
      icon={icon ?? <DefaultIcon />}
      title={title}
      description={description}
      action={action}
      secondaryAction={secondaryAction}
      tone={TONO[tone] ?? "brand"}
      size={variant === "compact" || variant === "page" ? variant : "default"}
      titleAs="h3"
      className={className}
      style={style}
    />
  );
}
