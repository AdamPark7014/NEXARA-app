import { marcarClienteDeProyecto, marcarClienteDeProyectoSinFallar } from './cliente-de-proyecto';
import { OperationalProjectsService } from './operational-projects.service';

/**
 * Abrirle un proyecto a un cliente lo deja como cliente de proyecto en el padrón,
 * venga de donde venga. Así Proyectos y la ficha del cliente leen de la misma lista.
 */
describe('marcarClienteDeProyecto', () => {
  function prisma(delPadron: Array<Record<string, unknown>>, operacion: Record<string, unknown> | null = null) {
    return {
      salesClient: {
        findMany: jest.fn().mockResolvedValue(delPadron),
        create: jest.fn().mockResolvedValue({ id: 50 }),
      },
      salesClientSector: { create: jest.fn().mockResolvedValue({}) },
      serviceClient: { findUnique: jest.fn().mockResolvedValue(operacion) },
    };
  }

  it('al cliente comercial le suma «Proyecto» sin tocar lo demás', async () => {
    const db = prisma([{ id: 4, tipo: 'COMERCIAL', companyId: 7, sectors: [{ sector: 'COMERCIAL' }] }]);
    await marcarClienteDeProyecto(db, 8);
    expect(db.salesClient.findMany.mock.calls[0][0].where).toEqual({ serviceClientId: 8 });
    expect(db.salesClientSector.create).toHaveBeenCalledWith({
      data: { salesClientId: 4, sector: 'PROYECTO', companyId: 7 },
    });
    expect(db.salesClient.create).not.toHaveBeenCalled();
  });

  it('si ya era de proyecto no escribe nada', async () => {
    const db = prisma([{ id: 4, tipo: 'PROYECTO', companyId: 7, sectors: [{ sector: 'PROYECTO' }] }]);
    await marcarClienteDeProyecto(db, 8);
    expect(db.salesClientSector.create).not.toHaveBeenCalled();
    expect(db.salesClient.create).not.toHaveBeenCalled();
  });

  it('un cliente de operación sin ficha en el padrón recibe una, de tipo proyecto', async () => {
    const db = prisma([], {
      id: 8,
      name: 'ACME',
      contactEmail: 'obra@acme.mx',
      contactPhone: null,
      address: 'Av. Juárez 1',
      isActive: true,
      companyId: 7,
    });
    await marcarClienteDeProyecto(db, 8, 12);
    expect(db.salesClient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'ACME',
        billingEmail: 'obra@acme.mx',
        fiscalAddress: 'Av. Juárez 1',
        status: 'Activo',
        ownerId: 12,
        serviceClientId: 8,
        companyId: 7,
        tipo: 'PROYECTO',
        sectors: { create: [{ sector: 'PROYECTO', companyId: 7 }] },
      }),
    });
  });

  it('un fallo al marcar no tumba el alta del proyecto', async () => {
    const db = prisma([]);
    db.salesClient.findMany.mockRejectedValue(new Error('sin conexión'));
    await expect(marcarClienteDeProyectoSinFallar(db, 8)).resolves.toBeUndefined();
  });
});

describe('alta rápida de proyecto para cualquier cliente del padrón', () => {
  it('a un cliente comercial se le abre el proyecto y queda marcado como de proyecto', async () => {
    const creado = { id: 3, title: 'Obra norte', status: 'ACTIVE', clientId: 8, salesProjectId: 31, client: { id: 8, name: 'ACME' } };
    const db: any = {
      salesClient: {
        findFirst: jest.fn().mockResolvedValue({ id: 4, name: 'ACME', tipo: 'COMERCIAL', companyId: 7, serviceClientId: 8 }),
        findMany: jest.fn().mockResolvedValue([{ id: 4, tipo: 'COMERCIAL', companyId: 7, sectors: [{ sector: 'COMERCIAL' }] }]),
        update: jest.fn().mockResolvedValue({}),
      },
      salesClientSector: { create: jest.fn().mockResolvedValue({}) },
      serviceClient: {
        findFirst: jest.fn().mockResolvedValue({ id: 8, name: 'ACME', companyId: 7 }),
        findUnique: jest.fn().mockResolvedValue({ id: 8, name: 'ACME', companyId: 7 }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 12, nombre: 'Israel' }) },
      operationalProject: { create: jest.fn().mockResolvedValue(creado) },
    };
    const service = new OperationalProjectsService(db, {} as any);
    const res = await service.quickCreate({ title: 'Obra norte', salesClientId: 4 }, { id: 12 }, 7);
    expect(res).toEqual(creado);
    expect(db.operationalProject.create.mock.calls[0][0].data.clientId).toBe(8);
    expect(db.salesClientSector.create).toHaveBeenCalledWith({
      data: { salesClientId: 4, sector: 'PROYECTO', companyId: 7 },
    });
  });
});
