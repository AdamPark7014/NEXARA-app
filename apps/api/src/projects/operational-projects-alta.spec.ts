import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OperationalProjectsService } from './operational-projects.service';

/** Técnico de campo: crea actividades, no edita el padrón. */
const usuario = { id: 12, email: 'israel.ramos@nexara.com.mx', roleKey: 'ing_campo', isClient: false, isBranchUser: false };
/** Coordinador de operaciones (matriz: proyecto y comercial): administra el padrón. */
const coordinador = { id: 10, email: 'operaciones@nexara.com.mx', roleKey: 'coord_operaciones', isClient: false, isBranchUser: false };
const vendedor = { id: 99, email: 'ventas.norte@nexara.com.mx', roleKey: 'vendedor', isClient: false, isBranchUser: false };

function servicio(sales: Record<string, unknown> | null) {
  const creado = {
    id: 3,
    title: 'Obra norte',
    status: 'ACTIVE',
    clientId: 8,
    client: { id: 8, name: 'ACME' },
  };
  const prisma: any = {
    salesClient: {
      findFirst: jest.fn().mockResolvedValue(sales),
      // Lo que `marcarClienteDeProyecto` busca por cliente de operación.
      findMany: jest.fn().mockResolvedValue(sales ? [sales] : []),
      update: jest.fn().mockResolvedValue({}),
    },
    salesClientSector: { create: jest.fn().mockResolvedValue({}) },
    serviceClient: {
      findFirst: jest.fn().mockResolvedValue({ id: 8, name: 'ACME', companyId: 7 }),
      findUnique: jest.fn().mockResolvedValue({ id: 8, name: 'ACME', companyId: 7 }),
      create: jest.fn().mockResolvedValue({ id: 9, name: 'ACME', companyId: 7 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 12, nombre: 'Israel' }),
      count: jest.fn().mockResolvedValue(0),
    },
    operationalProject: {
      create: jest.fn().mockResolvedValue(creado),
    },
  };
  return { service: new OperationalProjectsService(prisma, {} as any), prisma, creado };
}

describe('OperationalProjectsService: alta rápida desde una actividad', () => {

  it('crea el proyecto en la empresa, con el usuario como responsable y el cliente de operación', async () => {
    const { service, prisma, creado } = servicio({
      id: 4,
      name: 'ACME',
      tipo: 'PROYECTO',
      companyId: 7,
      serviceClientId: 8,
    });
    const res = await service.quickCreate({ title: '  Obra norte  ', salesClientId: 4 }, usuario, 7);
    expect(res).toEqual(creado);
    expect(prisma.operationalProject.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        title: 'Obra norte',
        clientId: 8,
        vendorId: 12,
        companyId: 7,
        status: 'ACTIVE',
        projectType: 'OTRO',
      }),
    );
    expect(prisma.salesClient.findFirst.mock.calls[0][0].where.companyId).toBe(7);
    expect(prisma.operationalProject.create.mock.calls[0][0].data.startDate).toBeNull();
  });

  it('provisiona el cliente de operación si el padrón todavía no lo tiene', async () => {
    const { service, prisma } = servicio({
      id: 4,
      name: 'ACME',
      tipo: 'PROYECTO',
      companyId: 7,
      serviceClientId: null,
    });
    await service.quickCreate({ title: 'Obra norte', salesClientId: 4 }, usuario, 7);
    expect(prisma.serviceClient.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ companyId: 7, name: 'ACME' }) }),
    );
    expect(prisma.operationalProject.create.mock.calls[0][0].data.clientId).toBe(9);
  });

  it('a un cliente de otro tipo le abre el proyecto quien administra el padrón (queda además de proyecto); rechaza otra empresa y una cuenta de portal', async () => {
    // Un cliente puede ser de varios tipos: al comercial se le abre el proyecto y se le suma
    // «Proyecto», con la misma regla que sumarle el tipo desde su ficha.
    const comercial = servicio({ id: 4, name: 'ACME', tipo: 'COMERCIAL', companyId: 7, serviceClientId: 8, ownerId: 99 });
    await expect(
      comercial.service.quickCreate({ title: 'Obra norte', salesClientId: 4 }, coordinador, 7),
    ).resolves.toEqual(comercial.creado);
    expect(comercial.prisma.operationalProject.create.mock.calls[0][0].data.clientId).toBe(8);
    expect(comercial.prisma.operationalProject.create.mock.calls[0][0].data.vendorId).toBe(10);
    expect(comercial.prisma.salesClientSector.create).toHaveBeenCalledWith({
      data: { salesClientId: 4, sector: 'PROYECTO', companyId: 7 },
    });

    const ajeno = servicio(null);
    await expect(ajeno.service.quickCreate({ title: 'Obra norte', salesClientId: 4 }, usuario, 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const portal = servicio({ id: 4, name: 'ACME', tipo: 'PROYECTO', companyId: 7, serviceClientId: 8 });
    await expect(
      portal.service.quickCreate({ title: 'Obra norte', salesClientId: 4 }, { id: 3, isClient: true }, 7),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

/**
 * Abrirle un proyecto a un cliente lo dejaba como cliente de proyecto sin preguntar quién lo
 * abría: con solo ver actividades, cualquiera volvía visible para toda la empresa el comercial
 * de otro vendedor (y ya con proyecto, el tipo no se quita). Ahora pide lo mismo que sumarle
 * el tipo desde la ficha.
 */
describe('OperationalProjectsService: abrir un proyecto no destapa clientes del padrón', () => {
  const comercialAjeno = {
    id: 4,
    name: 'ACME',
    tipo: 'COMERCIAL',
    sectors: [{ sector: 'COMERCIAL' }],
    companyId: 7,
    serviceClientId: 8,
    ownerId: 99,
  };

  it('alta rápida: un técnico no abre proyecto sobre un comercial ajeno (403) y no se le suma PROYECTO', async () => {
    const { service, prisma } = servicio(comercialAjeno);
    await expect(service.quickCreate({ title: 'Obra norte', salesClientId: 4 }, usuario, 7)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.operationalProject.create).not.toHaveBeenCalled();
    expect(prisma.salesClientSector.create).not.toHaveBeenCalled();
  });

  it('alta rápida: el vendedor dueño lo ve, pero sumarle PROYECTO es editar el padrón: se rechaza con el motivo', async () => {
    const { service, prisma } = servicio(comercialAjeno);
    await expect(service.quickCreate({ title: 'Obra norte', salesClientId: 4 }, vendedor, 7)).rejects.toThrow(
      /aún no es cliente de proyecto/,
    );
    expect(prisma.operationalProject.create).not.toHaveBeenCalled();
    expect(prisma.salesClientSector.create).not.toHaveBeenCalled();
  });

  it('alta rápida: si el cliente ya es de proyecto, quien crea actividades le abre el proyecto sin permiso extra', async () => {
    const { service, prisma, creado } = servicio({
      ...comercialAjeno,
      sectors: [{ sector: 'COMERCIAL' }, { sector: 'PROYECTO' }],
    });
    await expect(service.quickCreate({ title: 'Obra norte', salesClientId: 4 }, usuario, 7)).resolves.toEqual(creado);
    expect(prisma.salesClientSector.create).not.toHaveBeenCalled();
  });

  it('alta completa: el proyecto se crea igual, pero PROYECTO solo se le suma si quien crea administra el padrón', async () => {
    const porTecnico = servicio(comercialAjeno);
    await porTecnico.service.create({ title: 'Obra norte', clientId: 8 } as any, usuario.id, usuario);
    expect(porTecnico.prisma.operationalProject.create).toHaveBeenCalledTimes(1);
    expect(porTecnico.prisma.salesClientSector.create).not.toHaveBeenCalled();

    const porCoordinador = servicio(comercialAjeno);
    await porCoordinador.service.create({ title: 'Obra norte', clientId: 8 } as any, coordinador.id, coordinador);
    expect(porCoordinador.prisma.operationalProject.create).toHaveBeenCalledTimes(1);
    expect(porCoordinador.prisma.salesClientSector.create).toHaveBeenCalledWith({
      data: { salesClientId: 4, sector: 'PROYECTO', companyId: 7 },
    });
  });

  it('alta completa sin actor (solo el id): no se le suma el tipo a nadie', async () => {
    const { service, prisma } = servicio(comercialAjeno);
    await service.create({ title: 'Obra norte', clientId: 8 } as any, coordinador.id);
    expect(prisma.operationalProject.create).toHaveBeenCalledTimes(1);
    expect(prisma.salesClientSector.create).not.toHaveBeenCalled();
  });
});
