import { VentasService } from './ventas.service.js';

describe('Ventas: OperationalProject es el maestro único', () => {
  function servicio() {
    const prisma: any = { salesProject: { create: jest.fn().mockResolvedValue({ id: 7, budget: 1, margin: 1, operationalProject: { id: 99 } }), findMany: jest.fn() }, serviceClient: { findFirst: jest.fn().mockResolvedValue({id: 8, name: 'Cliente real'}) }, operationalProject: { findUnique: jest.fn(), update: jest.fn() } };
    const svc = new VentasService(prisma, {} as any, {} as any, {} as any, {} as any, { requestAutoApproval: jest.fn() } as any, {} as any);
    return { svc, prisma };
  }
  it('el alta espera el enlace y devuelve el id operativo', async () => {
    const { svc, prisma } = servicio();
    jest.spyOn(svc, 'getOpportunity').mockResolvedValue({ companyId: 1, client: {id: 4, name: 'Cliente real', serviceClientId: 8} } as any);
    jest.spyOn(svc as any, 'ensureProjectSalesOrder').mockResolvedValue(null);
    jest.spyOn(svc, 'provisionOperationalProject').mockResolvedValue({ operationalProject: { id: 99 } } as any);
    const r = await svc.createProject({ opportunityId: 3, name: 'Obra' } as any, { id: 2 }, 1);
    expect(r.operationalProject!.id).toBe(99);
    expect(prisma.salesProject.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ operationalProject: { create: expect.objectContaining({ companyId: 1, clientId: 8, createdById: 2, status: 'PLANNED' }) } }) }));
    expect(svc.provisionOperationalProject).not.toHaveBeenCalled();
  });
  it('propaga el fallo de la escritura atómica, sin una segunda creación independiente', async () => {
    const { svc, prisma } = servicio();
    jest.spyOn(svc, 'getOpportunity').mockResolvedValue({ companyId: 1, client: {id: 4, name: 'Cliente real', serviceClientId: 8} } as any);
    jest.spyOn(svc as any, 'ensureProjectSalesOrder').mockResolvedValue(null);
    jest.spyOn(svc, 'provisionOperationalProject');
    prisma.salesProject.create.mockRejectedValue(new Error('Escritura atómica rechazada'));
    await expect(svc.createProject({ opportunityId: 3, name: 'Obra' } as any, { id: 2 }, 1)).rejects.toThrow('Escritura atómica rechazada');
    expect(svc.provisionOperationalProject).not.toHaveBeenCalled();
  });
  it('valida el cliente antes de crear el comercial y evita un huérfano de validación', async () => {
    const { svc, prisma } = servicio();
    jest.spyOn(svc, 'getOpportunity').mockResolvedValue({ companyId: 1, client: null } as any);
    await expect(svc.createProject({ opportunityId: 3, name: 'Obra' } as any, { id: 2 }, 1)).rejects.toThrow('cliente real');
    expect(prisma.salesProject.create).not.toHaveBeenCalled();
  });
  it('consultar un espejo nunca reescribe identidad ni estado del maestro', async () => {
    const { svc, prisma } = servicio();
    const op = { id: 99, companyId: 1, title: 'Nombre maestro', status: 'PLANNED' };
    jest.spyOn(svc as any, 'loadSalesProject').mockResolvedValue({ id: 7, companyId: 1, opportunity: { ownerId: 2 } });
    jest.spyOn(svc as any, 'assertOwnerAccess').mockReturnValue(undefined);
    prisma.operationalProject.findUnique.mockResolvedValue(op);
    expect((await svc.provisionOperationalProject(7, { id: 2 }, 1)).operationalProject).toBe(op);
    expect(prisma.operationalProject.update).not.toHaveBeenCalled();
  });
  it('el listado repara únicamente los vínculos faltantes', async () => {
    const { svc, prisma } = servicio();
    jest.spyOn(svc as any, 'buildScopedProjectOwnerWhere').mockReturnValue({});
    prisma.salesProject.findMany.mockResolvedValue([{ id: 7, operationalProject: null }, { id: 8, operationalProject: { id: 100 } }]);
    jest.spyOn(svc, 'provisionOperationalProject').mockResolvedValue({ operationalProject: { id: 99 } } as any);
    const r: any = await svc.listProjects({ id: 2 }, undefined, undefined, 1);
    expect(r.map((p: any) => p.operationalProject.id)).toEqual([99, 100]);
    expect(svc.provisionOperationalProject).toHaveBeenCalledTimes(1);
  });
  it('no permite editar identidad ni estado comercial saltando la ficha maestra', async () => {
    const { svc, prisma } = servicio();
    await expect(svc.updateProject(7, { status: 'CLOSED' } as any, { id: 2 }, 1)).rejects.toThrow('esa ficha es el maestro');
    expect(prisma.operationalProject.update).not.toHaveBeenCalled();
  });
  it('rechaza un vínculo operativo heredado de otra empresa', async () => {
    const { svc, prisma } = servicio();
    jest.spyOn(svc as any, 'loadSalesProject').mockResolvedValue({ id: 7, companyId: 1, opportunity: { ownerId: 2 } });
    jest.spyOn(svc as any, 'assertOwnerAccess').mockReturnValue(undefined);
    prisma.operationalProject.findUnique.mockResolvedValue({ id: 99, companyId: 2 });
    await expect(svc.provisionOperationalProject(7, { id: 2 }, 1)).rejects.toThrow();
    expect(prisma.operationalProject.update).not.toHaveBeenCalled();
  });
  it.each([null, { id: 8, name: 'A QUIEN CORRESPONDA' }])('rechaza el cliente de servicio inexistente, ajeno, inactivo o de relleno (%p)', async (cliente) => {
    const { svc, prisma } = servicio();
    prisma.serviceClient = { findFirst: jest.fn().mockResolvedValue(cliente) };
    prisma.operationalProject.create = jest.fn();
    jest.spyOn(svc as any, 'loadSalesProject').mockResolvedValue({ id: 7, companyId: 1, name: 'Obra', status: 'PLANNED', opportunity: { ownerId: 2, client: { id: 4, name: 'Cliente real', serviceClientId: 8 } } });
    jest.spyOn(svc as any, 'assertOwnerAccess').mockReturnValue(undefined);
    await expect(svc.provisionOperationalProject(7, { id: 2 }, 1)).rejects.toThrow('cliente real y activo de la misma empresa');
    expect(prisma.serviceClient.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 8, companyId: 1, isActive: true } }));
    expect(prisma.operationalProject.create).not.toHaveBeenCalled();
  });
});
