import { esAprobadorDeRespaldo, WorkflowService } from './workflow.service.js';

const DIRECCION = { roleId: 1, roleKey: 'ceo', role: { nombre: 'Dirección', accesoConsoleAdmin: true } };
const ADMINISTRATIVO = { roleId: 2, roleKey: 'administrativo', role: { nombre: 'Administrativo', accesoConsoleAdmin: false } };

function crear(usuario: any, respaldo: Array<{ id: number }> = []) {
  const findMany = jest.fn(async () => []);
  const userFindMany = jest.fn(async () => respaldo);
  const createNotification = jest.fn(async () => ({}));
  const prisma: any = {
    user: { findUnique: jest.fn(async () => usuario), findMany: userFindMany },
    workflowApproval: { findMany },
    purchaseOrder: { findFirst: jest.fn(async () => ({ totalAmount: 48250 })) },
    expense: { findFirst: jest.fn(async () => null) },
  };
  const servicio = new WorkflowService(prisma, { createNotification } as any, { publishEntityLifecycle: jest.fn() } as any);
  return { servicio, findMany, userFindMany, createNotification };
}

describe('esAprobadorDeRespaldo', () => {
  it('la dirección (administración de consola) y el equipo de desarrollo sí; el resto no', () => {
    expect(esAprobadorDeRespaldo(DIRECCION)).toBe(true);
    expect(esAprobadorDeRespaldo({ roleKey: 'super_admin' })).toBe(true);
    expect(esAprobadorDeRespaldo(ADMINISTRATIVO)).toBe(false);
    expect(esAprobadorDeRespaldo(null)).toBe(false);
  });
});

describe('WorkflowService.listMyPending · pasos sin aprobador', () => {
  it('la dirección ve también los pasos que nadie tiene asignados', async () => {
    const { servicio, findMany } = crear(DIRECCION);
    await servicio.listMyPending(10, 7);
    const or = (findMany.mock.calls[0] as any[])[0].where.OR;
    expect(or).toContainEqual({ step: { approverUserId: null, approverRoleId: null } });
  });

  it('un rol común solo ve lo que le asignaron a él o a su rol', async () => {
    const { servicio, findMany } = crear(ADMINISTRATIVO);
    await servicio.listMyPending(11, 7);
    const or = (findMany.mock.calls[0] as any[])[0].where.OR;
    expect(or).toHaveLength(2);
    expect(or).not.toContainEqual({ step: { approverUserId: null, approverRoleId: null } });
  });
});

describe('WorkflowService · aviso del paso pendiente', () => {
  const invocar = (s: WorkflowService, step: any) =>
    (s as any).notifyStep(step, 5, 'Toda OC', 'PURCHASE_ORDER', 99, 7);

  it('paso con persona: solo a esa persona, con el importe en el aviso', async () => {
    const { servicio, createNotification } = crear(DIRECCION);
    await invocar(servicio, { approverUserId: 20, approverRoleId: null });
    expect(createNotification).toHaveBeenCalledTimes(1);
    const arg = (createNotification.mock.calls[0] as any[])[0];
    expect(arg.userId).toBe(20);
    expect(arg.message).toMatch(/PURCHASE_ORDER #99 por .*48,250/);
  });

  it('paso sin persona ni rol: avisa a quienes pueden decidirlo (la dirección de esa empresa)', async () => {
    const { servicio, userFindMany, createNotification } = crear(DIRECCION, [{ id: 1 }, { id: 2 }]);
    await invocar(servicio, { approverUserId: null, approverRoleId: null });
    expect((userFindMany.mock.calls[0] as any[])[0].where).toMatchObject({
      isActive: true,
      role: { accesoConsoleAdmin: true },
      companyMemberships: { some: { companyId: 7 } },
    });
    expect(createNotification.mock.calls.map((c: any[]) => c[0].userId)).toEqual([1, 2]);
  });

  it('paso asignado a un rol: no avisa a nadie en particular (como antes)', async () => {
    const { servicio, createNotification } = crear(DIRECCION, [{ id: 1 }]);
    await invocar(servicio, { approverUserId: null, approverRoleId: 4 });
    expect(createNotification).not.toHaveBeenCalled();
  });
});
