import { ProyectosProfesionalService } from './proyectos-profesional.service.js';
import { ProyectosIncompletosService } from './proyectos-incompletos.service.js';

describe('estándar de proyectos: ligar actividades con aislamiento de empresa', () => {
  const proyecto = { id: 4, companyId: 7, clientId: 10, status: 'ACTIVE', startDate: new Date('2026-11-01'), endDate: new Date('2026-11-30') };
  function preparar() {
    const prisma = { operationalProject: { findFirst: jest.fn().mockResolvedValue(proyecto) }, activity: { findMany: jest.fn().mockResolvedValue([{ id: 12 }]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    (prisma as any).$transaction = (accion: (tx: unknown) => Promise<unknown>) => accion(prisma);
    const servicio = new ProyectosProfesionalService(prisma as any);
    jest.spyOn(servicio, 'detalle').mockResolvedValue({ id: 4 } as any);
    return { servicio, prisma };
  }
  it('liga varias solo del mismo cliente y empresa, sin reasignar las ya ligadas', async () => {
    const { servicio, prisma } = preparar();
    await servicio.ligarActividades(4, [12], 7);
    expect(prisma.activity.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: 7, clientId: 10, projectId: null }) }));
    expect(prisma.activity.updateMany).toHaveBeenCalledWith({ where: { id: { in: [12] }, companyId: 7, clientId: 10, projectId: null }, data: { projectId: 4 } });
  });
  it('rechaza ids ajenos o fuera de la ventana y no escribe ninguno', async () => {
    const { servicio, prisma } = preparar();
    await expect(servicio.ligarActividades(4, [12, 99], 7)).rejects.toThrow('Solo puedes ligar');
    expect(prisma.activity.updateMany).not.toHaveBeenCalled();
  });
  it('rechaza el proyecto de otra empresa', async () => {
    const { servicio, prisma } = preparar();
    await expect(servicio.ligarActividades(4, [12], 9)).rejects.toThrow();
    expect(prisma.activity.updateMany).not.toHaveBeenCalled();
  });
});

describe('avisos diarios: agrupación, nacimiento y escalado', () => {
  const ahora = new Date('2026-11-16T15:00:00Z'); // lunes 09:00 México
  const p = { id: 4, companyId: 7, title: 'Anfora', status: 'ACTIVE', vendorId: 8, createdById: 8, responsableId: 9, client: { id: 10, name: 'Anfora' }, createdAt: new Date('2020-01-01') };
  function preparar(historial: any[] = [], proyectos = [p]) {
    const prisma = {
      operationalProject: { findMany: jest.fn().mockResolvedValue(proyectos), findUnique: jest.fn().mockResolvedValue({ companyId: 7 }) },
      notification: { findMany: jest.fn().mockResolvedValue(historial), update: jest.fn() },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 20 }) },
    };
    const notifications = { createNotification: jest.fn().mockResolvedValue({ id: 1 }) };
    return { servicio: new ProyectosIncompletosService(prisma as any, notifications as any), prisma, notifications };
  }
  it('un proyecto viejo recién detectado no se escala por su edad', async () => {
    const { servicio, notifications } = preparar();
    await servicio.revisar(ahora);
    expect(notifications.createNotification.mock.calls.map(([n]) => n.userId)).toEqual([8, 9]);
  });
  it('escala desde el tercer día hábil consecutivo y agrupa al supervisor', async () => {
    const historial = ['2026-11-13', '2026-11-14'].map((dia, i) => ({ id: i + 1, userId: 8, createdAt: new Date(dia + 'T15:00:00Z'), relatedEntityId: 4, relatedUrl: '/erp/proyectos?proyectos=4,5' }));
    const { servicio, notifications, prisma } = preparar(historial, [p, { ...p, id: 5 }]);
    await servicio.revisar(ahora);
    const copia = notifications.createNotification.mock.calls.filter(([n]) => n.userId === 20);
    expect(copia).toHaveLength(1);
    expect(copia[0][0].relatedUrl).toContain('proyectos=4,5');
    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ roleKey: 'dir_operaciones', companyMemberships: { some: { companyId: 7 } } }) }));
  });
  it('un aviso de ayer UTC pero de hoy México impide otro aviso hoy', async () => {
    const historial = [{ id: 1, userId: 8, createdAt: new Date('2026-11-16T07:00:00Z'), relatedEntityId: 4, relatedUrl: '/erp/proyectos/4?proyectos=4' }];
    const { servicio, notifications } = preparar(historial);
    await servicio.revisar(ahora);
    expect(notifications.createNotification.mock.calls.map(([n]) => n.userId)).toEqual([9]);
  });
  it('agrupa dos altas al nacer sin un segundo aviso del día', async () => {
    const { servicio, prisma, notifications } = preparar([{ id: 1, userId: 8, createdAt: new Date(), relatedEntityId: 4, relatedUrl: '/erp/proyectos/4?proyectos=4' }], [p, { ...p, id: 5 }]);
    await servicio.avisarAlNacer(5);
    expect(prisma.notification.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1 }, data: expect.objectContaining({ relatedUrl: expect.stringContaining('proyectos=4,5') }) }));
    expect(notifications.createNotification.mock.calls.filter(([n]) => n.userId === 8)).toHaveLength(0);
  });
});
