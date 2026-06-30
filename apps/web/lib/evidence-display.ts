import { getApiAssetOrigin } from "@/lib/api-base";
import { EVIDENCE_STEP_ORDER, evidenceStepLabel } from "@/lib/evidence-lock";

export type ActivityEvidenceDetail = {
  status?: string | null;
  reviewStatus?: string | null;
  rejectedStep?: string | null;
  rejectedSteps?: string[] | null;
  reviewNotes?: string | null;
  reviewedAt?: string | null;
  completedAt?: string | null;
  entryPhotoUrl?: string | null;
  entryPhotoUploadedAt?: string | null;
  entryLatitude?: number | string | null;
  entryLongitude?: number | string | null;
  evidencePhotos?: string[] | null;
  evidencePhotosUploadedAt?: string | null;
  serviceSheetPdfUrl?: string | null;
  serviceSheetUploadedAt?: string | null;
  serviceSheetData?: unknown;
  serviceSheetCompletedAt?: string | null;
  exitPhotoUrl?: string | null;
  exitPhotoUploadedAt?: string | null;
  exitLatitude?: number | string | null;
  exitLongitude?: number | string | null;
  reviewedBy?: { id: number; nombre: string } | null;
};

export function resolveAssetUrl(url?: string | null): string {
  if (!url) return "";
  const raw = url.trim();
  if (!raw) return "";
  if (/^(data:|blob:|\/\/)/i.test(raw)) return raw;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (!/^\/(uploads|activities|evidences|activity-evidence|documents|user-docs|users|clients|vehicles)\//i.test(parsed.pathname)) {
        return raw;
      }
    } catch {
      return raw;
    }
  }

  const base = getApiAssetOrigin();
  let normalizedPath = raw.replace(/\\+/g, "/").replace(/^https?:\/\/[^/]+/i, "");
  normalizedPath = `${normalizedPath.startsWith("/") ? "" : "/"}${normalizedPath}`;

  if (
    !normalizedPath.startsWith("/uploads/") &&
    !normalizedPath.startsWith("/api/uploads/") &&
    /^\/(activities|evidences|activity-evidence|documents|user-docs|users|clients|vehicles)\//i.test(normalizedPath)
  ) {
    normalizedPath = `/uploads${normalizedPath}`;
  }

  return `${base}${normalizedPath}`;
}

export function countEvidenceFiles(ev?: ActivityEvidenceDetail | null): number {
  if (!ev) return 0;
  let count = 0;
  if (ev.entryPhotoUrl) count += 1;
  count += ev.evidencePhotos?.length ?? 0;
  if (ev.serviceSheetPdfUrl) count += 1;
  if (ev.exitPhotoUrl) count += 1;
  return count;
}

export function mapsUrl(lat?: number | string | null, lng?: number | string | null): string | null {
  const la = typeof lat === "string" ? Number(lat) : lat;
  const lo = typeof lng === "string" ? Number(lng) : lng;
  if (typeof la !== "number" || typeof lo !== "number" || Number.isNaN(la) || Number.isNaN(lo)) {
    return null;
  }
  return `https://www.google.com/maps?q=${la},${lo}`;
}

const humanizeKey = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export function flattenServiceSheetFields(
  value: unknown,
  prefix = "",
): Array<{ label: string; value: string; imageUrl?: string | null }> {
  if (value == null) return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (/^data:image\//i.test(trimmed)) {
      return [{ label: prefix || "Imagen", value: "Imagen capturada", imageUrl: trimmed }];
    }
    return [{ label: prefix || "Valor", value: trimmed }];
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return [{ label: prefix || "Valor", value: String(value) }];
  }
  if (Array.isArray(value)) {
    if (!value.length) return [];
    if (value.every((item) => ["string", "number", "boolean"].includes(typeof item))) {
      return [{ label: prefix || "Valores", value: value.join(", ") }];
    }
    return value.flatMap((item, index) =>
      flattenServiceSheetFields(item, prefix ? `${prefix} ${index + 1}` : `Elemento ${index + 1}`),
    );
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
      flattenServiceSheetFields(nested, prefix ? `${prefix} / ${humanizeKey(key)}` : humanizeKey(key)),
    );
  }
  return [];
}

export type EvidenceStepStatus = {
  step: (typeof EVIDENCE_STEP_ORDER)[number];
  label: string;
  done: boolean;
  at?: string | null;
};

export function evidenceStepStatuses(ev: ActivityEvidenceDetail): EvidenceStepStatus[] {
  return EVIDENCE_STEP_ORDER.map((step) => {
    const at =
      step === "ENTRY_PHOTO"
        ? ev.entryPhotoUploadedAt
        : step === "EVIDENCE_PHOTOS"
          ? ev.evidencePhotosUploadedAt
          : step === "SERVICE_SHEET_PDF"
            ? ev.serviceSheetUploadedAt
            : step === "SERVICE_SHEET_DATA"
              ? ev.serviceSheetCompletedAt
              : step === "EXIT_PHOTO"
                ? ev.exitPhotoUploadedAt ?? ev.completedAt
                : null;

    const done =
      step === "ENTRY_PHOTO"
        ? Boolean(ev.entryPhotoUrl)
        : step === "EVIDENCE_PHOTOS"
          ? (ev.evidencePhotos?.length ?? 0) > 0
          : step === "SERVICE_SHEET_PDF"
            ? Boolean(ev.serviceSheetPdfUrl)
            : step === "SERVICE_SHEET_DATA"
              ? Boolean(ev.serviceSheetData)
              : step === "EXIT_PHOTO"
                ? Boolean(ev.exitPhotoUrl)
                : false;

    return { step, label: evidenceStepLabel(step), done, at };
  });
}
