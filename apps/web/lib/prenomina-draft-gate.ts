/**
 * Light draft gate for EmployeePayment Borrador → Pagado.
 * Status model has no "Aprobado"; stamp lives on `note` (no new Prisma field / no CFDI).
 */

export const DRAFT_APPROVAL_PREFIX = "[Aprobado borrador]";

export const draftGateConfirmCopy = {
  CONFIRM_MESSAGE:
    "¿Aprobar borrador y marcar como pagado? Se registrará la aprobación en la nota del pago.",
  CONFIRM_LABEL: "Aprobar borrador",
} as const;

export function buildDraftApprovalStamp(actorLabel: string, at: Date = new Date()): string {
  const when = at.toISOString().slice(0, 16).replace("T", " ");
  return `${DRAFT_APPROVAL_PREFIX} por ${actorLabel} · ${when}`;
}

export function appendDraftApprovalNote(
  existingNote: string | null | undefined,
  actorLabel: string,
  at?: Date,
): string {
  const trimmed = (existingNote ?? "").trim();
  if (trimmed.includes(DRAFT_APPROVAL_PREFIX)) return trimmed;
  const stamp = buildDraftApprovalStamp(actorLabel, at);
  return trimmed ? `${trimmed} | ${stamp}` : stamp;
}

export function needsDraftApprovalConfirm(status: string | null | undefined): boolean {
  return (status ?? "").trim() === "Borrador";
}
