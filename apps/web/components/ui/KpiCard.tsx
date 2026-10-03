"use client";

import { ReactNode } from "react";
import { Stat } from "@/components/base/piezas";
import type { Tone } from "@/components/base/piezas";

/**
 * NEXARA · KpiCard (envoltorio de `components/base/piezas` Stat)
 *
 * Misma API de siempre, dibujada como la cifra base: tarjeta de radio 16 con
 * icono en pastilla de color (según `variant`), número de 28 px, tendencia
 * direccional, barritas de la serie (`sparkline`) y pie opcional.
 * Clicable = `role="button"` con teclado; `selected` marca la que filtra.
 */

export type KpiVariant = "default" | "neutral" | "positive" | "warning" | "danger" | "accent";

type Trend = { value: string; direction: "up" | "down" | "flat" };

const ICONO: Record<KpiVariant, Tone> = {
  default: "brand",
  neutral: "neutral",
  positive: "success",
  warning: "warning",
  danger: "danger",
  accent: "info",
};

export default function KpiCard({
  label,
  value,
  hint,
  icon,
  variant = "default",
  trend,
  sparkline,
  footer,
  onClick,
  loading = false,
  selected = false,
  ariaLabel,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  variant?: KpiVariant;
  trend?: Trend;
  sparkline?: number[];
  footer?: ReactNode;
  onClick?: () => void;
  /** Mientras llega la cifra: bloque esqueleto en lugar del valor. */
  loading?: boolean;
  /** Tarjeta usada como filtro: marca la que está activa. */
  selected?: boolean;
  /** Nombre accesible cuando la tarjeta es clicable y el texto visible no basta. */
  ariaLabel?: string;
}) {
  const interactive = Boolean(onClick);
  return (
    <Stat
      as="article"
      className="nx-kpi"
      label={label}
      value={value}
      hint={hint}
      icon={icon}
      iconTone={ICONO[variant] ?? "brand"}
      trend={trend ? { value: trend.value, direction: trend.direction } : undefined}
      spark={loading ? undefined : sparkline}
      footer={footer}
      onClick={onClick}
      pressed={interactive && selected ? true : undefined}
      loading={loading}
      ariaLabel={interactive ? ariaLabel : undefined}
    />
  );
}
