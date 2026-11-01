/**
 * Alta de último momento, con nombre parecido y «usar este»: permisos y empresa.
 */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { VentasService } from './ventas.service.js';
import { checkUrlAccess } from '../common/rbac/url-matrix.js';

const DANIELA = { id: 15, email: 'daniela.hernandez@nexara.com.mx', roleKey: 'administrativo' };
const LUIS = { id: 11, email: 'direccion.operaciones@nexara.com.mx', roleKey: 'coord_operaciones' };
const TECNICO = { id: 12, email: 'israel.ramos@nexara.com.mx', roleKey: 'ing_campo' };
const PORTAL = { id: 70, email: 'cliente@empresa.mx', roleKey: 'cliente' };

const fila = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  legalName: null,
  taxId: null,
  status: 'Activo',
  ownerId: null,
  tipo: 'COMERCIAL',
  companyId: 7,
  serviceClientId: id + 100,
  sectors: [{ sector: 'COMERCIAL' }],
  ...extra,
});

function armar(padron: Array<Record<string, any>> = []) {
  const prisma = {
    user: { count: jest.fn().mockResolvedValue(0) },
    salesClient: {
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(padron.find((c) => c.id === where.id && c.companyId === where.companyId) ?? null),
      ),
      findMany: jest.fn().mockImplementation(({ where }: any) => {
        const empresa = padron.filter((c) => c.companyId === where.companyId);
        const nombre = where.name?.equals;
        return Promise.resolve(nombre ? empresa.filter((c) => c.name.toLowerCase() === nombre.toLowerCase()) : empresa);
      }),
      create: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 900, serviceClientId: 901, ...data, sectors: data.sectors?.create ?? [] }),
      ),
      update: jest.fn().mockImplementation(({ where, data }: any) => {
        const base = padron.find((c) => c.id === where.id)!;
        const { sectors, ...resto } = data;
        return Promise.resolve({ ...base, ...resto, sectors: [...base.sectors, ...(sectors?.create ?? [])] });
      }),
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

describe('alta de último momento', () => {
  it('un comercial con solo el nombre, sin importar el sector de quien lo crea', async () => {
    const { service, prisma } = armar();
    const creado = await service.createClient({ name: 'Toks', tipo: 'COMERCIAL', altaRapida: true } as any, LUIS, 7);
    expect(prisma.salesClient.create.mock.calls[0][0].data).toMatchObject({
      name: 'Toks',
      tipo: 'COMERCIAL',
      companyId: 7,
      legalName: null,
      taxId: null,
      status: 'Activo',
    });
    expect(creado.sectors).toEqual([{ sector: 'COMERCIAL', companyId: 7 }]);
  });

  it('nace sin RFC: en Clientes queda bajo «Sin RFC» hasta que completen sus datos', async () => {
    const { service } = armar();
    const creado = await service.createClient({ name: 'Toks', tipo: 'COMERCIAL', altaRapida: true } as any, DANIELA, 7);
    expect(creado.taxId).toBeNull();
  });

  it('sigue sin abrir el resto de la ficha', async () => {
    const { service } = armar();
    await expect(
      service.createClient({ name: 'Toks', tipo: 'COMERCIAL', altaRapida: true, legalName: 'Toks SA' } as any, DANIELA, 7),
    ).rejects.toThrow(BadRequestException);
  });

  it('no crea clientes de proyecto: esos van por su propia alta', async () => {
    const { service } = armar();
    await expect(
      service.createClient({ name: 'Obra', tipo: 'PROYECTO', altaRapida: true } as any, DANIELA, 7),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.createClient({ name: 'Mezcla', tipo: 'COMERCIAL', sectors: ['COMERCIAL', 'PROYECTO'], altaRapida: true } as any, DANIELA, 7),
    ).rejects.toThrow(BadRequestException);
  });

  it('el portal de clientes nunca da de alta', async () => {
    const { service } = armar();
    await expect(
      service.createClient({ name: 'Toks', tipo: 'COMERCIAL', altaRapida: true } as any, PORTAL, 7),
    ).rejects.toThrow(ForbiddenException);
  });

  it('un ingeniero u operativo sigue sin llegar a la ruta', () => {
    expect(checkUrlAccess(TECNICO.roleKey as never, '/api/ventas/clientes', 'POST').allowed).toBe(false);
    expect(checkUrlAccess(TECNICO.roleKey as never, '/api/ventas/clientes/parecidos', 'POST').allowed).toBe(false);
  });

  it('quien administra clientes sí llega al aviso de parecidos', () => {
    for (const rol of ['administrativo', 'coord_operaciones', 'enc_soporte', 'arquitecto', 'rh', 'contabilidad']) {
      expect(checkUrlAccess(rol as never, '/api/ventas/clientes/parecidos', 'POST').allowed).toBe(true);
    }
  });

  it('getClientPermissions dice quién llega al alta', async () => {
    const { service } = armar();
    expect((await service.getClientPermissions(DANIELA)).puedeAltaRapida).toBe(true);
    expect((await service.getClientPermissions(LUIS)).puedeAltaRapida).toBe(true);
    expect((await service.getClientPermissions(TECNICO)).puedeAltaRapida).toBe(false);
    expect((await service.getClientPermissions(PORTAL)).puedeAltaRapida).toBe(false);
    expect((await service.getClientPermissions({ ...TECNICO, isSuperAdmin: true })).puedeAltaRapida).toBe(true);
  });
});

describe('nombre casi seguro repetido', () => {
  it('no entra sin que alguien lo vea: 409 con el nombre del que ya existe', async () => {
    const { service, prisma } = armar([fila(1, 'BUAP')]);
    await expect(
      service.createClient({ name: 'Benemérita Universidad Autónoma de Puebla', tipo: 'COMERCIAL', altaRapida: true } as any, DANIELA, 7),
    ).rejects.toThrow(new ConflictException('Ya hay un cliente muy parecido: BUAP. Elígelo, o confirma que es otro.'));
    expect(prisma.salesClient.create).not.toHaveBeenCalled();
  });

  it('al revés también', async () => {
    const { service } = armar([fila(1, 'Benemérita Universidad Autónoma de Puebla')]);
    await expect(service.createClient({ name: 'BUAP', tipo: 'COMERCIAL', sectors: ['COMERCIAL'] } as any, DANIELA, 7)).rejects.toThrow(ConflictException);
  });

  it('el «Nuevo cliente» normal también lo revisa, con razón social y RFC', async () => {
    const { service } = armar([fila(1, 'Toks', { taxId: 'TOK010101AB1' })]);
    await expect(
      service.createClient({ name: 'Restaurantes Sanborns', taxId: 'tok010101ab1', tipo: 'COMERCIAL', sectors: ['COMERCIAL'] } as any, DANIELA, 7),
    ).rejects.toThrow(ConflictException);
  });

  it('con «crear otro de todos modos» entra', async () => {
    const { service, prisma } = armar([fila(1, 'BUAP')]);
    await service.createClient(
      { name: 'Benemérita Universidad Autónoma de Puebla', tipo: 'COMERCIAL', altaRapida: true, confirmarNuevo: true } as any,
      DANIELA,
      7,
    );
    expect(prisma.salesClient.create).toHaveBeenCalledTimes(1);
  });

  it('lo que solo se parece un poco no se rechaza: lo decide quien mira el aviso', async () => {
    const { service, prisma } = armar([fila(1, 'ANFORA')]);
    await service.createClient({ name: 'ANFO', tipo: 'COMERCIAL', altaRapida: true } as any, DANIELA, 7);
    expect(prisma.salesClient.create).toHaveBeenCalledTimes(1);
  });

  it('un cliente de otra empresa no cuenta como parecido', async () => {
    const { service, prisma } = armar([fila(1, 'BUAP', { companyId: 8 })]);
    await service.createClient({ name: 'Benemérita Universidad Autónoma de Puebla', tipo: 'COMERCIAL', altaRapida: true } as any, DANIELA, 7);
    expect(prisma.salesClient.create).toHaveBeenCalledTimes(1);
  });
});

describe('«usar este»', () => {
  it('reutiliza al cliente sin crear otro y le suma el tipo si quien lo pide lleva ese sector', async () => {
    const { service, prisma } = armar([fila(1, 'BUAP')]);
    const usado = await service.createClient({ name: 'BUAP', tipo: 'CORPORATIVO', altaRapida: true, reutilizarId: 1 } as any, { ...DANIELA, email: 'gerencia@nexara.com.mx', isSuperAdmin: true } as any, 7);
    expect(prisma.salesClient.create).not.toHaveBeenCalled();
    expect(usado.id).toBe(1);
    expect(prisma.salesClient.update.mock.calls[0][0].data.sectors.create).toEqual([{ sector: 'CORPORATIVO', companyId: 7 }]);
  });

  it('quien no lleva ese sector usa al cliente tal cual, sin error', async () => {
    const { service, prisma } = armar([fila(1, 'BUAP', { sectors: [{ sector: 'CORPORATIVO' }], tipo: 'CORPORATIVO' })]);
    const usado = await service.createClient({ name: 'BUAP', tipo: 'COMERCIAL', altaRapida: true, reutilizarId: 1 } as any, LUIS, 7);
    expect(usado.id).toBe(1);
    expect(prisma.salesClient.update).not.toHaveBeenCalled();
  });

  it('de otra empresa: como si no existiera', async () => {
    const { service, prisma } = armar([fila(1, 'BUAP', { companyId: 8 })]);
    await expect(service.createClient({ name: 'BUAP', tipo: 'COMERCIAL', altaRapida: true, reutilizarId: 1 } as any, DANIELA, 7)).rejects.toThrow(NotFoundException);
    expect(prisma.salesClient.update).not.toHaveBeenCalled();
  });

  it('un inactivo no se revive', async () => {
    const { service } = armar([fila(1, 'BUAP', { status: 'Inactivo' })]);
    await expect(service.createClient({ name: 'BUAP', tipo: 'COMERCIAL', altaRapida: true, reutilizarId: 1 } as any, DANIELA, 7)).rejects.toThrow(NotFoundException);
  });
});
