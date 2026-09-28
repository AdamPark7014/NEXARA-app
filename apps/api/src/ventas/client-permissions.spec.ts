import { ForbiddenException } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import {
  canDeleteOrDeactivateClient,
  canManageClients,
  canQuickCreateCorporateClient,
  CLIENT_DEACTIVATE_FORBIDDEN,
  CLIENT_DELETE_FORBIDDEN,
  CLIENT_MANAGE_FORBIDDEN,
  clientPermissions,
  isInactiveClientStatus,
} from './client-permissions.js';
import { tipoPorUso } from './client-tipo.js';
import { VentasService } from './ventas.service.js';

const CHRISTIAN = { id: 1, email: 'gerencia@nexara.com.mx', roleKey: 'ceo', isSuperAdmin: true };
const CLAUDIA = { id: 2, email: 'claudia.bernal@nexara.com.mx', roleKey: 'ceo', isSuperAdmin: true };
const ADAM = { id: 3, email: 'developer@nexara.com.mx', roleKey: 'super_admin', isSuperAdmin: true };
const DAVID_JEFE = { id: 10, email: 'operaciones@nexara.com.mx', roleKey: 'ing_soporte' };
const ADMINISTRATIVA = { id: 11, email: 'admin@nexara.com.mx', roleKey: 'administrativo' };
const TECNICO = { id: 12, email: 'israel.ramos@nexara.com.mx', roleKey: 'ing_campo' };
const VENDEDOR = { id: 13, email: 'vendedor@nexara.com.mx', roleKey: 'vendedor' };
const LUIS = { id: 14, email: 'direccion.operaciones@nexara.com.mx', roleKey: 'coord_operaciones' };
const DANIELA = { id: 15, email: 'daniela.hernandez@nexara.com.mx', roleKey: 'administrativo' };
const LIDER = { id: 16, email: 'diseno@nexara.com.mx', roleKey: 'lider_diseno' };

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

  it('agregan y editan: coordinación, gerencia, encargada comercial y un jefe que no es operativo', () => {
    expect(canManageClients(ADMINISTRATIVA, false)).toBe(true);
    expect(canManageClients(DANIELA, false)).toBe(true);
    expect(canManageClients(LUIS, false)).toBe(true);
    expect(canManageClients(LIDER, true)).toBe(true);
    for (const roleKey of [
      'ceo',
      'coord_admin',
      'dir_admin',
      'contabilidad',
      'rh',
      'coord_operaciones',
      'dir_operaciones',
      'coord_ventas',
      'arquitecto',
      'enc_soporte',
    ]) {
      expect(canManageClients({ email: 'a@nexara.com.mx', roleKey }, false)).toBe(true);
    }
    expect(canManageClients(CHRISTIAN, false)).toBe(true);
  });

  it('un ingeniero u operativo no agrega ni edita, aunque tenga personal a cargo', () => {
    expect(canManageClients(TECNICO, false)).toBe(false);
    expect(canManageClients(TECNICO, true)).toBe(false);
    expect(canManageClients(DAVID_JEFE, true)).toBe(false);
    expect(canManageClients({ email: 'soporte@nexara.com.mx', roleKey: 'ing_soporte' }, true)).toBe(false);
    expect(canManageClients(VENDEDOR, false)).toBe(false);
    expect(canManageClients(VENDEDOR, true)).toBe(false);
    expect(canManageClients({ email: 'd@nexara.com.mx', roleKey: 'disenador' }, true)).toBe(false);
    expect(canManageClients(undefined, true)).toBe(false);
  });

  it('resume los permisos para web y apps', () => {
    expect(clientPermissions(ADMINISTRATIVA, false)).toEqual({
      puedeAgregar: true,
      puedeEditar: true,
      puedeDesactivar: false,
      puedeEliminar: false,
      puedeAltaRapidaCorporativa: false,
    });
    expect(clientPermissions(CHRISTIAN, false)).toEqual({
      puedeAgregar: true,
      puedeEditar: true,
      puedeDesactivar: true,
      puedeEliminar: true,
      puedeAltaRapidaCorporativa: false,
    });
    expect(clientPermissions(TECNICO, true)).toEqual({
      puedeAgregar: false,
      puedeEditar: false,
      puedeDesactivar: false,
      puedeEliminar: false,
      puedeAltaRapidaCorporativa: true,
    });
    expect(canQuickCreateCorporateClient(TECNICO)).toBe(true);
    expect(canQuickCreateCorporateClient(LUIS)).toBe(false);
  });

  it('clasifica por el uso más reciente y, si empatan o no hay uso, queda comercial', () => {
    const dia = (n: number) => new Date(`2026-09-${String(n).padStart(2, '0')}T12:00:00.000Z`);
    expect(tipoPorUso({})).toBe('COMERCIAL');
    expect(tipoPorUso({ comercialAt: dia(1) })).toBe('COMERCIAL');
    expect(tipoPorUso({ proyectoAt: dia(2) })).toBe('PROYECTO');
    expect(tipoPorUso({ corporativoAt: dia(3) })).toBe('CORPORATIVO');
    expect(tipoPorUso({ comercialAt: dia(1), proyectoAt: dia(4), corporativoAt: dia(2) })).toBe('PROYECTO');
    expect(tipoPorUso({ proyectoAt: dia(5), corporativoAt: dia(5) })).toBe('COMERCIAL');
    expect(tipoPorUso({ comercialAt: dia(6), proyectoAt: dia(6) })).toBe('COMERCIAL');
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

  it('quien no tiene personal a cargo ni rol de coordinación no edita', async () => {
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

  it('un ingeniero con personal a cargo sigue sin poder crear ni editar', async () => {
    const { service, prisma } = buildService({ reportees: 4 });
    await expect(service.createClient({ name: 'Nuevo' } as any, DAVID_JEFE, 7)).rejects.toThrow(
      new ForbiddenException(CLIENT_MANAGE_FORBIDDEN),
    );
    await expect(service.updateClient(5, { name: 'Otro' } as any, TECNICO, 7)).rejects.toThrow(
      new ForbiddenException(CLIENT_MANAGE_FORBIDDEN),
    );
    expect(prisma.salesClient.create).not.toHaveBeenCalled();
    expect(prisma.salesClient.update).not.toHaveBeenCalled();
  });

  it('un jefe que no es operativo sí edita', async () => {
    const { service, prisma } = buildService({ reportees: 2 });
    await service.updateClient(5, { name: 'Otro' } as any, LIDER, 7);
    expect(prisma.user.count).toHaveBeenCalledWith({ where: { managerId: LIDER.id, isActive: true } });
    expect(prisma.salesClient.update).toHaveBeenCalled();
  });

  it('un coordinador crea el cliente en su empresa y en el sector de su área', async () => {
    const { service, prisma } = buildService({ reportees: 0 });
    prisma.salesClient.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 9, serviceClientId: null, sectors: [], ...data }),
    );
    await service.createClient({ name: 'Cliente de Luis' } as any, LUIS, 7);
    expect(prisma.salesClient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Cliente de Luis',
          companyId: 7,
          tipo: 'CORPORATIVO',
          sectors: { create: [expect.objectContaining({ sector: 'CORPORATIVO', companyId: 7 })] },
        }),
      }),
    );
  });

  it('la encargada comercial crea en comercial, no en otro sector', async () => {
    const { service, prisma } = buildService();
    prisma.salesClient.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 9, serviceClientId: null, sectors: [], ...data }),
    );
    await service.createClient({ name: 'Cliente de Daniela' } as any, DANIELA, 7);
    expect(prisma.salesClient.create.mock.calls[0][0].data.sectors.create).toEqual([
      expect.objectContaining({ sector: 'COMERCIAL', companyId: 7 }),
    ]);
    await expect(
      service.createClient({ name: 'Otro', sectors: ['PROYECTO'] } as any, DANIELA, 7),
    ).rejects.toThrow(/PROYECTO/);
  });

  it('el listado de un coordinador es de su empresa, no solo de los que él creó', async () => {
    const { service, prisma } = buildService();
    prisma.salesClient.findMany = jest.fn().mockResolvedValue([]);
    await service.listClients(LUIS, undefined, undefined, 7);
    const where = prisma.salesClient.findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe(7);
    expect(where.ownerId).toBeUndefined();
  });

  it('un ingeniero, si llegara al servicio, no ve el padrón de la empresa', async () => {
    const { service, prisma } = buildService();
    prisma.salesClient.findMany = jest.fn().mockResolvedValue([]);
    await service.listClients(TECNICO, undefined, undefined, 7);
    const where = prisma.salesClient.findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe(7);
    expect(where.ownerId).toBe(TECNICO.id);
  });

  it('dar de alta un cliente ya inactivo también es exclusivo de Christian', async () => {
    const { service } = buildService({ reportees: 2 });
    await expect(service.createClient({ name: 'X', status: 'Inactivo' } as any, ADMINISTRATIVA, 7)).rejects.toThrow(
      new ForbiddenException(CLIENT_DEACTIVATE_FORBIDDEN),
    );
  });

  it('expone los permisos del usuario', async () => {
    const { service } = buildService({ reportees: 1 });
    await expect(service.getClientPermissions(LUIS)).resolves.toEqual({
      puedeAgregar: true,
      puedeEditar: true,
      puedeDesactivar: false,
      puedeEliminar: false,
      puedeAltaRapidaCorporativa: false,
    });
    await expect(service.getClientPermissions(DAVID_JEFE)).resolves.toEqual({
      puedeAgregar: false,
      puedeEditar: false,
      puedeDesactivar: false,
      puedeEliminar: false,
      puedeAltaRapidaCorporativa: true,
    });
  });

  it('un operativo da de alta rápido un corporativo con nombre y contacto, y no captura el RFC', async () => {
    const { service, prisma } = buildService();
    prisma.salesClient.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 9, serviceClientId: null, sectors: [], ...data }),
    );
    await service.createClient(
      { name: 'Sucursal Norte', tipo: 'CORPORATIVO', altaRapida: true, billingPhone: '5512345678' } as any,
      TECNICO,
      7,
    );
    expect(prisma.salesClient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Sucursal Norte',
          tipo: 'CORPORATIVO',
          billingPhone: '5512345678',
          taxId: null,
          companyId: 7,
        }),
      }),
    );
    await expect(
      service.createClient(
        { name: 'Con RFC', tipo: 'CORPORATIVO', altaRapida: true, taxId: 'XAXX010101000' } as any,
        TECNICO,
        7,
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.createClient({ name: 'Comercial', tipo: 'COMERCIAL', altaRapida: true } as any, TECNICO, 7),
    ).rejects.toThrow(BadRequestException);
  });

  it('el alta de un proyecto crea el cliente PROYECTO solo con el nombre, también si el sector no es el suyo', async () => {
    const { service, prisma } = buildService();
    prisma.salesClient.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 11, serviceClientId: null, sectors: [], ...data }),
    );
    await service.createClient({ name: 'Obra Norte', altaProyecto: true } as any, TECNICO, 7);
    expect(prisma.salesClient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Obra Norte',
          tipo: 'PROYECTO',
          taxId: null,
          billingEmail: null,
          companyId: 7,
        }),
      }),
    );
    await service.createClient({ name: 'Obra Sur', tipo: 'PROYECTO', altaProyecto: true } as any, DANIELA, 7);
    await expect(
      service.createClient({ name: 'Con RFC', altaProyecto: true, taxId: 'XAXX010101000' } as any, TECNICO, 7),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.createClient({ name: 'Comercial', altaProyecto: true, tipo: 'COMERCIAL' } as any, TECNICO, 7),
    ).rejects.toThrow(BadRequestException);
  });

  it('un operativo lista clientes corporativos de su empresa y no los comerciales', async () => {
    const { service, prisma } = buildService();
    prisma.salesClient.findMany = jest.fn().mockResolvedValue([]);
    await service.listClients(TECNICO, undefined, { sector: 'CORPORATIVO' } as any, 7);
    const donde = prisma.salesClient.findMany.mock.calls[0][0].where;
    expect(donde.companyId).toBe(7);
    expect(donde.tipo).toBe('CORPORATIVO');
    expect(donde.ownerId).toBeUndefined();
    await expect(service.listClients(TECNICO, undefined, { sector: 'COMERCIAL' } as any, 7)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('un operativo lista los clientes de proyecto de su empresa para elegirlos en una actividad', async () => {
    const { service, prisma } = buildService();
    prisma.salesClient.findMany = jest.fn().mockResolvedValue([]);
    await service.listClients(TECNICO, undefined, { sector: 'PROYECTO' } as any, 7);
    const donde = prisma.salesClient.findMany.mock.calls[0][0].where;
    expect(donde.companyId).toBe(7);
    expect(donde.tipo).toBe('PROYECTO');
    expect(donde.ownerId).toBeUndefined();
  });
});
