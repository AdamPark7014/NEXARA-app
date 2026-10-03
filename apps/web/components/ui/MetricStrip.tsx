"use client";

import { ReactNode } from "react";
import { Stat, StatRow } from "@/components/base/piezas";

/**
 * NEXARA · Tira de cifras (envoltorio de `components/base/piezas` StatRow + Stat).
 *
 * Para las pantallas financieras: una sola tarjeta con divisiones finas y cifras
 * compactas (20 px). El dato manda, el adorno desaparece, y la tira entera ocupa
 * lo que antes una sola tarjeta de KPI.
 *
 * El color solo entra cuando pide acción (`tone`), nunca como decoración: si
 * todo va bien, la tira es neutra y la vista se lee sin ruido.
 */

export type MetricTone = "default" | "warning" | "danger" | "success";

export type Metric = {
  /** Qué es la cifra. Frase corta, en minúsculas. */
  label: ReactNode;
  /** El número ya formateado (moneda, conteo, porcentaje). */
  value: ReactNode;
  /** De qué se compone, o qué implica. Ej. «7 gastos», «bloquean el cierre». */
  hint?: ReactNode;
  tone?: MetricTone;
  /** Si se pasa, la celda es un botón: filtra la vista en el sitio. */
  onClick?: () => void;
  /**
   * Si la celda LLEVA a otra pantalla, usa esto en vez de `onClick`: navegar
   * con un manejador rompe ctrl+clic y «abrir en pestaña nueva», que es justo
   * lo que hace una contadora cuando quiere revisar dos cosas a la vez.
   */
  href?: string;
};

export default function MetricStrip({
  metrics,
  ariaLabel = "Resumen del periodo",
}: {
  metrics: Metric[];
  ariaLabel?: string;
}) {
  if (metrics.length === 0) return null;

  return (
    <StatRow variant="strip" ariaLabel={ariaLabel}>
      {metrics.map((m, i) => (
        <Stat
          key={i}
          density="compact"
          label={m.label}
          value={m.value}
          hint={m.hint}
          tone={m.tone ?? "default"}
          href={m.href}
          onClick={m.href ? undefined : m.onClick}
        />
      ))}
    </StatRow>
  );
}
