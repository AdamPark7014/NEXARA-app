/**
 * Un solo padrón de clientes, y cada cliente puede ser de proyecto, corporativo y
 * comercial a la vez.
 *
 * Lo que se cuida aquí: que el alta (la completa, la de una cotización y la rápida de una
 * actividad) no duplique a un cliente que ya existe, que sumar un tipo no le quite los
 * que tenía, y que las listas y selectores lean la membresía y no un único tipo.
 */
import { BadRequestException } from '@nestjs/common';
import { VentasService } from './ventas.service.js';
import { VentasClientesController } from './ventas-clientes.controller.js';
import { filtroPorSector, sectoresDelCliente } from './client-sectors.js';
import { PERMISSIONS } from '../common/permissions.js';

const CHRISTIAN = { id: 1, email: 'gerencia@nexara.com.mx', roleKey: 'ceo', isSuperAdmin: true };
const DAVID = { id: 10, email: 'operaciones@nexara.com.mx', roleKey: 'coord_operaciones' };
const DANIELA = { id: 15, email: 'daniela.hernandez@nexara.com.mx', roleKey: 'administrativo' };
const PAULINA = { id: 16, email: 'finanzas@nexara.com.mx', roleKey: 'administrativo' };
const TECNICO = { id: 12, email: 'israel.ramos@nexara.com.mx', roleKey: 'ing_campo' };
const LUIS = { id: 11, email: 'direccion.operaciones@nexara.com.mx', roleKey: 'dir_operaciones' };

type Fila = Record<string, any>;

function armar(opts: { enPadron?: Fila[]; cliente?: Fila; proyectos?: number } = {}) {
  const cliente: Fila = {
    id: 5,
    name: 'Plaza Dorada',
    status: 'Activo',
    ownerId: 99,
    companyId: 7,
    serviceClientId: 80,
    tipo: 'COMERCIAL',
    sectors: [{ sector: 'COMERCIAL' }],
    ...opts.cliente,
  };
  const prisma = {
    user: { count: jest.fn().mockResolvedValue(0) },
    salesClient: {
      findFirst: jest.fn().mockResolvedValue(cliente),
      findMany: jest.fn().mockResolvedValue(opts.enPadron ?? []),
      create: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 9, serviceClientId: null, ...data, sectors: data.sectors?.create ?? [] }),
      ),
      update: jest.fn().mockImplementation(({ where, data }: any) => {
        const base = (opts.enPadron ?? []).find((c) => c.id === where.id) ?? cliente;
        const { sectors, ...resto } = data;
        return Promise.resolve({
          ...base,
          ...resto,
          sectors: [...(base.sectors ?? []), ...(sectors?.create ?? [])],
        });
      }),
    },
    salesClientSector: {
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    serviceClient: {
      findUnique: jest.fn().mockResolvedValue({ id: 80, name: 'Plaza Dorada' }),
      create: jest.fn().mockResolvedValue({ id: 81, name: 'Nuevo', accountCode: 'SC-9' }),
    },
    operationalProject: { count: jest.fn().mockResolvedValue(opts.proyectos ?? 0) },
  };
  const service = new VentasService(
    prisma as any,
    {} as any,
    {} as any,
    { notifySalesClientCreated: jest.fn().mockResolvedValue(undefined) } as any,
    {} as any,
    { publishEntityLifecycle: jest.fn() } as any,
    {} as any,
  );
  return { service, prisma, cliente };
}

describe('clientes: varios tipos a la vez', () => {
  it('los tipos de un cliente salen de su membresía y de su tipo principal', () => {
    expect(sectoresDelCliente({ tipo: 'PROYECTO', sectors: [{ sector: 'PROYECTO' }, { sector: 'COMERCIAL' }] })).toEqual([
      'PROYECTO',
      'COMERCIAL',
    ]);
    // Altas viejas guardaban el tipo sin su fila de membresía: cuenta igual.
    expect(sectoresDelCliente({ tipo: 'CORPORATIVO', sectors: [] })).toEqual(['CORPORATIVO']);
    expect(sectoresDelCliente(null)).toEqual([]);
  });

  it('la lista de un tipo trae a quien lo tiene como principal o como uno más', async () => {
    const { service, prisma } = armar();
    await service.listClients(DAVID, undefined, { sector: 'PROYECTO' } as any, 7);
    const where = prisma.salesClient.findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe(7);
    expect(where.AND).toEqual([filtroPorSector('PROYECTO')]);
    expect(where.AND[0].OR).toEqual([{ tipo: 'PROYECTO' }, { sectors: { some: { sector: 'PROYECTO' } } }]);
    // Antes filtraba `tipo = PROYECTO` y el cliente que además era comercial desaparecía.
    expect(where.tipo).toBeUndefined();
  });

  it('el alta completa guarda todos los tipos elegidos, con el principal primero', async () => {
    const { service, prisma } = armar();
    await service.createClient(
      { name: 'Hotel Centro', tipo: 'PROYECTO', sectors: ['COMERCIAL', 'PROYECTO'] } as any,
      DAVID,
      7,
    );
    const data = prisma.salesClient.create.mock.calls[0][0].data;
    expect(data.tipo).toBe('PROYECTO');
    expect(data.sectors.create).toEqual([
      { sector: 'PROYECTO', companyId: 7 },
      { sector: 'COMERCIAL', companyId: 7 },
    ]);
  });

  it('no deja sumar en el alta un tipo que no es del área de quien captura', async () => {
    const { service, prisma } = armar();
    await expect(
      service.createClient({ name: 'Otro', tipo: 'COMERCIAL', sectors: ['COMERCIAL', 'PROYECTO'] } as any, DANIELA, 7),
    ).rejects.toThrow(/PROYECTO/);
    expect(prisma.salesClient.create).not.toHaveBeenCalled();
  });

  it('sumar un tipo no quita los que ya tenía ni cambia el principal', async () => {
    const { service, prisma } = armar();
    await service.addClientSector(5, 'PROYECTO', DAVID, 7);
    expect(prisma.salesClientSector.create).toHaveBeenCalledWith({
      data: { salesClientId: 5, sector: 'PROYECTO', companyId: 7 },
    });
    expect(prisma.salesClientSector.deleteMany).not.toHaveBeenCalled();
    expect(prisma.salesClient.update).not.toHaveBeenCalled();
  });

  it('quitar un tipo deja al menos uno y, si era el principal, pasa a serlo otro', async () => {
    const solo = armar();
    await expect(solo.service.removeClientSector(5, 'COMERCIAL', CHRISTIAN, 7)).rejects.toThrow(BadRequestException);
    expect(solo.prisma.salesClientSector.deleteMany).not.toHaveBeenCalled();

    const dos = armar({ cliente: { sectors: [{ sector: 'COMERCIAL' }, { sector: 'CORPORATIVO' }] } });
    await dos.service.removeClientSector(5, 'COMERCIAL', CHRISTIAN, 7);
    expect(dos.prisma.salesClientSector.deleteMany).toHaveBeenCalledWith({
      where: { salesClientId: 5, sector: 'COMERCIAL' },
    });
    expect(dos.prisma.salesClient.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { tipo: 'CORPORATIVO' } });
  });

  it('no deja quitar «Proyecto» a un cliente que tiene proyectos', async () => {
    const { service, prisma } = armar({
      cliente: { tipo: 'PROYECTO', sectors: [{ sector: 'PROYECTO' }, { sector: 'COMERCIAL' }] },
      proyectos: 2,
    });
    await expect(service.removeClientSector(5, 'PROYECTO', CHRISTIAN, 7)).rejects.toThrow(/2 proyectos/);
    expect(prisma.operationalProject.count).toHaveBeenCalledWith({ where: { clientId: 80, deletedAt: null } });
    expect(prisma.salesClientSector.deleteMany).not.toHaveBeenCalled();
  });
});

describe('clientes: un solo padrón, sin duplicar', () => {
  const EXISTENTE = {
    id: 40,
    name: 'Plaza Norte',
    legalName: 'Plaza Norte SA de CV',
    taxId: null,
    billingEmail: 'pagos@plazanorte.mx',
    billingPhone: null,
    status: 'Activo',
    ownerId: 10,
    companyId: 7,
    serviceClientId: 70,
    tipo: 'PROYECTO',
    sectors: [{ sector: 'PROYECTO' }],
  };

  it('el alta rápida de un servicio reutiliza al cliente que ya existe y, si quien la hace administra el padrón, le suma el tipo', async () => {
    // Luis lleva corporativo y dirige operaciones: sumar CORPORATIVO es lo mismo que haría desde la ficha.
    const { service, prisma } = armar({ enPadron: [EXISTENTE] });
    const res = await service.createClient(
      { name: '  plaza   NORTE ', tipo: 'CORPORATIVO', altaRapida: true, billingPhone: '2221234567', billingEmail: 'otro@x.mx' } as any,
      LUIS,
      7,
    );
    // Se busca sin distinguir mayúsculas ni espacios de más, y dentro de la empresa.
    expect(prisma.salesClient.findMany.mock.calls[0][0].where).toEqual({
      companyId: 7,
      name: { equals: 'plaza NORTE', mode: 'insensitive' },
    });
    expect(prisma.salesClient.create).not.toHaveBeenCalled();
    const { where, data } = prisma.salesClient.update.mock.calls[0][0];
    expect(where).toEqual({ id: 40 });
    expect(data.sectors).toEqual({ create: [{ sector: 'CORPORATIVO', companyId: 7 }] });
    // Completa lo que estaba vacío; lo ya capturado no se pisa.
    expect(data.billingPhone).toBe('2221234567');
    expect(data.billingEmail).toBeUndefined();
    expect(res.id).toBe(40);
    expect(sectoresDelCliente(res)).toEqual(['PROYECTO', 'CORPORATIVO']);
  });

  it('la misma alta rápida hecha por un operativo reutiliza al cliente tal cual: ni tipo ni datos', async () => {
    // Lo ve (es de proyecto, de toda la empresa) pero no edita el padrón: sale de aquí con el id y nada más.
    const { service, prisma } = armar({ enPadron: [EXISTENTE] });
    const res = await service.createClient(
      { name: 'Plaza Norte', tipo: 'CORPORATIVO', altaRapida: true, billingPhone: '2221234567' } as any,
      TECNICO,
      7,
    );
    expect(prisma.salesClient.create).not.toHaveBeenCalled();
    expect(prisma.salesClient.update).not.toHaveBeenCalled();
    expect(res).toBe(EXISTENTE);
  });

  it('el alta desde una cotización tampoco duplica: el cliente de proyecto queda además comercial', async () => {
    const { service, prisma } = armar({ enPadron: [EXISTENTE] });
    const res = await service.createClient(
      { name: 'Plaza Norte', tipo: 'COMERCIAL', sectors: ['COMERCIAL'], status: 'Activo', legalName: 'Otra razón' } as any,
      DANIELA,
      7,
    );
    expect(prisma.salesClient.create).not.toHaveBeenCalled();
    const { data } = prisma.salesClient.update.mock.calls[0][0];
    expect(data.sectors).toEqual({ create: [{ sector: 'COMERCIAL', companyId: 7 }] });
    expect(data.legalName).toBeUndefined();
    expect(res.id).toBe(40);
  });

  it('si ya tenía ese tipo y no hay nada que completar, lo devuelve tal cual', async () => {
    const { service, prisma } = armar({ enPadron: [EXISTENTE] });
    const res = await service.createClient({ name: 'Plaza Norte', altaProyecto: true } as any, TECNICO, 7);
    expect(prisma.salesClient.create).not.toHaveBeenCalled();
    expect(prisma.salesClient.update).not.toHaveBeenCalled();
    expect(res).toBe(EXISTENTE);
  });

  it('un cliente inactivo con el mismo nombre no se revive: se da de alta otro', async () => {
    const { service, prisma } = armar({ enPadron: [{ ...EXISTENTE, status: 'Inactivo' }] });
    await service.createClient({ name: 'Plaza Norte', altaProyecto: true } as any, TECNICO, 7);
    expect(prisma.salesClient.create).toHaveBeenCalled();
    expect(prisma.salesClient.update.mock.calls.every(([arg]: any[]) => !arg.data.sectors)).toBe(true);
  });

  it('el cliente comercial también nace con su cliente de operación, para poder elegirlo en una actividad', async () => {
    const { service, prisma } = armar();
    const res = await service.createClient(
      { name: 'Nuevo Comercial', tipo: 'COMERCIAL', sectors: ['COMERCIAL'] } as any,
      DANIELA,
      7,
    );
    expect(prisma.serviceClient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Nuevo Comercial', companyId: 7, accountCode: 'SC-9', isActive: true }),
    });
    expect(prisma.salesClient.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 9 }, data: { serviceClientId: 81 } }),
    );
    expect(res.serviceClientId).toBe(81);
  });
});

describe('clientes: quién abre y quién edita los tipos', () => {
  it('quien administra el padrón abre un cliente comercial que dio de alta otra persona', async () => {
    // Paulina no está en la matriz de correos; entra por su rol (administrativo → comercial).
    const { service } = armar();
    await expect(service.getClient(5, PAULINA, 7)).resolves.toEqual(expect.objectContaining({ id: 5 }));
    // Un operativo sigue sin abrir un comercial ajeno.
    await expect(service.getClient(5, TECNICO, 7)).rejects.toThrow('No tienes acceso a este cliente');
  });

  it('sumar y quitar un tipo pide lo mismo que editar: no exige un permiso de gestión de ventas', () => {
    const rbacDe = (metodo: 'addSector' | 'removeSector' | 'update') =>
      Reflect.getMetadata('rbac', VentasClientesController.prototype[metodo]) as { anyPermissions: string[] };
    for (const metodo of ['addSector', 'removeSector'] as const) {
      // El rol `administrativo` (encargada comercial, finanzas) solo trae `activities.view` y `sales.view`.
      expect(rbacDe(metodo).anyPermissions).toEqual(expect.arrayContaining([PERMISSIONS.ACTIVITIES_VIEW, PERMISSIONS.SALES_VIEW]));
      expect(rbacDe(metodo).anyPermissions).toEqual(rbacDe('update').anyPermissions);
    }
  });
});
