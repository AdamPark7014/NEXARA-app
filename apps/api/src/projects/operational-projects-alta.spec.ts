import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OperationalProjectsService } from './operational-projects.service';

describe('OperationalProjectsService: alta rápida desde una actividad', () => {
  const usuario = { id: 12, isClient: false, isBranchUser: false };

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
        update: jest.fn().mockResolvedValue({}),
      },
      serviceClient: {
        findFirst: jest.fn().mockResolvedValue({ id: 8, name: 'ACME', companyId: 7 }),
        findUnique: jest.fn().mockResolvedValue({ id: 8, name: 'ACME', companyId: 7 }),
        create: jest.fn().mockResolvedValue({ id: 9, name: 'ACME', companyId: 7 }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 12, nombre: 'Israel' }) },
      operationalProject: {
        create: jest.fn().mockResolvedValue(creado),
      },
    };
    return { service: new OperationalProjectsService(prisma, {} as any), prisma, creado };
  }

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

  it('acepta un cliente de otro tipo (queda además como de proyecto) y rechaza otra empresa y una cuenta de portal', async () => {
    // Un cliente puede ser de varios tipos: al comercial se le abre el proyecto, no se le rechaza.
    const comercial = servicio({ id: 4, name: 'ACME', tipo: 'COMERCIAL', companyId: 7, serviceClientId: 8 });
    await expect(
      comercial.service.quickCreate({ title: 'Obra norte', salesClientId: 4 }, usuario, 7),
    ).resolves.toEqual(comercial.creado);
    expect(comercial.prisma.operationalProject.create.mock.calls[0][0].data.clientId).toBe(8);

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
