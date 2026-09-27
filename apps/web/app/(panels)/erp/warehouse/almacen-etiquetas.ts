/**
 * Textos y tonos del almacén: un solo lugar para que la tabla, el historial
 * y las exportaciones digan lo mismo.
 */

export type VarianteTag = "default" | "positive" | "warning" | "danger" | "accent" | "neutral";

export const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  RECEIPT: "Entrada",
  DISPATCH: "Salida",
  TRANSFER: "Traspaso",
  ADJUSTMENT: "Ajuste",
  RETURN: "Devolución",
  SCRAP: "Merma",
  PRODUCTION_IN: "Entrada de producción",
  PRODUCTION_OUT: "Salida a producción",
};

export const CYCLE_COUNT_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Programado",
  IN_PROGRESS: "En captura",
  CLOSED: "Cerrado",
  CANCELLED: "Cancelado",
};

export const RESERVATION_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Activa",
  CONSUMED: "Consumida",
  RELEASED: "Liberada",
};

export function etiquetaMovimiento(tipo: string): string {
  return MOVEMENT_TYPE_LABEL[tipo] ?? "Movimiento";
}

export function varianteMovimiento(tipo: string): VarianteTag {
  if (tipo === "RECEIPT" || tipo === "PRODUCTION_IN" || tipo === "RETURN" || tipo === "ADJUSTMENT") return "positive";
  if (tipo === "SCRAP") return "danger";
  return "default";
}

export function varianteConteo(status: string): VarianteTag {
  if (status === "CLOSED") return "positive";
  if (status === "IN_PROGRESS") return "warning";
  if (status === "CANCELLED") return "default";
  return "neutral";
}

export type NivelStock = "agotado" | "bajo" | "ok";

/** Nivel de existencia contra el mínimo: la misma regla que ya usaban los KPIs. */
export function nivelStock(existencia: number, minimo: number): NivelStock {
  if (existencia === 0) return "agotado";
  if (existencia < minimo) return "bajo";
  return "ok";
}

export const NIVEL_STOCK: Record<NivelStock, { texto: string; variante: VarianteTag; color: string }> = {
  agotado: { texto: "Agotado", variante: "danger", color: "var(--danger)" },
  bajo: { texto: "Bajo mínimo", variante: "warning", color: "var(--warning)" },
  ok: { texto: "Suficiente", variante: "positive", color: "var(--success)" },
};

/** Días que faltan para caducar (negativo = ya caducó). */
export function diasParaCaducar(fecha: string | null | undefined, ahora = Date.now()): number | null {
  if (!fecha) return null;
  const t = new Date(fecha).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((t - ahora) / 86400000);
}
