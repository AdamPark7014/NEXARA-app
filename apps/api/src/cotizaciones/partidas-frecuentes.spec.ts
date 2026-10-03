import { CotizacionesService } from './cotizaciones.service.js';
import {
  MAX_PARTIDAS_FRECUENTES,
  filtroDePartidas,
  normalizarTexto,
  palabrasDeBusqueda,
  partidasFrecuentes,
  variantesDeAcento,
  type FilaCotizada,
} from './partidas-frecuentes.js';

/**
 * «Partidas frecuentes»: lo que ya se cotizó se ofrece al escribir en «Nueva partida», con los
 * datos de la última vez. Adam lo pidió porque las mismas partidas se capturaban a mano en cada
 * cotización, con su descripción, marca, modelo, costo y precio.
 */
const fila = (parcial: Partial<FilaCotizada> & Pick<FilaCotizada, 'id' | 'cotizacionId' | 'name'>): FilaCotizada => ({
  description: null,
  brand: null,
  model: null,
  unit: 'Pieza',
  unitCost: null,
  unitPrice: 0,
  imagenUrl: null,
  grupo: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  ...parcial,
});

const SWITCH_VIEJO = fila({
  id: 10,
  cotizacionId: 1,
  name: 'Switch Cisco Meraki MS130-48X',
  brand: 'Cisco Meraki',
  model: 'MS130-48X',
  description: 'Switch administrable, 48 puertos.',
  unitCost: '150000.00',
  unitPrice: '180000.00',
  createdAt: '2026-08-01T10:00:00.000Z',
});
const SWITCH_NUEVO = fila({
  ...SWITCH_VIEJO,
  id: 40,
  cotizacionId: 4,
  name: 'switch cisco  meraki ms130-48x',
  model: 'ms130-48x',
  description: 'Switch administrable en la nube, 48 puertos PoE+.',
  unitCost: '169516.74',
  unitPrice: '203420.09',
  grupo: 'EQUIPOS',
  createdAt: '2026-09-20T10:00:00.000Z',
});
const CAMARA = fila({
  id: 30,
  cotizacionId: 3,
  name: 'Cámara IP tipo bala',
  brand: 'Hikvision',
  model: 'DS-2CD2T46G2',
  unitPrice: 3890.5,
  createdAt: '2026-09-25T10:00:00.000Z',
});
const CABLE = fila({
  id: 35,
  cotizacionId: 3,
  name: 'Bobina de cable UTP Cat6',
  description: 'Para la conexión de cada cámara al switch.',
  unit: 'Rollo',
  unitPrice: 2100,
  createdAt: '2026-09-25T10:00:00.000Z',
});

describe('búsqueda de partidas frecuentes', () => {
  it('ignora acentos, mayúsculas y espacios de más', () => {
    expect(normalizarTexto('  Cámara   IP ')).toBe('camara ip');
    expect(palabrasDeBusqueda('Cámara  bala')).toEqual(['camara', 'bala']);
  });

  it('con menos de 2 letras no se busca', () => {
    expect(palabrasDeBusqueda('c')).toEqual([]);
    expect(palabrasDeBusqueda('   ')).toEqual([]);
    expect(filtroDePartidas('c')).toBeNull();
    expect(partidasFrecuentes([CAMARA], 'c')).toEqual([]);
  });

  it('«camara» también busca «cámara»: una variante por cada vocal acentuable', () => {
    expect(variantesDeAcento('camara')).toEqual(['camara', 'cámara', 'camára', 'camará']);
    const filtro = filtroDePartidas('camara')!;
    expect(filtro).toHaveLength(1);
    const buscado = JSON.stringify(filtro);
    expect(buscado).toContain('"name":{"contains":"cámara","mode":"insensitive"}');
    // Nombre, modelo, marca y descripción.
    for (const campo of ['name', 'model', 'brand', 'description']) expect(buscado).toContain(`"${campo}":`);
  });

  it('cada palabra tiene que aparecer (en cualquiera de los campos)', () => {
    expect(filtroDePartidas('switch 48')).toHaveLength(2);
    expect(partidasFrecuentes([SWITCH_VIEJO, CAMARA], 'switch 48').map((p) => p.model)).toEqual(['MS130-48X']);
    expect(partidasFrecuentes([SWITCH_VIEJO, CAMARA], 'switch bala')).toEqual([]);
  });
});

describe('qué se ofrece y con qué datos', () => {
  it('junta la misma partida aunque cambien mayúsculas y espacios, y trae los datos de la última vez', () => {
    const [unica, ...resto] = partidasFrecuentes([SWITCH_VIEJO, SWITCH_NUEVO], 'meraki');
    expect(resto).toEqual([]);
    expect(unica).toEqual({
      name: 'switch cisco  meraki ms130-48x',
      description: 'Switch administrable en la nube, 48 puertos PoE+.',
      brand: 'Cisco Meraki',
      model: 'ms130-48x',
      unit: 'Pieza',
      unitCost: 169516.74,
      unitPrice: 203420.09,
      imagenUrl: null,
      grupo: 'EQUIPOS',
      veces: 2,
      ultimaVez: '2026-09-20T10:00:00.000Z',
    });
    // El margen de la vez pasada no viaja: en la cotización nueva puede ser otro.
    expect(unica).not.toHaveProperty('marginPercent');
  });

  it('dos veces en la misma cotización cuenta una: «veces» son cotizaciones distintas', () => {
    const repetida = fila({ ...CAMARA, id: 31 });
    expect(partidasFrecuentes([CAMARA, repetida], 'bala')[0]!.veces).toBe(1);
  });

  it('el mismo nombre con otro modelo es otra partida', () => {
    const otroModelo = fila({ ...CAMARA, id: 50, cotizacionId: 5, model: 'DS-2CD2T86G2' });
    expect(partidasFrecuentes([CAMARA, otroModelo], 'camara').map((p) => p.model).sort()).toEqual([
      'DS-2CD2T46G2',
      'DS-2CD2T86G2',
    ]);
  });

  it('primero las más usadas; a igual uso, las más recientes', () => {
    const camaraOtraVez = fila({ ...CAMARA, id: 60, cotizacionId: 6, createdAt: '2026-08-10T10:00:00.000Z' });
    const domo = fila({ id: 70, cotizacionId: 7, name: 'Cámara domo', createdAt: '2026-09-28T10:00:00.000Z' });
    const turret = fila({ id: 20, cotizacionId: 2, name: 'Cámara turret', createdAt: '2026-07-01T10:00:00.000Z' });
    expect(partidasFrecuentes([turret, CAMARA, camaraOtraVez, domo], 'camara').map((p) => p.name)).toEqual([
      'Cámara IP tipo bala',
      'Cámara domo',
      'Cámara turret',
    ]);
  });

  it('lo que coincide en nombre, modelo o marca va antes de lo que solo lo menciona en la descripción', () => {
    // El cable se cotizó más veces, pero quien escribe «camara» busca la cámara.
    const cableOtraVez = fila({ ...CABLE, id: 80, cotizacionId: 8 });
    expect(partidasFrecuentes([CABLE, cableOtraVez, CAMARA], 'camara').map((p) => p.name)).toEqual([
      'Cámara IP tipo bala',
      'Bobina de cable UTP Cat6',
    ]);
  });

  it(`devuelve a lo más ${MAX_PARTIDAS_FRECUENTES}`, () => {
    const muchas = Array.from({ length: 20 }, (_, i) => fila({ id: i + 1, cotizacionId: i + 1, name: `Cámara modelo ${i + 1}` }));
    expect(partidasFrecuentes(muchas, 'camara')).toHaveLength(MAX_PARTIDAS_FRECUENTES);
  });

  it('un costo en cero o vacío es «sin costo», y el precio nunca sale negativo ni como texto', () => {
    const [p] = partidasFrecuentes([fila({ id: 1, cotizacionId: 1, name: 'Rack 12U', unitCost: '0.00', unitPrice: '1250.50' })], 'rack');
    expect(p!.unitCost).toBeNull();
    expect(p!.unitPrice).toBe(1250.5);
  });
});

describe('CotizacionesService.partidasFrecuentes — de quién son las partidas', () => {
  function build(filas: FilaCotizada[] = []) {
    const findMany = jest.fn().mockResolvedValue(filas);
    const prisma: any = { cotizacionItem: { findMany } };
    const service = new CotizacionesService(
      prisma,
      { publishEntityLifecycle: jest.fn(), requestAutoApproval: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, findMany };
  }

  it('solo lee cotizaciones de la empresa activa y sin borrar', async () => {
    const { service, findMany } = build([SWITCH_NUEVO]);

    const salida = await service.partidasFrecuentes('meraki', 7);

    const { where, take, select } = findMany.mock.calls[0][0];
    expect(where.cotizacion).toEqual({ companyId: 7, deletedAt: null });
    expect(where.AND).toEqual(filtroDePartidas('meraki'));
    expect(take).toBeLessThanOrEqual(300);
    // El margen de la partida no se lee: no hay forma de que viaje a la cotización nueva.
    expect(select).not.toHaveProperty('marginPercent');
    expect(salida).toHaveLength(1);
    expect(salida[0]).toMatchObject({ unitCost: 169516.74, unitPrice: 203420.09, veces: 1 });
  });

  it('sin empresa no deja pasar ninguna (nunca un filtro vacío)', async () => {
    const { service, findMany } = build();

    await service.partidasFrecuentes('meraki', null);

    expect(findMany.mock.calls[0][0].where.cotizacion).toEqual({ companyId: -1, deletedAt: null });
  });

  it('con menos de 2 letras ni siquiera consulta', async () => {
    const { service, findMany } = build();

    expect(await service.partidasFrecuentes('m', 7)).toEqual([]);
    expect(await service.partidasFrecuentes(undefined, 7)).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('la moneda y la cotización en edición acotan la búsqueda, sin soltar la empresa', async () => {
    const { service, findMany } = build();

    await service.partidasFrecuentes('meraki', 7, { moneda: 'usd', excluir: 42 });

    expect(findMany.mock.calls[0][0].where.cotizacion).toEqual({
      companyId: 7,
      deletedAt: null,
      currency: { equals: 'USD', mode: 'insensitive' },
      id: { not: 42 },
    });
  });

  it('una moneda o un id que no existen se ignoran en vez de filtrar con basura', async () => {
    const { service, findMany } = build();

    await service.partidasFrecuentes('meraki', 7, { moneda: 'EUR', excluir: Number('abc') });

    expect(findMany.mock.calls[0][0].where.cotizacion).toEqual({ companyId: 7, deletedAt: null });
  });
});
