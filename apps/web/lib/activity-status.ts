/** Normaliza estatus de OT para contadores y botones de campo. */
export function isActivityCompleted(status?: string | null): boolean {
  if (!status) return false;
  return /finaliz|completada|approved|aprobada/i.test(status);
}

export function isActivityInProgress(status?: string | null): boolean {
  if (!status || isActivityCompleted(status)) return false;
  return /proceso|curso|en_curso/i.test(status);
}

export function activityStatusVariant(status?: string | null): "positive" | "warning" | "default" {
  if (isActivityCompleted(status)) return "positive";
  if (isActivityInProgress(status)) return "warning";
  return "default";
}
