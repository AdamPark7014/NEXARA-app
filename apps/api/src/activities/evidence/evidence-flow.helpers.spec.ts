import {
  clampEvidencePhotoRequired,
  evidenceProgressPct,
  isPdfUrl,
  nextEvidenceStep,
  puedeRegresarA,
  requiresServiceSheetPdf,
} from './evidence-flow.helpers';

describe('puedeRegresarA', () => {
  it('a un paso anterior, ya pasada la entrada', () => {
    expect(puedeRegresarA('tarea', 'EXIT_PHOTO', 'EVIDENCE_PHOTOS')).toBe(true);
    expect(puedeRegresarA('tarea', 'SERVICE_SHEET_DATA', 'EVIDENCE_PHOTOS')).toBe(true);
    expect(puedeRegresarA('servicio', 'SERVICE_SHEET_PDF', 'EVIDENCE_PHOTOS')).toBe(true);
  });
  it('la foto de entrada no se repite', () => {
    expect(puedeRegresarA('tarea', 'EVIDENCE_PHOTOS', 'ENTRY_PHOTO')).toBe(false);
    expect(puedeRegresarA('tarea', 'EXIT_PHOTO', 'ENTRY_PHOTO')).toBe(false);
  });
  it('ni hacia adelante, ni al mismo, ni desde lo terminado, ni a un paso que no lleva', () => {
    expect(puedeRegresarA('tarea', 'EVIDENCE_PHOTOS', 'EXIT_PHOTO')).toBe(false);
    expect(puedeRegresarA('tarea', 'EXIT_PHOTO', 'EXIT_PHOTO')).toBe(false);
    expect(puedeRegresarA('tarea', 'COMPLETED', 'EVIDENCE_PHOTOS')).toBe(false);
    expect(puedeRegresarA('tarea', 'EXIT_PHOTO', 'SERVICE_SHEET_PDF')).toBe(false);
    expect(puedeRegresarA('tarea', 'EXIT_PHOTO', 'inventado')).toBe(false);
  });
});

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
