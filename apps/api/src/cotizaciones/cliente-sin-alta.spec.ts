/**
 * El editor autoguarda 1.2 s después de la última tecla. Antes, cada pausa al escribir el cliente
 * lo daba de alta: así nacieron «Benemer», «ANFO», «GAMINF» y «Bodega de». Con `clienteSinAlta` el
 * nombre se guarda como texto hasta que alguien lo elige o lo crea.
 */
import { CotizacionesService } from './cotizaciones.service.js';

function armar() {
  const prisma = {
    cotizacion: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 50, total: 0, ...data })),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 50, ...data })),
    },
    salesClient: { findFirst: jest.fn().mockResolvedValue(null) },
    cotizacionItem: { deleteMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn().mockImplementation((fn: any) => fn(prisma)),
  } as any;
  const ventas = { createClient: jest.fn().mockResolvedValue({ id: 77, name: 'Toks' }) };
  const core = {
    siguienteFolio: jest.fn().mockResolvedValue({ folio: 'COT-1', nomenclatura: 'COT', consecutivo: 1 }),
    registrarParticipante: jest.fn().mockResolvedValue(undefined),
  };
  const service = new CotizacionesService(
    prisma,
    { requestAutoApproval: jest.fn(), publishEntityLifecycle: jest.fn() } as any,
    {} as any,
    {} as any,
    ventas as any,
    {} as any,
    core as any,
  );
  return { service, prisma, ventas };
}

const ACTOR = { id: 15, email: 'daniela.hernandez@nexara.com.mx', roleKey: 'administrativo', nombre: 'Daniela' };

describe('cotización: el cliente a medio escribir', () => {
  it('al crear con clienteSinAlta guarda el texto y no da de alta a nadie', async () => {
    const { service, prisma, ventas } = armar();
    await service.create({ clientName: 'Benemer', clienteSinAlta: true } as any, 15, 7, ACTOR);
    expect(ventas.createClient).not.toHaveBeenCalled();
    expect(prisma.cotizacion.create.mock.calls[0][0].data).toMatchObject({ clientName: 'Benemer', salesClientId: null });
  });

  it('sin el aviso sigue dando de alta: otras vías dependen de eso', async () => {
    const { service, ventas, prisma } = armar();
    await service.create({ clientName: 'Toks' } as any, 15, 7, ACTOR);
    expect(ventas.createClient).toHaveBeenCalledTimes(1);
    expect(ventas.createClient.mock.calls[0][0]).toMatchObject({ name: 'Toks', tipo: 'COMERCIAL', confirmarNuevo: true });
    expect(prisma.cotizacion.create.mock.calls[0][0].data.salesClientId).toBe(77);
  });

  it('sin nombre tampoco se guarda', async () => {
    const { service } = armar();
    await expect(service.create({ clienteSinAlta: true } as any, 15, 7, ACTOR)).rejects.toThrow('requiere un cliente');
  });

  it('al editar con clienteSinAlta desliga al anterior y no crea otro', async () => {
    const { service, prisma, ventas } = armar();
    prisma.cotizacion.findFirst.mockResolvedValue({ id: 50, companyId: 7, status: 'DRAFT', salesClientId: 3, items: [], clientName: 'BUAP' });
    await service.update(50, { clientName: 'Benemer', salesClientId: null, clienteSinAlta: true } as any, 15, 7, ACTOR).catch(() => undefined);
    expect(ventas.createClient).not.toHaveBeenCalled();
    const llamada = prisma.cotizacion.update.mock.calls[0]?.[0]?.data ?? {};
    expect(llamada.salesClientId).toBeNull();
    expect(llamada.clientName).toBe('Benemer');
  });
});
