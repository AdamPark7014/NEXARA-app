/**
 * Pipeline de flujo de actividades (Ola C):
 * asignadas → iniciadas → en evidencia → cerradas + rechazos peer + SLA de periodo.
 * Puro: sin Prisma ni Nest.
 */

export type WorkflowPipelineCounts = {
  assigned: number;
  started: number;
  evidence: number;
  closed: number;
  peerRejected: number;
  slaOnTime: number;
  slaLate: number;
  slaPct: number | null;
};

export type WorkflowActivityInput = {
  estatus: string;
  inicioRealAt?: Date | string | null;
  fechaFinalizacion?: Date | string | null;
  fechaMaxima?: Date | string | null;
  periodoFin?: Date | string | null;
  evidenceStatus?: string | null;
  cancelada?: boolean;
};

const EVIDENCE_IN_PROGRESS =
  /^(EVIDENCE_PHOTOS|SERVICE_SHEET_PDF|SERVICE_SHEET_DATA|EXIT_PHOTO|SUBMITTED|PENDING_REVIEW|SUBMITTED_FOR_REVIEW)$/i;

function asDate(v: Date | string | null | undefined): Date | null {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function deadlineOf(a: WorkflowActivityInput): Date | null {
  const fin = asDate(a.periodoFin);
  if (fin) {
    const d = new Date(fin);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  return asDate(a.fechaMaxima);
}

export function emptyWorkflowPipeline(): WorkflowPipelineCounts {
  return {
    assigned: 0,
    started: 0,
    evidence: 0,
    closed: 0,
    peerRejected: 0,
    slaOnTime: 0,
    slaLate: 0,
    slaPct: null,
  };
}

export function accumulateWorkflow(
  counts: WorkflowPipelineCounts,
  a: WorkflowActivityInput,
  now: Date = new Date(),
): void {
  if (a.cancelada) return;

  counts.assigned += 1;

  const closed = /finaliz|cerrad/i.test(a.estatus ?? '');
  const started =
    Boolean(asDate(a.inicioRealAt)) ||
    closed ||
    /en proceso|por validar/i.test(a.estatus ?? '');
  if (started) counts.started += 1;

  const ev = a.evidenceStatus ?? '';
  if (EVIDENCE_IN_PROGRESS.test(ev) || /por validar/i.test(a.estatus ?? '')) {
    counts.evidence += 1;
  }

  if (closed) counts.closed += 1;

  const deadline = deadlineOf(a);
  if (!deadline) return;

  const fin = asDate(a.fechaFinalizacion);
  if (closed && fin) {
    if (fin.getTime() <= deadline.getTime()) counts.slaOnTime += 1;
    else counts.slaLate += 1;
  } else if (!closed && now.getTime() > deadline.getTime()) {
    counts.slaLate += 1;
  }
}

export function finalizeWorkflow(counts: WorkflowPipelineCounts): WorkflowPipelineCounts {
  const total = counts.slaOnTime + counts.slaLate;
  counts.slaPct = total > 0 ? Math.round((counts.slaOnTime / total) * 100) : null;
  return counts;
}

export function withPeerRejects(
  counts: WorkflowPipelineCounts,
  peerRejected: number,
): WorkflowPipelineCounts {
  return { ...counts, peerRejected };
}
