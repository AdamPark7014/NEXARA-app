"use client";

import type { CSSProperties, ReactNode } from "react";
import { Alert } from "@/components/base/estados";

/**
 * NEXARA · InlineAlert (envoltorio de `components/base/estados` Alert)
 *
 * Cuatro niveles, cada uno con su forma (aspa, triángulo, «i», palomita) para
 * quien no distingue rojo de ámbar. El dibujo es el del aviso base: fondo tenue
 * del tono, borde fino y radio 12.
 *
 * API compatible: `message`, `variant`, `onDismiss`, `action`, `style`.
 * Añadidos opcionales: `title`, `icon`, `dense`, `className`.
 */

type Variant = "danger" | "warning" | "info" | "success";

const NIVEL: Record<Variant, { label: string; live: "assertive" | "polite" }> = {
  danger: { label: "Error", live: "assertive" },
  warning: { label: "Aviso", live: "assertive" },
  info: { label: "Información", live: "polite" },
  success: { label: "Listo", live: "polite" },
};

export default function InlineAlert({
  message,
  variant = "danger",
  onDismiss,
  style,
  action,
  title,
  icon,
  dense = false,
  className,
}: {
  message: string;
  variant?: Variant;
  onDismiss?: () => void;
  style?: CSSProperties;
  /**
   * La salida del error, dentro del aviso. Sin esto, «Reintentar» quedaba de
   * hermano suelto debajo de la caja roja y no se leía como la respuesta a lo
   * que acababa de fallar.
   */
  action?: ReactNode;
  /** Titular corto encima del mensaje. Solo cuando el mensaje es largo. */
  title?: ReactNode;
  /** Sustituye el icono del nivel. */
  icon?: ReactNode;
  /** Aún más plano: para avisos repetidos dentro de una lista o una fila. */
  dense?: boolean;
  className?: string;
}) {
  const nivel = NIVEL[variant] ?? NIVEL.danger;
  return (
    // role="alert" en los cuatro niveles: hay pantallas que lo buscan así.
    // Quien decide si interrumpe o no es aria-live.
    <Alert
      tone={variant}
      role="alert"
      ariaLive={nivel.live}
      srLabel={nivel.label}
      title={title}
      icon={icon ?? undefined}
      action={action}
      onDismiss={onDismiss}
      dense={dense}
      className={["nx-alert", `nx-alert--${variant}`, className].filter(Boolean).join(" ")}
      style={style}
    >
      {message}
    </Alert>
  );
}
