import {
  accumulateWorkflow,
  emptyWorkflowPipeline,
  finalizeWorkflow,
  withPeerRejects,
} from './workflow-kpis.js';

describe('workflow-kpis', () => {
  it('cuenta pipeline y SLA a tiempo', () => {
    const c = emptyWorkflowPipeline();
    accumulateWorkflow(c, {
      estatus: 'Finalizada',
      inicioRealAt: '2026-09-10T10:00:00Z',
      fechaFinalizacion: '2026-09-12T12:00:00Z',
      periodoFin: '2026-09-15',
      evidenceStatus: 'COMPLETED',
    });
    finalizeWorkflow(c);
    expect(c.assigned).toBe(1);
    expect(c.started).toBe(1);
    expect(c.closed).toBe(1);
    expect(c.slaOnTime).toBe(1);
    expect(c.slaPct).toBe(100);
  });

  it('marca tarde si el cierre pasa el periodo', () => {
    const c = emptyWorkflowPipeline();
    accumulateWorkflow(c, {
      estatus: 'Finalizada',
      inicioRealAt: '2026-09-10T10:00:00Z',
      fechaFinalizacion: '2026-09-20T12:00:00Z',
      periodoFin: '2026-09-15',
    });
    finalizeWorkflow(c);
    expect(c.slaLate).toBe(1);
    expect(c.slaOnTime).toBe(0);
  });

  it('añade rechazos peer sin tocar el resto', () => {
    const c = withPeerRejects(emptyWorkflowPipeline(), 3);
    expect(c.peerRejected).toBe(3);
  });
});
