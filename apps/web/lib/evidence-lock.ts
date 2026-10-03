import { textosDeInicioYCierre } from "@/lib/evidence-flow-helpers";

export const EVIDENCE_STEP_ORDER = [
  "ENTRY_PHOTO",
  "EVIDENCE_PHOTOS",
  "SERVICE_SHEET_PDF",
  "SERVICE_SHEET_DATA",
  "EXIT_PHOTO",
] as const;

export type EvidenceStep = (typeof EVIDENCE_STEP_ORDER)[number];

export type ActivityEvidenceSummary = {
  status?: string | null;
  reviewStatus?: string | null;
  rejectedStep?: string | null;
  rejectedSteps?: string[] | null;
};

export function rejectedStepsList(ev?: ActivityEvidenceSummary | null): string[] {
  if (Array.isArray(ev?.rejectedSteps) && ev.rejectedSteps.length > 0) {
    return ev.rejectedSteps.filter((s): s is string => typeof s === "string");
  }
  if (ev?.rejectedStep) return [ev.rejectedStep];
  return [];
}

export function isEvidenceSubmitted(ev?: ActivityEvidenceSummary | null): boolean {
  return ev?.status === "COMPLETED";
}

export function isEvidenceLocked(ev?: ActivityEvidenceSummary | null): boolean {
  if (!ev) return false;
  if (ev.reviewStatus === "REJECTED") return false;
  return ev.status === "COMPLETED";
}

export function isEvidenceApproved(ev?: ActivityEvidenceSummary | null): boolean {
  return ev?.reviewStatus === "APPROVED";
}

export function canStartActivity(
  estatus: string,
  ev?: ActivityEvidenceSummary | null,
): boolean {
  if (isEvidenceLocked(ev) || isEvidenceApproved(ev)) return false;
  if (ev?.reviewStatus === "REJECTED") return false;
  return !/proceso|curso|en_curso/i.test(estatus) && !/finaliz|completada|aprobada/i.test(estatus);
}

/** `coreKind`: en comercial el primer y el último paso se llaman distinto (ver `textosDeInicioYCierre`). */
export function evidenceStepLabel(step: string, coreKind?: string | null): string {
  switch (step) {
    case "ENTRY_PHOTO":
      return textosDeInicioYCierre(coreKind).inicio.paso;
    case "EVIDENCE_PHOTOS":
      return "Paso 2: Fotos de Evidencia";
    case "SERVICE_SHEET_PDF":
      return "Paso 3: PDF Hoja de Servicio";
    case "SERVICE_SHEET_DATA":
      return "Paso 4: Plantilla Interna";
    case "EXIT_PHOTO":
      return textosDeInicioYCierre(coreKind).cierre.paso;
    default:
      return step;
  }
}

export function fieldActionLabel(
  estatus: string,
  ev?: ActivityEvidenceSummary | null,
): { label: string; href: string; variant: "primary" | "secondary" | "ghost" } | null {
  if (isEvidenceApproved(ev)) return null;
  if (isEvidenceLocked(ev)) {
    return { label: "En revisión", href: "", variant: "ghost" };
  }
  if (ev?.reviewStatus === "REJECTED") {
    return { label: "Corregir evidencias", href: "evidences", variant: "primary" };
  }
  if (/proceso|curso|en_curso/i.test(estatus)) {
    if (ev?.status === "EXIT_PHOTO") {
      return { label: "Foto de salida", href: "evidences", variant: "primary" };
    }
    if (ev?.status && ev.status !== "COMPLETED") {
      return { label: "Continuar evidencias", href: "evidences", variant: "primary" };
    }
    return { label: "Subir evidencias", href: "evidences", variant: "primary" };
  }
  return null;
}
