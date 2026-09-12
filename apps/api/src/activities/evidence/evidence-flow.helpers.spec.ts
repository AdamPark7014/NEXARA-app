import {
  clampEvidencePhotoRequired,
  evidenceProgressPct,
  isPdfUrl,
  nextEvidenceStep,
  requiresServiceSheetPdf,
} from './evidence-flow.helpers';

describe('evidence-flow.helpers', () => {
  it('clamps photo count to 2–8', () => {
    expect(clampEvidencePhotoRequired(1)).toBe(2);
    expect(clampEvidencePhotoRequired(4)).toBe(4);
    expect(clampEvidencePhotoRequired(99)).toBe(8);
    expect(clampEvidencePhotoRequired('x')).toBe(4);
  });

  it('requires PDF only for servicio', () => {
    expect(requiresServiceSheetPdf('servicio')).toBe(true);
    expect(requiresServiceSheetPdf('obra')).toBe(false);
  });

  it('skips PDF step for non-servicio', () => {
    expect(nextEvidenceStep('EVIDENCE_PHOTOS', 'tarea')).toBe('SERVICE_SHEET_DATA');
    expect(nextEvidenceStep('EVIDENCE_PHOTOS', 'servicio')).toBe('SERVICE_SHEET_PDF');
  });

  it('computes progress', () => {
    expect(evidenceProgressPct('ENTRY_PHOTO', 'tarea')).toBe(0);
    expect(evidenceProgressPct('COMPLETED', 'tarea')).toBe(100);
    expect(evidenceProgressPct('EVIDENCE_PHOTOS', 'tarea')).toBeGreaterThan(0);
  });

  it('validates pdf urls', () => {
    expect(isPdfUrl('/uploads/a.pdf')).toBe(true);
    expect(isPdfUrl('data:application/pdf;base64,xx')).toBe(true);
    expect(isPdfUrl('/uploads/a.jpg')).toBe(false);
  });
});
