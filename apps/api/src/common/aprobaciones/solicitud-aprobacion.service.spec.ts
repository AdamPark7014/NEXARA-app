import { SolicitudAprobacionService } from './solicitud-aprobacion.service.js';

function crear() {
  const prisma: any = {
    user: {
      findMany: jest.fn().mockResolvedValue([{ id: 1, email: 'gerencia@nexara.com.mx', puesto: 'CEO', nombre: 'Christian' }]),
      findFirst: jest.fn().mockResolvedValue({ roleKey: 'ceo', id: 20, nombre: 'Luis', email: 'luis@nexara.com.mx', puesto: 'Supervisor' }),
    },
    solicitudAprobacionRh: {
      findFirst: jest.fn().mockResolvedValue(null),
      findFirstOrThrow: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  prisma.$transaction = jest.fn((cb: any) => cb(prisma));
  prisma.$executeRaw = jest.fn().mockResolvedValue([]);
  prisma.user.update = jest.fn().mockResolvedValue({});
  prisma.userProfile = {upsert: jest.fn().mockResolvedValue({})};
  prisma.empleadoEvento = {create: jest.fn().mockResolvedValue({})};
  prisma.leaveRequest = {updateMany: jest.fn().mockResolvedValue({count: 1})};
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const notifications = { createNotification: jest.fn().mockResolvedValue({ id: 1 }) };
  const servicio = new SolicitudAprobacionService(prisma, audit as any, notifications as any);
  return { servicio, prisma, audit, notifications };
}

describe('SolicitudAprobacionService', () => {
  it('crear deja pendiente y avisa al aprobador', async () => {
    const { servicio, prisma, notifications } = crear();
    prisma.solicitudAprobacionRh.create.mockResolvedValue({
      id: 3,
      tipo: 'CAMBIO_PUESTO',
      estado: 'PENDIENTE',
      user: { id: 50, nombre: 'Ana', email: 'ana@example.org' },
      solicitadoPor: { id: 10, nombre: 'Tere' },
    });
    const out = await servicio.crear({
      companyId: 7,
      tipo: 'CAMBIO_PUESTO',
      userId: 50,
      solicitadoPorId: 10,
      aprobadorActualId: 1,
      payload: { puestoAnterior: 'Ayudante', puestoNuevo: 'Técnico' },
      aviso: { title: 'Cambio de puesto', message: 'Revisa el cambio de Ana.' },
    });
    expect(out.estado).toBe('PENDIENTE');
    expect(notifications.createNotification).toHaveBeenCalled();
    expect(prisma.solicitudAprobacionRh.create.mock.calls[0][0].data.estado).toBe('PENDIENTE');
  });

  it('decidir dos veces no duplica: la segunda falla', async () => {
    const { servicio, prisma, notifications } = crear();
    prisma.solicitudAprobacionRh.findFirst.mockResolvedValue({
      id: 3,
      userId: 50,
      companyId: 7,
      estado: 'PENDIENTE',
      solicitadoPorId: 10,
      tipo: 'AJUSTE_SUELDO',
      user: { id: 50, nombre: 'Ana' },
    });
    prisma.solicitudAprobacionRh.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.solicitudAprobacionRh.findFirstOrThrow.mockResolvedValue({
      id: 3,
      estado: 'APROBADA',
      user: { id: 50, nombre: 'Ana' },
      solicitadoPor: { id: 10, nombre: 'Tere' },
      decididoPor: { id: 1, nombre: 'Christian' },
    });
    await servicio.decidir(3, 7, 1, 'APROBADA');
    expect(notifications.createNotification).toHaveBeenCalled();

    prisma.solicitudAprobacionRh.findFirst.mockResolvedValue({
      id: 3,
      userId: 50,
      companyId: 7,
      estado: 'PENDIENTE',
      solicitadoPorId: 10,
      tipo: 'AJUSTE_SUELDO',
      user: { id: 50, nombre: 'Ana' },
    });
    prisma.solicitudAprobacionRh.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(servicio.decidir(3, 7, 1, 'APROBADA')).rejects.toThrow(/cambió de estado/);
  });

  it('escalarPendientes24h sube de jefe a supervisor general', async () => {
    const { servicio, prisma, notifications } = crear();
    const hace25h = new Date(Date.now() - 25 * 60 * 60 * 1000);
    prisma.user.findMany.mockResolvedValue([{id: 20, nombre: 'Luis', email: 'supervisor@empresa.mx', puesto: 'Supervisor'}]);
    prisma.solicitudAprobacionRh.findMany.mockResolvedValue([
      {
        id: 9,
        companyId: 7,
        tipo: 'VACACIONES',
        estado: 'PENDIENTE',
        escaladoNivel: 0,
        escaladoAt: null,
        createdAt: hace25h,
        solicitadoPorId: 50,
        aprobadorActualId: 8,
        user: { nombre: 'Ana' },
      },
    ]);
    prisma.solicitudAprobacionRh.updateMany.mockResolvedValue({ count: 1 });
    await servicio.escalarPendientes24h();
    expect(prisma.solicitudAprobacionRh.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ escaladoNivel: 1, aprobadorActualId: 20 }),
      }),
    );
    expect(notifications.createNotification).toHaveBeenCalled();
  });
});


describe('Aprobaciones RH: atomicidad y acceso', () => {
  const solicitud = {id: 3, companyId: 7, userId: 50, estado: 'PENDIENTE', solicitadoPorId: 10,
    aprobadorActualId: 8, tipo: 'CAMBIO_PUESTO', payload: {puestoNuevo: 'Técnico'}, user: {id: 50, nombre: 'Persona ficticia'}};

  it('un jefe no puede aprobar cambios de puesto aunque figure como aprobador', async () => {
    const {servicio, prisma, notifications} = crear();
    prisma.user.findFirst.mockResolvedValue({id: 8, roleKey: 'coord_operaciones'});
    prisma.solicitudAprobacionRh.findFirst.mockResolvedValue(solicitud);
    await expect(servicio.decidir(3, 7, 8, 'APROBADA')).rejects.toThrow(/No te corresponde/);
    expect(prisma.solicitudAprobacionRh.updateMany).not.toHaveBeenCalled();
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  it('aplica puesto e historial dentro de la transacción antes de avisar', async () => {
    const {servicio, prisma, notifications} = crear();
    prisma.solicitudAprobacionRh.findFirst.mockResolvedValue(solicitud);
    prisma.solicitudAprobacionRh.findFirstOrThrow.mockResolvedValue({...solicitud, estado: 'APROBADA'});
    await servicio.decidir(3, 7, 1, 'APROBADA');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith({where: {id: 50}, data: {puesto: 'Técnico'}});
    expect(prisma.empleadoEvento.create).toHaveBeenCalledWith(expect.objectContaining({data: expect.objectContaining({companyId: 7, userId: 50, tipo: 'CAMBIO_PUESTO'})}));
    expect(prisma.empleadoEvento.create.mock.invocationCallOrder[0]).toBeLessThan(notifications.createNotification.mock.invocationCallOrder[0]);
  });

  it('revierte estado si falla la escritura y no avisa un éxito inexistente', async () => {
    const {servicio, prisma, notifications, audit} = crear();
    let estado = 'PENDIENTE';
    prisma.$transaction.mockImplementation(async (callback: any) => {
      const anterior = estado;
      try { return await callback(prisma); } catch (error) { estado = anterior; throw error; }
    });
    prisma.solicitudAprobacionRh.findFirst.mockResolvedValue(solicitud);
    prisma.solicitudAprobacionRh.updateMany.mockImplementation(async () => {estado = 'APROBADA'; return {count: 1};});
    prisma.user.update.mockRejectedValue(new Error('fallo simulado'));
    await expect(servicio.decidir(3, 7, 1, 'APROBADA')).rejects.toThrow('fallo simulado');
    expect(estado).toBe('PENDIENTE');
    expect(notifications.createNotification).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('rechazo de dirección también actualiza el permiso y no permite decidirlo otra vez', async () => {
    const {servicio, prisma} = crear();
    prisma.solicitudAprobacionRh.findFirst.mockResolvedValue({...solicitud, tipo: 'VACACIONES', leaveRequestId: 90});
    await servicio.decidir(3, 7, 1, 'RECHAZADA', 'Sin cobertura');
    expect(prisma.leaveRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({where: {id: 90, companyId: 7, userId: 50, status: 'PENDING'}, data: expect.objectContaining({status: 'REJECTED', rejectionReason: 'Sin cobertura'})}));
    prisma.solicitudAprobacionRh.findFirst.mockResolvedValue({...solicitud, estado: 'RECHAZADA'});
    await expect(servicio.decidir(3, 7, 1, 'APROBADA')).rejects.toThrow(/cambió de estado/);
    expect(prisma.leaveRequest.updateMany).toHaveBeenCalledTimes(1);
  });

  it('no permite decidir desde otra empresa', async () => {
    const {servicio, prisma} = crear();
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(servicio.decidir(3, 99, 1, 'APROBADA')).rejects.toThrow(/empresa/);
    expect(prisma.solicitudAprobacionRh.updateMany).not.toHaveBeenCalled();
  });

  it('no crea solicitudes con referencias de otra empresa', async () => {
    const {servicio, prisma} = crear();
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(servicio.crear({companyId: 7, tipo: 'CAMBIO_PUESTO', userId: 50, solicitadoPorId: 10, payload: {puestoNuevo: 'Técnico'}})).rejects.toThrow(/empresa/);
    expect(prisma.solicitudAprobacionRh.create).not.toHaveBeenCalled();
  });

  it('filtra developer, tester y demo en todos los avisos', async () => {
    const {servicio, prisma, notifications} = crear();
    prisma.user.findMany.mockResolvedValue([
      {id: 1, email: 'developer@nexara.com.mx'}, {id: 2, email: 'claudia.bernal@nexara.com.mx'},
      {id: 3, email: 'demo@empresa.mx'}, {id: 4, email: 'personal@empresa.mx'},
    ]);
    await servicio.avisar([1, 2, 3, 4], {type: 'RH_PRUEBA', title: 'Prueba', message: 'Prueba ficticia', triggerUserId: 10, relatedEntityId: 3, companyId: 7});
    expect(notifications.createNotification).toHaveBeenCalledTimes(1);
    expect(notifications.createNotification).toHaveBeenCalledWith(expect.objectContaining({userId: 4, companyId: 7}));
  });
});
