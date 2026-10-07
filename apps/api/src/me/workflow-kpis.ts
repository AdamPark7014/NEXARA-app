/**
 * Pipeline de flujo de actividades (Ola C):
 * asignadas → iniciadas → en evidencia → cerradas + rechazos peer + SLA de periodo.
 * Puro: sin Prisma ni Nest.
 */
import { limiteDeEntrega } from '../activities/semaforo-actividad.js';

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
  fechaInicio?: Date | string | null;
  fechaMaxima?: Date | string | null;
  fechaEntregaEsperada?: Date | string | null;
  periodoInicio?: Date | string | null;
  periodoFin?: Date | string | null;
  evidenceStatus?: string | null;
  /**
   * Cuándo la entregó quien la hace (fin real o evidencia completa). Es lo que se compara con
   * el límite: `fechaFinalizacion` es cuándo la aprobó el jefe, a veces un día después.
   */
  entregadaAt?: Date | string | null;
  cancelada?: boolean;
};

const EVIDENCE_IN_PROGRESS =
  /^(EVIDENCE_PHOTOS|SERVICE_SHEET_PDF|SERVICE_SHEET_DATA|EXIT_PHOTO|SUBMITTED|PENDING_REVIEW|SUBMITTED_FOR_REVIEW)$/i;

function asDate(v: Date | string | null | undefined): Date | null {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** El mismo límite que el semáforo (fin del periodo en hora de México; fecha máxima = inicio → fin de ese día). */
function deadlineOf(a: WorkflowActivityInput): Date | null {
  // Una fila con solo el fin del periodo (editada por otro camino) sigue midiéndose contra él.
  return limiteDeEntrega({ ...a, periodoInicio: a.periodoInicio ?? a.periodoFin });
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

/** Los baldes del pipeline que se pueden pedir por separado (el detalle de cada número). */
export const WORKFLOW_BUCKETS = [
  'assigned',
  'started',
  'evidence',
  'closed',
  'peerRejected',
  'slaOnTime',
  'slaLate',
] as const;
export type WorkflowBucket = (typeof WORKFLOW_BUCKETS)[number];

export function isWorkflowBucket(v: string): v is WorkflowBucket {
  return (WORKFLOW_BUCKETS as readonly string[]).includes(v);
}

type Clasificacion = Record<Exclude<WorkflowBucket, 'peerRejected'>, boolean>;

/**
 * En qué baldes del pipeline cae una actividad — única fuente de verdad: tanto el conteo
 * (`accumulateWorkflow`) como el detalle por balde (`TeamBoardService.getWorkflowActivities`) la
 * usan, para que el número de la franja y la lista que se abre al dar clic siempre coincidan.
 */
export function clasificarActividad(a: WorkflowActivityInput, now: Date = new Date()): Clasificacion {
  const vacia: Clasificacion = { assigned: false, started: false, evidence: false, closed: false, slaOnTime: false, slaLate: false };
  if (a.cancelada) return vacia;

  const closed = /finaliz|cerrad/i.test(a.estatus ?? '');
  const started =
    Boolean(asDate(a.inicioRealAt)) ||
    closed ||
    /en proceso|por validar/i.test(a.estatus ?? '');
  const ev = a.evidenceStatus ?? '';
  const evidence = EVIDENCE_IN_PROGRESS.test(ev) || /por validar/i.test(a.estatus ?? '');

  let slaOnTime = false;
  let slaLate = false;
  const deadline = deadlineOf(a);
  if (deadline) {
    // Lo que cuenta es cuándo la entregó la persona; la aprobación del jefe puede tardar.
    const entregada = asDate(a.entregadaAt);
    const fin = entregada ?? (closed ? asDate(a.fechaFinalizacion) : null);
    if (fin) {
      if (fin.getTime() <= deadline.getTime()) slaOnTime = true;
      else slaLate = true;
    } else if (!closed && now.getTime() > deadline.getTime()) {
      slaLate = true;
    }
  }

  return { assigned: true, started, evidence, closed, slaOnTime, slaLate };
}

export function accumulateWorkflow(
  counts: WorkflowPipelineCounts,
  a: WorkflowActivityInput,
  now: Date = new Date(),
): void {
  const c = clasificarActividad(a, now);
  if (!c.assigned) return;
  counts.assigned += 1;
  if (c.started) counts.started += 1;
  if (c.evidence) counts.evidence += 1;
  if (c.closed) counts.closed += 1;
  if (c.slaOnTime) counts.slaOnTime += 1;
  if (c.slaLate) counts.slaLate += 1;
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
