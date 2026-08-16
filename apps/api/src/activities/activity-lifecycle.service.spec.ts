import { ActivityLifecycleService, ACTIVITY_CLOSURE_WORKFLOW } from './activity-lifecycle.service.js';

type Mocks = {
  visitUpdateMany: jest.Mock;
  ticketUpdateMany: jest.Mock;
  definitionFindFirst: jest.Mock;
  instanceFindFirst: jest.Mock;
  instanceCreate: jest.Mock;
};

function build(overrides: Partial<Mocks> = {}) {
  const mocks: Mocks = {
    visitUpdateMany: jest.fn().mockResolvedValue({ count: 1 }),
    ticketUpdateMany: jest.fn().mockResolvedValue({ count: 1 }),
    definitionFindFirst: jest.fn().mockResolvedValue(null),
    instanceFindFirst: jest.fn().mockResolvedValue(null),
    instanceCreate: jest.fn().mockResolvedValue({ id: 55 }),
    ...overrides,
  };

  const prisma = {
    maintenanceContractVisit: { updateMany: mocks.visitUpdateMany },
    clientTicketRequest: { updateMany: mocks.ticketUpdateMany },
    workflowDefinition: { findFirst: mocks.definitionFindFirst },
    workflowInstance: { findFirst: mocks.instanceFindFirst, create: mocks.instanceCreate },
  };

  return { service: new ActivityLifecycleService(prisma as any), mocks };
}

describe('ActivityLifecycleService.onActivityFinished', () => {
  it('cierra la visita de contrato que originó la actividad', async () => {
    // materializeVisitAsActivity deja la visita en GENERATED; sin esto
    // completedAt quedaba nulo para siempre y analítica la contaba pendiente.
    const { service, mocks } = build();
    const outcome = await service.onActivityFinished({ activityId: 10, companyId: 7, actorId: 3 });

    expect(outcome.contractVisitCompleted).toBe(true);
    const args = mocks.visitUpdateMany.mock.calls[0][0];
    expect(args.where.activityId).toBe(10);
    expect(args.data.status).toBe('COMPLETED');
    expect(args.data.completedAt).toBeInstanceOf(Date);
  });

  it('no pisa una visita ya cerrada ni una omitida', async () => {
    const { service, mocks } = build();
    await service.onActivityFinished({ activityId: 10, companyId: 7, actorId: 3 });

    const args = mocks.visitUpdateMany.mock.calls[0][0];
    expect(args.where.status.in).toEqual(['SCHEDULED', 'GENERATED']);
    expect(args.where.status.in).not.toContain('SKIPPED');
    expect(args.where.status.in).not.toContain('COMPLETED');
  });

  it('cierra la solicitud del portal de cliente', async () => {
    const { service, mocks } = build();
    const outcome = await service.onActivityFinished({ activityId: 10, companyId: 7, actorId: 3 });

    expect(outcome.clientTicketClosed).toBe(true);
    const args = mocks.ticketUpdateMany.mock.calls[0][0];
    expect(args.where.status.in).toEqual(['NEW', 'ASSIGNED']);
    expect(args.data.status).toBe('CLOSED');
  });

  it('no abre workflow si la empresa no tiene definición activa', async () => {
    // Caso normal, no un error: la mayoría de empresas no define el flujo.
    const { service, mocks } = build();
    const outcome = await service.onActivityFinished({ activityId: 10, companyId: 7, actorId: 3 });

    expect(outcome.workflowInstanceId).toBeNull();
    expect(outcome.errors).toEqual([]);
    expect(mocks.instanceCreate).not.toHaveBeenCalled();
  });

  it('abre la instancia cuando sí hay definición activa', async () => {
    const { service, mocks } = build({
      definitionFindFirst: jest.fn().mockResolvedValue({ id: 2, steps: [{ id: 20, stepNumber: 1 }] }),
    });
    const outcome = await service.onActivityFinished({ activityId: 10, companyId: 7, actorId: 3 });

    expect(outcome.workflowInstanceId).toBe(55);
    const args = mocks.instanceCreate.mock.calls[0][0];
    expect(args.data.entityType).toBe(ACTIVITY_CLOSURE_WORKFLOW);
    expect(args.data.entityId).toBe(10);
    expect(args.data.companyId).toBe(7);
    expect(args.data.approvals.create.stepId).toBe(20);
  });

  it('no duplica la instancia si ya hay una abierta', async () => {
    const { service, mocks } = build({
      definitionFindFirst: jest.fn().mockResolvedValue({ id: 2, steps: [{ id: 20, stepNumber: 1 }] }),
      instanceFindFirst: jest.fn().mockResolvedValue({ id: 99 }),
    });
    const outcome = await service.onActivityFinished({ activityId: 10, companyId: 7, actorId: 3 });

    expect(outcome.workflowInstanceId).toBe(99);
    expect(mocks.instanceCreate).not.toHaveBeenCalled();
  });

  it('ignora una definición sin pasos', async () => {
    const { service, mocks } = build({
      definitionFindFirst: jest.fn().mockResolvedValue({ id: 2, steps: [] }),
    });
    const outcome = await service.onActivityFinished({ activityId: 10, companyId: 7, actorId: 3 });

    expect(outcome.workflowInstanceId).toBeNull();
    expect(mocks.instanceCreate).not.toHaveBeenCalled();
  });

  it('un fallo propagando efectos NO tumba el cierre', async () => {
    // La actividad ya se cerró en campo: propagar es best-effort.
    const { service } = build({
      visitUpdateMany: jest.fn().mockRejectedValue(new Error('db caída')),
    });

    const outcome = await service.onActivityFinished({ activityId: 10, companyId: 7, actorId: 3 });

    expect(outcome.contractVisitCompleted).toBe(false);
    expect(outcome.errors[0]).toContain('visita de contrato');
    // El resto de efectos sigue intentándose.
    expect(outcome.clientTicketClosed).toBe(true);
  });

  it('sin empresa o sin actor no intenta abrir workflow', async () => {
    const { service, mocks } = build({
      definitionFindFirst: jest.fn().mockResolvedValue({ id: 2, steps: [{ id: 20, stepNumber: 1 }] }),
    });

    const sinEmpresa = await service.onActivityFinished({ activityId: 10, companyId: null, actorId: 3 });
    const sinActor = await service.onActivityFinished({ activityId: 10, companyId: 7, actorId: null });

    expect(sinEmpresa.workflowInstanceId).toBeNull();
    expect(sinActor.workflowInstanceId).toBeNull();
    expect(mocks.definitionFindFirst).not.toHaveBeenCalled();
  });

  it('rechaza un activityId inválido sin tocar nada', async () => {
    const { service, mocks } = build();
    const outcome = await service.onActivityFinished({ activityId: 0, companyId: 7, actorId: 3 });

    expect(outcome.errors).toContain('activityId inválido');
    expect(mocks.visitUpdateMany).not.toHaveBeenCalled();
    expect(mocks.ticketUpdateMany).not.toHaveBeenCalled();
  });
});

describe('validación del Arquitecto', () => {
  it('sin flujo configurado no exige validación', async () => {
    // Caso normal: no dejamos actividades atascadas donde nadie lo configuró.
    const { service } = build();
    expect(await service.requiresArchitectValidation(7)).toBe(false);
  });

  it('con flujo activo y pasos, exige validación', async () => {
    const { service } = build({
      definitionFindFirst: jest.fn().mockResolvedValue({ id: 2, steps: [{ id: 20 }] }),
    });
    expect(await service.requiresArchitectValidation(7)).toBe(true);
  });

  it('una definición sin pasos no cuenta como validación', async () => {
    const { service } = build({
      definitionFindFirst: jest.fn().mockResolvedValue({ id: 2, steps: [] }),
    });
    expect(await service.requiresArchitectValidation(7)).toBe(false);
  });

  it('sin empresa no exige validación', async () => {
    const { service } = build();
    expect(await service.requiresArchitectValidation(null)).toBe(false);
  });

  it('mientras espera validación NO propaga los efectos de cierre', async () => {
    // La visita de contrato y el ticket del cliente esperan al visto bueno.
    const { service, mocks } = build();
    const outcome = await service.onActivityFinished({
      activityId: 10,
      companyId: 7,
      actorId: 3,
      applyClosureEffects: false,
    });

    expect(mocks.visitUpdateMany).not.toHaveBeenCalled();
    expect(mocks.ticketUpdateMany).not.toHaveBeenCalled();
    expect(outcome.contractVisitCompleted).toBe(false);
  });

  it('al validar, finaliza la actividad y propaga los efectos', async () => {
    const activityUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const { service, mocks } = build();
    (service as any).prisma.activity = { updateMany: activityUpdateMany };

    const outcome = await service.onActivityValidated({ activityId: 10, companyId: 7 });

    const args = activityUpdateMany.mock.calls[0][0];
    expect(args.where.estatus.in).toContain('Por Validar');
    expect(args.data.estatus).toBe('Finalizada');
    expect(mocks.visitUpdateMany).toHaveBeenCalled();
    expect(mocks.ticketUpdateMany).toHaveBeenCalled();
    expect(outcome.errors).toEqual([]);
  });
});
