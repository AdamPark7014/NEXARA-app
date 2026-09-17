import { ForbiddenException } from '@nestjs/common';
import {
  canDeleteOrDeactivateClient,
  canManageClients,
  CLIENT_DEACTIVATE_FORBIDDEN,
  CLIENT_DELETE_FORBIDDEN,
  CLIENT_MANAGE_FORBIDDEN,
  clientPermissions,
  isInactiveClientStatus,
} from './client-permissions.js';
import { VentasService } from './ventas.service.js';

const CHRISTIAN = { id: 1, email: 'gerencia@nexara.com.mx', roleKey: 'ceo', isSuperAdmin: true };
const CLAUDIA = { id: 2, email: 'claudia.bernal@nexara.com.mx', roleKey: 'ceo', isSuperAdmin: true };
const ADAM = { id: 3, email: 'developer@nexara.com.mx', roleKey: 'super_admin', isSuperAdmin: true };
const DAVID_JEFE = { id: 10, email: 'operaciones@nexara.com.mx', roleKey: 'ing_soporte' };
const ADMINISTRATIVA = { id: 11, email: 'admin@nexara.com.mx', roleKey: 'administrativo' };
const TECNICO = { id: 12, email: 'israel.ramos@nexara.com.mx', roleKey: 'ing_campo' };
const VENDEDOR = { id: 13, email: 'vendedor@nexara.com.mx', roleKey: 'vendedor' };

describe('permisos de clientes (reglas puras)', () => {
  it('Christian, su equivalente y la cuenta de desarrollo pueden desactivar y eliminar', () => {
    expect(canDeleteOrDeactivateClient(CHRISTIAN)).toBe(true);
    expect(canDeleteOrDeactivateClient(CLAUDIA)).toBe(true);
    expect(canDeleteOrDeactivateClient(ADAM)).toBe(true);
  });

  it('nadie más desactiva ni elimina, aunque sea jefe o administrativo', () => {
    expect(canDeleteOrDeactivateClient(DAVID_JEFE)).toBe(false);
    expect(canDeleteOrDeactivateClient(ADMINISTRATIVA)).toBe(false);
    expect(canDeleteOrDeactivateClient({ email: 'x@nexara.com.mx', roleKey: 'dir_admin' })).toBe(false);
    expect(canDeleteOrDeactivateClient(null)).toBe(false);
  });

  it('agregan y editan: jefes con personal a cargo, roles administrativos y dirección', () => {
    expect(canManageClients(DAVID_JEFE, true)).toBe(true);
    expect(canManageClients(ADMINISTRATIVA, false)).toBe(true);
    for (const roleKey of ['coord_admin', 'dir_admin', 'contabilidad', 'rh', 'coord_operaciones', 'dir_operaciones']) {
      expect(canManageClients({ email: 'a@nexara.com.mx', roleKey }, false)).toBe(true);
    }
    expect(canManageClients(CHRISTIAN, false)).toBe(true);
  });

  it('sin personal a cargo ni rol administrativo no agrega ni edita', () => {
    expect(canManageClients(TECNICO, false)).toBe(false);
    expect(canManageClients(VENDEDOR, false)).toBe(false);
    expect(canManageClients(undefined, true)).toBe(false);
  });

  it('resume los cuatro permisos para web y apps', () => {
    expect(clientPermissions(ADMINISTRATIVA, false)).toEqual({
      puedeAgregar: true,
      puedeEditar: true,
      puedeDesactivar: false,
      puedeEliminar: false,
    });
    expect(clientPermissions(CHRISTIAN, false)).toEqual({
      puedeAgregar: true,
      puedeEditar: true,
      puedeDesactivar: true,
      puedeEliminar: true,
    });
  });

  it('reconoce «Inactivo» sin importar mayúsculas', () => {
    expect(isInactiveClientStatus('Inactivo')).toBe(true);
    expect(isInactiveClientStatus(' INACTIVE ')).toBe(true);
    expect(isInactiveClientStatus('Activo')).toBe(false);
    expect(isInactiveClientStatus(null)).toBe(false);
  });
});

function buildService(opts: { reportees?: number; client?: Record<string, unknown> } = {}) {
  const client = {
    id: 5,
    name: 'Plaza Dorada',
    status: 'Activo',
    ownerId: null,
    companyId: 7,
    serviceClientId: null,
    sectors: [{ sector: 'COMERCIAL' }],
    ...opts.client,
  };
  const prisma = {
    user: { count: jest.fn().mockResolvedValue(opts.reportees ?? 0) },
    salesClient: {
      findFirst: jest.fn().mockResolvedValue(client),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...client, ...data })),
      delete: jest.fn().mockResolvedValue(client),
      create: jest.fn(),
    },
  };
  const domainEvents = { publishEntityLifecycle: jest.fn() };
  const service = new VentasService(
    prisma as any,
    {} as any,
    {} as any,
    { notifySalesClientCreated: jest.fn().mockResolvedValue(undefined) } as any,
    {} as any,
    domainEvents as any,
    {} as any,
  );
  return { service, prisma };
}

describe('VentasService · eliminar y desactivar clientes', () => {
  it('solo Christian elimina; los demás reciben 403 con mensaje claro', async () => {
    const { service, prisma } = buildService({ reportees: 3 });
    await expect(service.deleteClient(5, DAVID_JEFE, 7)).rejects.toThrow(new ForbiddenException(CLIENT_DELETE_FORBIDDEN));
    expect(prisma.salesClient.delete).not.toHaveBeenCalled();

    await service.deleteClient(5, CHRISTIAN, 7);
    expect(prisma.salesClient.delete).toHaveBeenCalledWith({ where: { id: 5 } });
  });

  it('desactivar deja el cliente «Inactivo» y reactivar lo regresa a «Activo»', async () => {
    const { service, prisma } = buildService();
    const { updated } = await service.setClientActive(5, false, CLAUDIA, 7);
    expect(updated.status).toBe('Inactivo');
    expect(prisma.salesClient.update.mock.calls[0][0].data).toEqual({ status: 'Inactivo' });

    const inactivo = buildService({ client: { status: 'Inactivo' } });
    const res = await inactivo.service.setClientActive(5, true, CHRISTIAN, 7);
    expect(res.updated.status).toBe('Activo');
  });

  it('un administrativo no puede desactivar ni por el endpoint ni cambiando el status', async () => {
    const { service, prisma } = buildService();
    await expect(service.setClientActive(5, false, ADMINISTRATIVA, 7)).rejects.toThrow(
      new ForbiddenException(CLIENT_DEACTIVATE_FORBIDDEN),
    );
    await expect(service.updateClient(5, { status: 'Inactivo' } as any, ADMINISTRATIVA, 7)).rejects.toThrow(
      new ForbiddenException(CLIENT_DEACTIVATE_FORBIDDEN),
    );
    expect(prisma.salesClient.update).not.toHaveBeenCalled();
  });

  it('un administrativo sí edita datos sin tocar el estatus', async () => {
    const { service, prisma } = buildService();
    await service.updateClient(5, { name: 'Plaza Dorada Norte', status: 'Activo' } as any, ADMINISTRATIVA, 7);
    expect(prisma.salesClient.update).toHaveBeenCalled();
  });

  it('quien no tiene personal a cargo ni rol administrativo no edita', async () => {
    const { service, prisma } = buildService({ reportees: 0 });
    await expect(service.updateClient(5, { name: 'Otro' } as any, TECNICO, 7)).rejects.toThrow(
      new ForbiddenException(CLIENT_MANAGE_FORBIDDEN),
    );
    await expect(service.createClient({ name: 'Nuevo' } as any, TECNICO, 7)).rejects.toThrow(
      new ForbiddenException(CLIENT_MANAGE_FORBIDDEN),
    );
    expect(prisma.salesClient.update).not.toHaveBeenCalled();
    expect(prisma.salesClient.create).not.toHaveBeenCalled();
  });

  it('un jefe con personal a cargo sí edita', async () => {
    const { service, prisma } = buildService({ reportees: 2 });
    await service.updateClient(5, { name: 'Otro' } as any, DAVID_JEFE, 7);
    expect(prisma.user.count).toHaveBeenCalledWith({ where: { managerId: DAVID_JEFE.id, isActive: true } });
    expect(prisma.salesClient.update).toHaveBeenCalled();
  });

  it('dar de alta un cliente ya inactivo también es exclusivo de Christian', async () => {
    const { service } = buildService({ reportees: 2 });
    await expect(service.createClient({ name: 'X', status: 'Inactivo' } as any, DAVID_JEFE, 7)).rejects.toThrow(
      new ForbiddenException(CLIENT_DEACTIVATE_FORBIDDEN),
    );
  });

  it('expone los permisos del usuario', async () => {
    const { service } = buildService({ reportees: 1 });
    await expect(service.getClientPermissions(DAVID_JEFE)).resolves.toEqual({
      puedeAgregar: true,
      puedeEditar: true,
      puedeDesactivar: false,
      puedeEliminar: false,
    });
  });
});
