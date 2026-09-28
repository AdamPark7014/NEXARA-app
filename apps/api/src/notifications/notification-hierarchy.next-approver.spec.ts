import { NotificationHierarchyService } from './notification-hierarchy.service.js';

function crear(usuarios: Array<{ id: number }> = [{ id: 1 }], falla = false) {
  const findMany = jest.fn(async () => {
    if (falla) throw new Error('caída');
    return usuarios;
  });
  const createNotification = jest.fn(async () => ({}));
  const servicio = new NotificationHierarchyService({ createNotification } as any, { user: { findMany } } as any);
  return { servicio, findMany, createNotification };
}

const base = { viaticId: 12, requesterName: 'Mauricio', amount: 3200.5, role: 'ceo', companyId: 7 };

describe('NotificationHierarchyService.notifyViaticNextApprover', () => {
  it('avisa con prioridad alta a quien le toca el siguiente paso, con el monto y quién lo pidió', async () => {
    const { servicio, createNotification } = crear([{ id: 1 }, { id: 2 }]);
    expect(await servicio.notifyViaticNextApprover(base)).toBe(2);
    expect(createNotification).toHaveBeenCalledTimes(2);
    const arg = (createNotification.mock.calls[0] as any[])[0];
    expect(arg).toMatchObject({
      userId: 1,
      type: 'VIATICO_ASSIGNED',
      category: 'viatics',
      priority: 'high',
      relatedEntityId: 12,
      companyId: 7,
    });
    expect(arg.message).toContain('Mauricio');
    expect(arg.message).toContain('$3200.50');
  });

  it('busca por rol dentro de la empresa y, si el paso es del CEO, también al dueño de la plataforma', async () => {
    const { servicio, findMany } = crear();
    await servicio.notifyViaticNextApprover(base);
    const where = (findMany.mock.calls[0] as any[])[0].where;
    expect(where.isActive).toBe(true);
    expect(where.companyMemberships).toEqual({ some: { companyId: 7 } });
    expect(where.OR[0]).toEqual({ roleKey: 'ceo' });
    expect(where.OR).toHaveLength(2);
  });

  it('un paso que no es del CEO se busca solo por rol', async () => {
    const { servicio, findMany } = crear();
    await servicio.notifyViaticNextApprover({ ...base, role: 'dir_admin' });
    expect((findMany.mock.calls[0] as any[])[0].where.OR).toEqual([{ roleKey: 'dir_admin' }]);
  });

  it('un fallo no rompe el flujo de aprobación', async () => {
    const { servicio, createNotification } = crear([{ id: 1 }], true);
    expect(await servicio.notifyViaticNextApprover(base)).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
  });
});
