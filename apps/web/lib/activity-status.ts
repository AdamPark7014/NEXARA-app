import type { ActivityEvidenceSummary } from "./evidence-lock";
import { isEvidenceApproved, isEvidenceLocked, isEvidenceSubmitted } from "./evidence-lock";

/** Normaliza estatus de OT para contadores y botones de campo. */
export function isActivityCompleted(status?: string | null): boolean {
  if (!status) return false;
  return /finaliz|completada|approved|aprobada/i.test(status);
}

export function isActivityInProgress(status?: string | null): boolean {
  if (!status || isActivityCompleted(status)) return false;
  return /proceso|curso|en_curso/i.test(status);
}

export function isSameCalendarDay(
  value?: string | Date | null,
  reference: Date = new Date(),
): boolean {
  if (!value) return false;
  return new Date(value).toDateString() === reference.toDateString();
}

/** Campo terminó (evidencias enviadas o OT cerrada administrativamente). */
export function isActivityFieldWorkDone(
  estatus?: string | null,
  ev?: ActivityEvidenceSummary | null,
): boolean {
  if (isActivityCompleted(estatus)) return true;
  return isEvidenceSubmitted(ev) || isEvidenceApproved(ev);
}

export function isActivityAwaitingReview(ev?: ActivityEvidenceSummary | null): boolean {
  return isEvidenceLocked(ev);
}

export function activityDisplayLabel(
  estatus?: string | null,
  ev?: ActivityEvidenceSummary | null,
): string {
  if (isEvidenceApproved(ev)) return "Aprobada";
  if (isActivityAwaitingReview(ev)) return "En revisión";
  if (ev?.reviewStatus === "REJECTED") return "Rechazada";
  return estatus || "Pendiente";
}

export function activityStatusVariant(status?: string | null): "positive" | "warning" | "default" {
  if (isActivityCompleted(status)) return "positive";
  if (isActivityInProgress(status)) return "warning";
  return "default";
}

export function activityDisplayVariant(
  estatus?: string | null,
  ev?: ActivityEvidenceSummary | null,
): "positive" | "warning" | "default" {
  if (isEvidenceApproved(ev) || isActivityCompleted(estatus)) return "positive";
  if (isActivityAwaitingReview(ev)) return "warning";
  if (ev?.reviewStatus === "REJECTED") return "warning";
  if (isActivityInProgress(estatus)) return "warning";
  return "default";
}

export function isActivityRelevantToday(
  activity: {
    fechaEntregaEsperada?: string | null;
    fechaInicio?: string | null;
    fechaFinalizacion?: string | null;
    estatus?: string | null;
    activityEvidence?: (ActivityEvidenceSummary & { completedAt?: string | null }) | null;
  },
  reference: Date = new Date(),
): boolean {
  if (isSameCalendarDay(activity.fechaEntregaEsperada, reference)) return true;
  if (isSameCalendarDay(activity.fechaFinalizacion, reference)) return true;
  if (isSameCalendarDay(activity.activityEvidence?.completedAt, reference)) return true;
  if (
    isActivityInProgress(activity.estatus) &&
    isSameCalendarDay(activity.fechaInicio, reference)
  ) {
    return true;
  }
  return false;
}

export function isActivityCompletedToday(
  activity: {
    fechaFinalizacion?: string | null;
    estatus?: string | null;
    activityEvidence?: (ActivityEvidenceSummary & { completedAt?: string | null }) | null;
  },
  reference: Date = new Date(),
): boolean {
  if (!isActivityFieldWorkDone(activity.estatus, activity.activityEvidence)) return false;
  return (
    isSameCalendarDay(activity.fechaFinalizacion, reference) ||
    isSameCalendarDay(activity.activityEvidence?.completedAt, reference)
  );
}
