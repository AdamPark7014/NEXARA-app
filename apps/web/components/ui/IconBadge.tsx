"use client";

import type { CSSProperties, ReactNode } from "react";
import type { SvgIconComponent } from "@mui/icons-material";

/**
 * Iconos Core (NEXARA): sustituyen a los emojis.
 *
 * - `IconBadge`: icono dentro de un cuadrado redondeado (o círculo) con fondo suave.
 *   Para encabezados, tarjetas de tipo y estados vacíos.
 * - `IconLabel`: icono + texto en línea (chips, botones, metadatos).
 *
 * Los iconos se importan uno por uno (`@mui/icons-material/Nombre`) en quien los usa,
 * para no arrastrar el paquete completo. Siempre decorativos: `aria-hidden`.
 */

export const CORE_BLUE = "#2563EB";

type IconBadgeProps = {
  icon: SvgIconComponent;
  /** Color del icono; el fondo es el mismo color al 12 %. */
  color?: string;
  /** Lado del contenedor en px. */
  size?: number;
  /** Tamaño del glifo en px (por defecto ~55 % del contenedor). */
  iconSize?: number;
  shape?: "rounded" | "circle";
  style?: CSSProperties;
};

export function IconBadge({
  icon: Icon,
  color = `var(--primary, ${CORE_BLUE})`,
  size = 36,
  iconSize,
  shape = "rounded",
  style,
}: IconBadgeProps) {
  const glyph = iconSize ?? Math.round(size * 0.55);
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "0 0 auto",
        width: size,
        height: size,
        borderRadius: shape === "circle" ? "50%" : Math.round(size * 0.3),
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        color,
        ...style,
      }}
    >
      <Icon aria-hidden="true" sx={{ fontSize: glyph }} />
    </span>
  );
}

type IconLabelProps = {
  icon: SvgIconComponent;
  children?: ReactNode;
  /** Tamaño del glifo en px (16–20 en línea, 18 en chips). */
  size?: number;
  gap?: number;
  /** Color solo del icono (el texto hereda). */
  iconColor?: string;
  style?: CSSProperties;
};

export function IconLabel({ icon: Icon, children, size = 16, gap = 6, iconColor, style }: IconLabelProps) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap, verticalAlign: "middle", ...style }}>
      <Icon aria-hidden="true" sx={{ fontSize: size, flex: "0 0 auto", ...(iconColor ? { color: iconColor } : {}) }} />
      {children != null && children !== false ? <span>{children}</span> : null}
    </span>
  );
}

export default IconBadge;
