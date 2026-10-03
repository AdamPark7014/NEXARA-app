/**
 * El alta que reutiliza a un cliente que ya existe pasa por la misma puerta que su ficha.
 *
 * Antes, `{ name: <cliente existente>, altaProyecto: true }` devolvía el registro completo
 * (documentos, oportunidades, correo del dueño) de un comercial ajeno a cualquiera con
 * permiso de ver actividades, y además le sumaba PROYECTO, con lo que la ficha quedaba
 * abierta para toda la empresa por GET :id. Ahora: quien no puede abrir la ficha recibe 403 y
 * el cliente no se toca; quien la abre pero no edita el padrón lo reutiliza tal cual; quien
 * administra el padrón y lleva el sector le suma el tipo.
 */
import { ForbiddenException } from '@nestjs/common';
import { VentasService } from './ventas.service.js';
import { CLIENT_REUSE_FORBIDDEN } from './client-access.js';
import { sectoresDelCliente } from './client-sectors.js';

const TECNICO = { id: 12, email: 'israel.ramos@nexara.com.mx', roleKey: 'ing_campo' };
const VENDEDOR = { id: 99, email: 'ventas.norte@nexara.com.mx', roleKey: 'vendedor' };
const DAVID = { id: 10, email: 'operaciones@nexara.com.mx', roleKey: 'coord_operaciones' };
const DANIELA = { id: 15, email: 'daniela.hernandez@nexara.com.mx', roleKey: 'administrativo' };

/** Comercial de un vendedor, con lo que `clientInclude()` arrastra y no debe salir de ahí. */
const COMERCIAL_AJENO = {
  id: 5,
  name: 'Plaza Dorada',
  legalName: null,
  taxId: null,
  billingEmail: 'pagos@plazadorada.mx',
  billingPhone: null,
  status: 'Activo',
  ownerId: 99,
  companyId: 7,
  serviceClientId: 80,
  tipo: 'COMERCIAL',
  sectors: [{ sector: 'COMERCIAL' }],
  documents: [{ id: 1, type: 'CSF', url: '/privado/csf.pdf' }],
  opportunities: [{ id: 2, title: 'Cableado', value: 120000 }],
  owner: { id: 99, nombre: 'Vendedor Norte', email: 'ventas.norte@nexara.com.mx' },
};

function armar(enPadron: Array<Record<string, any>>, reportes = 0) {
  const prisma = {
    user: { count: jest.fn().mockResolvedValue(reportes) },
    salesClient: {
      findFirst: jest.fn().mockResolvedValue(enPadron[0] ?? null),
      findMany: jest.fn().mockResolvedValue(enPadron),
      create: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 9, serviceClientId: 81, ...data, sectors: data.sectors?.create ?? [] }),
      ),
      update: jest.fn().mockImplementation(({ where, data }: any) => {
        const base = enPadron.find((c) => c.id === where.id) ?? enPadron[0];
        const { sectors, ...resto } = data;
        return Promise.resolve({
          ...base,
          ...resto,
          sectors: [...(base.sectors ?? []), ...(sectors?.create ?? [])],
        });
      }),
    },
    salesClientSector: { create: jest.fn().mockResolvedValue({}) },
    serviceClient: {
      findUnique: jest.fn().mockResolvedValue({ id: 80, name: 'Plaza Dorada' }),
      create: jest.fn().mockResolvedValue({ id: 81, name: 'Nuevo', accountCode: 'SC-9' }),
    },
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
  return { service, prisma };
}

describe('alta que reutiliza: la misma puerta que la ficha', () => {
  it('un técnico con permiso de actividades no se lleva el comercial ajeno ni le suma PROYECTO', async () => {
    const { service, prisma } = armar([COMERCIAL_AJENO]);
    const alta = service.createClient({ name: 'Plaza Dorada', altaProyecto: true } as any, TECNICO, 7);
    await expect(alta).rejects.toBeInstanceOf(ForbiddenException);
    await expect(alta).rejects.toThrow(CLIENT_REUSE_FORBIDDEN);
    expect(prisma.salesClient.update).not.toHaveBeenCalled();
    expect(prisma.salesClientSector.create).not.toHaveBeenCalled();
    // Tampoco se da de alta un duplicado: el nombre ya está en el padrón.
    expect(prisma.salesClient.create).not.toHaveBeenCalled();
  });

  it('con el alta rápida de un servicio pasa lo mismo: ni el registro ni CORPORATIVO', async () => {
    const { service, prisma } = armar([COMERCIAL_AJENO]);
    await expect(
      service.createClient(
        { name: 'plaza dorada', tipo: 'CORPORATIVO', altaRapida: true, billingPhone: '2221234567' } as any,
        TECNICO,
        7,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.salesClient.update).not.toHaveBeenCalled();
    expect(prisma.salesClient.create).not.toHaveBeenCalled();
  });

  it('GET :id sigue cerrado para el técnico: el alta no le abrió la ficha', async () => {
    const { service } = armar([COMERCIAL_AJENO]);
    await expect(service.createClient({ name: 'Plaza Dorada', altaProyecto: true } as any, TECNICO, 7)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.getClient(5, TECNICO, 7)).rejects.toThrow('No tienes acceso a este cliente');
  });

  it('el vendedor dueño lo reutiliza tal cual: lo ve, pero no edita el padrón, así que no se le suma el tipo', async () => {
    const { service, prisma } = armar([COMERCIAL_AJENO]);
    const res = await service.createClient({ name: 'Plaza Dorada', altaProyecto: true } as any, VENDEDOR, 7);
    expect(res).toBe(COMERCIAL_AJENO);
    expect(prisma.salesClient.update).not.toHaveBeenCalled();
    expect(prisma.salesClient.create).not.toHaveBeenCalled();
  });

  it('quien administra el padrón y lleva el sector le suma PROYECTO (el caso legítimo sigue igual)', async () => {
    const { service, prisma } = armar([COMERCIAL_AJENO]);
    const res = await service.createClient({ name: 'Plaza Dorada', altaProyecto: true } as any, DAVID, 7);
    expect(prisma.salesClient.create).not.toHaveBeenCalled();
    const { where, data } = prisma.salesClient.update.mock.calls[0][0];
    expect(where).toEqual({ id: 5 });
    expect(data.sectors).toEqual({ create: [{ sector: 'PROYECTO', companyId: 7 }] });
    expect(sectoresDelCliente(res)).toEqual(['COMERCIAL', 'PROYECTO']);
  });

  it('quien administra el padrón pero no lleva ese sector recibe el mismo rechazo que en la ficha', async () => {
    // Daniela (comercial) ve el comercial, pero PROYECTO no es su sector: igual que `addClientSector`.
    const { service, prisma } = armar([COMERCIAL_AJENO]);
    await expect(service.createClient({ name: 'Plaza Dorada', altaProyecto: true } as any, DANIELA, 7)).rejects.toThrow(
      /PROYECTO/,
    );
    expect(prisma.salesClient.update).not.toHaveBeenCalled();
  });

  it('un cliente de proyecto o corporativo sigue siendo de toda la empresa: el técnico lo reutiliza tal cual', async () => {
    const deProyecto = { ...COMERCIAL_AJENO, id: 6, name: 'Hotel Centro', tipo: 'PROYECTO', sectors: [{ sector: 'PROYECTO' }] };
    const { service, prisma } = armar([deProyecto]);
    const res = await service.createClient({ name: 'Hotel Centro', tipo: 'CORPORATIVO', altaRapida: true } as any, TECNICO, 7);
    expect(res).toBe(deProyecto);
    expect(prisma.salesClient.update).not.toHaveBeenCalled();
    expect(prisma.salesClient.create).not.toHaveBeenCalled();
  });

  it('si no existe ninguno con ese nombre, el técnico sigue dando de alta el suyo (alta rápida intacta)', async () => {
    const { service, prisma } = armar([]);
    const res = await service.createClient({ name: 'Cliente Nuevo', altaProyecto: true } as any, TECNICO, 7);
    expect(prisma.salesClient.create).toHaveBeenCalledTimes(1);
    expect(prisma.salesClient.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ name: 'Cliente Nuevo', tipo: 'PROYECTO', ownerId: 12, companyId: 7 }),
    );
    expect(res.id).toBe(9);
  });
});
