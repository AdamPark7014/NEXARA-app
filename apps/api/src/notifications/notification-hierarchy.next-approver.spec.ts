import { NotificationHierarchyService } from './notification-hierarchy.service.js';

function crear(usuarios: Array<{ id: number; email?: string; puesto?: string }> = [{ id: 1 }], falla = false) {
  const findMany = jest.fn(async () => {
    if (falla) throw new Error('caída');
    return usuarios.map((u) => ({ email: `persona${u.id}@nexara.com.mx`, ...u }));
  });
  const createNotification = jest.fn(async () => ({}));
  const servicio = new NotificationHierarchyService({ createNotification } as any, {
    user: { findMany }, viatico: { findFirst: jest.fn(async () => ({ companyId: 7 })) },
    vehicleControl: { findFirst: jest.fn(async () => ({ companyId: 7 })) },
  } as any);
  return { servicio, findMany, createNotification };
}

const base = { viaticId: 12, requesterName: 'Mauricio', amount: 3200.5, role: 'ceo', companyId: 7 };

describe('NotificationHierarchyService.notifyViaticNextApprover', () => {
  it('no avisa a cuentas demo, developer o tester', async () => {
    const { servicio, createNotification } = crear([
      { id: 1, email: 'gerencia@nexara.com.mx' }, { id: 2, email: 'developer@nexara.com.mx' },
      { id: 3, email: 'demo@nexara.com.mx' }, { id: 4, email: 'play.review@nexara.com.mx' },
      { id: 5, puesto: 'Tester' },
      { id: 6, email: 'claudia.bernal@nexara.com.mx' },
    ]);
    expect(await servicio.notifyViaticNextApprover(base)).toBe(1);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 1 }));
  });

  it('empresa contradictoria no produce avisos', async () => {
    const { servicio, createNotification } = crear();
    expect(await servicio.notifyViaticNextApprover({ ...base, companyId: 8 })).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('la solicitud avisa a Liz por empresa, en lugar de supervisores genéricos', async () => {
    const { servicio, findMany, createNotification } = crear();
    await servicio.notifyViaticRequested(22, 12, 'Técnico', 100);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { roleKey: 'coord_admin', isActive: true, companyMemberships: { some: { companyId: 7 } } } }));
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ companyId: 7, type: 'VIATICO_ASSIGNED' }));
  });

  it('la solicitud de vehículo avisa a Liz dentro de su empresa', async () => {
    const { servicio, findMany } = crear();
    await servicio.notifyVehicleRequested(22, 15, 'Técnico', 'Unidad');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { roleKey: 'coord_admin', isActive: true, companyMemberships: { some: { companyId: 7 } } } }));
  });
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
