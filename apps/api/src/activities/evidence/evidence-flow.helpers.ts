export type CoreActivityKind = 'tarea' | 'proyecto' | 'obra' | 'servicio' | 'comercial';

export type EvidenceStep =
  | 'ENTRY_PHOTO'
  | 'EVIDENCE_PHOTOS'
  | 'SERVICE_SHEET_PDF'
  | 'SERVICE_SHEET_DATA'
  | 'EXIT_PHOTO'
  | 'COMPLETED';

export function clampEvidencePhotoRequired(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 4;
  return Math.min(8, Math.max(2, v));
}

export function requiresServiceSheetPdf(coreKind?: string | null): boolean {
  return (coreKind || '').toLowerCase() === 'servicio';
}

/**
 * En una actividad **comercial** el paso de formulario lo cubre la cotización.
 *
 * Contrato del viernes (D): foto de entrada → fotos del levantamiento → **cotización** (en lugar de
 * la hoja de servicio; el paso se da por hecho cuando la cotización queda ENVIADA) → foto de salida.
 * No se agrega un paso nuevo al flujo: el de `SERVICE_SHEET_DATA` se rellena solo con el folio y la
 * fecha de envío, así que las apps viejas siguen viendo los mismos cinco pasos.
 */
export function pasoCubiertoPorCotizacion(coreKind?: string | null): boolean {
  return (coreKind || '').toLowerCase() === 'comercial';
}

/** Ordered steps for a kind (COMPLETED is the terminal marker). */
export function evidenceStepsForKind(coreKind?: string | null): EvidenceStep[] {
  if (requiresServiceSheetPdf(coreKind)) {
    return [
      'ENTRY_PHOTO',
      'EVIDENCE_PHOTOS',
      'SERVICE_SHEET_PDF',
      'SERVICE_SHEET_DATA',
      'EXIT_PHOTO',
      'COMPLETED',
    ];
  }
  return ['ENTRY_PHOTO', 'EVIDENCE_PHOTOS', 'SERVICE_SHEET_DATA', 'EXIT_PHOTO', 'COMPLETED'];
}

export function nextEvidenceStep(
  current: EvidenceStep,
  coreKind?: string | null,
): EvidenceStep {
  const steps = evidenceStepsForKind(coreKind);
  const i = steps.indexOf(current);
  if (i < 0 || i >= steps.length - 1) return 'COMPLETED';
  return steps[i + 1];
}

/** Progress 0–100. Status = current step (not yet finished). */
export function evidenceProgressPct(
  status: string | null | undefined,
  coreKind?: string | null,
): number {
  const steps: string[] = evidenceStepsForKind(coreKind).filter((s) => s !== 'COMPLETED');
  if (!status || status === 'ENTRY_PHOTO') return 0;
  if (status === 'COMPLETED') return 100;
  const idx = steps.indexOf(status);
  if (idx < 0) return 0;
  return Math.round((idx / steps.length) * 100);
}

export function isPdfUrl(url: string): boolean {
  const u = (url || '').trim().toLowerCase();
  return u.endsWith('.pdf') || u.includes('.pdf?') || u.startsWith('data:application/pdf');
}
