/** Shared Core evidence step helpers (mirror of API evidence-flow.helpers). */

export type CoreActivityKind = 'tarea' | 'proyecto' | 'obra' | 'servicio' | 'comercial';

export type EvidenceStep =
  | 'ENTRY_PHOTO'
  | 'EVIDENCE_PHOTOS'
  | 'SERVICE_SHEET_PDF'
  | 'SERVICE_SHEET_DATA'
  | 'EXIT_PHOTO'
  | 'COMPLETED';

export function requiresServiceSheetPdf(coreKind?: string | null): boolean {
  return (coreKind || '').toLowerCase() === 'servicio';
}

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

export function evidenceProgressPct(
  status: string | null | undefined,
  coreKind?: string | null,
): number {
  const steps = evidenceStepsForKind(coreKind).filter((s) => s !== 'COMPLETED');
  if (!status || status === 'ENTRY_PHOTO') return 0;
  if (status === 'COMPLETED') return 100;
  const idx = steps.indexOf(status as EvidenceStep);
  if (idx < 0) return 0;
  return Math.round((idx / steps.length) * 100);
}

export function isPdfUrl(url: string): boolean {
  const u = (url || '').trim().toLowerCase();
  return u.endsWith('.pdf') || u.includes('.pdf?') || u.startsWith('data:application/pdf');
}

export type DigitalFormFields = Record<string, string>;

export function emptyDigitalForm(coreKind?: string | null): DigitalFormFields {
  const k = (coreKind || 'tarea').toLowerCase();
  if (k === 'servicio') {
    return { sucursal: '', gerenteEncargado: '', queSeHizo: '', observaciones: '' };
  }
  if (k === 'proyecto' || k === 'obra') {
    return { lugar: '', encargadoSitio: '', queSeHizo: '', observaciones: '' };
  }
  if (k === 'comercial') {
    return { queHiciste: '', clienteOProyecto: '' };
  }
  return { queHiciste: '' };
}

export function digitalFormLabels(coreKind?: string | null): { key: string; label: string }[] {
  const k = (coreKind || 'tarea').toLowerCase();
  if (k === 'servicio') {
    return [
      { key: 'sucursal', label: 'Sucursal' },
      { key: 'gerenteEncargado', label: 'Gerente / encargado' },
      { key: 'queSeHizo', label: 'Qué se hizo' },
      { key: 'observaciones', label: 'Observaciones' },
    ];
  }
  if (k === 'proyecto' || k === 'obra') {
    return [
      { key: 'lugar', label: 'Lugar' },
      { key: 'encargadoSitio', label: 'Encargado en sitio' },
      { key: 'queSeHizo', label: 'Qué se hizo' },
      { key: 'observaciones', label: 'Observaciones' },
    ];
  }
  if (k === 'comercial') {
    return [
      { key: 'queHiciste', label: 'Qué hiciste' },
      { key: 'clienteOProyecto', label: 'Cliente o proyecto' },
    ];
  }
  return [{ key: 'queHiciste', label: 'Qué hiciste' }];
}
