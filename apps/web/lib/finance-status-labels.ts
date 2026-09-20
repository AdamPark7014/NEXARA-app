/** Etiquetas en español para enums de contabilidad (factura, proyecto, match 3-way, banco). */
export const FINANCE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  STAMPING: "Timbrando",
  SENT: "Enviada",
  PARTIALLY_PAID: "Pago parcial",
  PAID: "Pagada",
  OVERDUE: "Vencida",
  CANCELLED: "Cancelada",
  CREDITED: "Nota de crédito",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
  RECEIVED: "Recibida",
  ORDERED: "Ordenada",
  OPEN: "Abierta",
  CLOSED: "Cerrada",
  PENDING: "Pendiente",
  IN_PROGRESS: "En curso",
  ACTIVE: "Activo",
  ON_HOLD: "En pausa",
  COMPLETED: "Terminado",
  NOT_REQUIRED: "No requerida",
  MATCHED: "Conciliada",
  VARIANCE: "Diferencia",
  WAIVED: "Eximida",
  UNMATCHED: "Sin conciliar",
  ADJUSTED: "Ajustada",
  POSTED: "Contabilizada",
};

export function financeStatusLabel(status: string | null | undefined): string {
  const raw = (status ?? "").trim();
  if (!raw) return "—";
  const key = raw.toUpperCase();
  const known = FINANCE_STATUS_LABELS[key];
  if (known) return known;
  // Ya viene en español u otra etiqueta humana: no tocar.
  if (raw !== key) return raw;
  if (/^[A-Z][A-Z0-9_]*$/.test(key)) {
    return key
      .split("_")
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(" ");
  }
  return raw;
}