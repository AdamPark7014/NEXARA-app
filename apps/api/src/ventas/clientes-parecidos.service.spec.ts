/**
 * Quién ve qué en el aviso de parecidos y cuándo se le pregunta a la IA.
 */
import { ClientesParecidosService } from './clientes-parecidos.service.js';

const DANIELA = { id: 15, email: 'daniela.hernandez@nexara.com.mx', roleKey: 'administrativo' };
const LUIS = { id: 11, email: 'luis.joel@nexara.com.mx', roleKey: 'ing_soporte' };

const fila = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  legalName: null,
  taxId: null,
  status: 'Activo',
  ownerId: 99,
  tipo: 'COMERCIAL',
  serviceClientId: id + 100,
  sectors: [{ sector: 'COMERCIAL' }],
  ...extra,
});

function armar(padron: Array<Record<string, unknown>>, ia?: unknown) {
  const prisma = {
    salesClient: { findMany: jest.fn().mockResolvedValue(padron) },
    companyProfile: { findFirst: jest.fn() },
  };
  const claude = {
    disponible: jest.fn().mockReturnValue(ia !== undefined),
    json: ia instanceof Error ? jest.fn().mockRejectedValue(ia) : jest.fn().mockResolvedValue({ datos: ia, uso: {} }),
  };
  const service = new ClientesParecidosService(prisma as never, claude as never);
  return { service, prisma, claude };
}

describe('ClientesParecidosService', () => {
  it('solo compara contra la empresa de quien pregunta', async () => {
    const { service, prisma } = armar([fila(1, 'BUAP')]);
    await service.buscar({ nombre: 'Benemérita Universidad Autónoma de Puebla' }, DANIELA, 7);
    expect(prisma.salesClient.findMany.mock.calls[0][0].where).toEqual({ companyId: 7 });
  });

  it('el caso BUAP sale del código, sin gastar IA', async () => {
    const { service, claude } = armar([fila(1, 'BUAP')], { coincidencias: [] });
    const { parecidos } = await service.buscar({ nombre: 'Benemérita Universidad Autónoma de Puebla' }, DANIELA, 7);
    expect(parecidos).toHaveLength(1);
    expect(parecidos[0]).toMatchObject({ id: 1, nombre: 'BUAP', confianza: 'alta', origen: 'codigo', puedeUsar: true, serviceClientId: 101 });
    expect(claude.json).not.toHaveBeenCalled();
  });

  it('lo que hay que conocer se le pregunta a la IA, y solo se cree lo seguro', async () => {
    const { service, claude } = armar([fila(1, 'Tecnológico de Monterrey'), fila(2, 'Colegio Humboldt')], {
      coincidencias: [
        { id: 1, seguridad: 'alta', porque: 'Son las siglas de ese nombre' },
        { id: 2, seguridad: 'media', porque: 'Tal vez' },
      ],
    });
    const { parecidos } = await service.buscar({ nombre: 'ITESM' }, DANIELA, 7);
    expect(claude.json).toHaveBeenCalledTimes(1);
    expect(claude.json.mock.calls[0][0]).toMatchObject({ proceso: 'clientes-duplicados', companyId: 7, modelo: 'claude-haiku-5-5' });
    expect(parecidos.map((p) => p.id)).toEqual([1]);
    expect(parecidos[0].origen).toBe('ia');
  });

  it('un id que la IA inventó no pasa', async () => {
    const { service } = armar([fila(1, 'Colegio Humboldt')], { coincidencias: [{ id: 999, seguridad: 'alta', porque: 'x' }] });
    expect((await service.buscar({ nombre: 'ITESM' }, DANIELA, 7)).parecidos).toEqual([]);
  });

  it('si la IA falla, queda lo del código y no se rompe', async () => {
    const { service } = armar([fila(1, 'ANFORA')], new Error('saturada'));
    const { parecidos } = await service.buscar({ nombre: 'ANFO' }, DANIELA, 7);
    expect(parecidos.map((p) => p.nombre)).toEqual(['ANFORA']);
  });

  it('soloCodigo no llama a la IA', async () => {
    const { service, claude } = armar([fila(1, 'Colegio Humboldt')], { coincidencias: [] });
    await service.buscar({ nombre: 'ITESM', soloCodigo: true }, DANIELA, 7);
    expect(claude.json).not.toHaveBeenCalled();
  });

  it('los inactivos no cuentan: un alta nueva no revive a uno que dirección desactivó', async () => {
    const { service } = armar([fila(1, 'BUAP', { status: 'Inactivo' })]);
    expect((await service.buscar({ nombre: 'BUAP' }, DANIELA, 7)).parecidos).toEqual([]);
  });

  it('quien no puede abrir a ese cliente sabe que existe, sin sus datos', async () => {
    const { service } = armar([fila(1, 'BUAP', { legalName: 'Benemérita Universidad Autónoma de Puebla', ownerId: 99 })]);
    const { parecidos } = await service.buscar({ nombre: 'BUAP' }, LUIS, 7);
    expect(parecidos).toHaveLength(1);
    expect(parecidos[0]).toMatchObject({ nombre: 'BUAP', puedeUsar: false, razonSocial: null, serviceClientId: null });
  });

  it('nunca devuelve el RFC ni el correo', async () => {
    const { service } = armar([fila(1, 'BUAP', { taxId: 'BUA010101AB1', billingEmail: 'x@y.mx' })]);
    const [p] = (await service.buscar({ nombre: 'BUAP' }, DANIELA, 7)).parecidos;
    expect(JSON.stringify(p)).not.toContain('BUA010101AB1');
    expect(JSON.stringify(p)).not.toContain('x@y.mx');
  });

  it('un nombre de una letra no pregunta nada', async () => {
    const { service, prisma } = armar([fila(1, 'BUAP')]);
    expect((await service.buscar({ nombre: 'B' }, DANIELA, 7)).parecidos).toEqual([]);
    expect(prisma.salesClient.findMany).not.toHaveBeenCalled();
  });
});
