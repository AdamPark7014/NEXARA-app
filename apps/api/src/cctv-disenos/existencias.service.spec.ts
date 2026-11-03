jest.mock('../catalog/catalog.service', () => ({ CatalogService: class {} }));
jest.mock('../cotizaciones/cotizaciones.service', () => ({ CotizacionesService: class {} }));
jest.mock('../smart-quote/search/product-search.service', () => ({ ProductSearchService: class {} }));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('./lectura-ficha.service', () => ({ LecturaFichaService: class {} }));

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ExistenciasCctvService } from './existencias.service';
import { SIN_PRECIO } from './existencias';

const oferta = (over: Record<string, unknown> = {}) => ({
  id: 77,
  clave: 'NVRDAH700',
  numParte: 'DHI-NVR4108HS-8P-4KS3',
  modelo: 'DHI-NVR4108HS-8P-4KS3',
  nombre: 'Grabador Dahua',
  marca: 'Dahua Technology',
  categoria: 'Video Vigilancia',
  subcategoria: 'Grabadores Digitales NVR',
  descripcion: 'NVR de 8 canales',
  imagen: null,
  stockTotal: 4,
  stockPreferred: 1,
  sellPriceSuggested: 4752,
  costMxn: 3000,
  leadTimeDays: 1,
  especificaciones: [],
  ...over,
});

const linea = (over: Record<string, unknown> = {}) => ({ clave: 'db-8', marca: 'Dahua', modelo: 'DHI-NVR4108HS-8P-4KS3', nombre: 'Grabador', cantidad: 2, grupo: 'EQUIPOS', ...over });

function armar(opciones: { productos?: unknown[]; ct?: unknown[]; diseno?: Record<string, unknown> | null; cotizacion?: Record<string, unknown> | null; items?: unknown[] } = {}) {
  const prisma = {
    // La primera consulta cruda que llega a cada tabla se distingue por su texto.
    $queryRaw: jest.fn((partes: TemplateStringsArray) => Promise.resolve(partes.join(' ').includes('FROM "Product"') ? (opciones.productos ?? []) : (opciones.ct ?? []))),
    stockLevel: { findMany: jest.fn().mockResolvedValue([{ productId: 5, quantity: 7, reservedQty: 2, unitCost: 900 }]) },
    cctvDiseno: { findFirst: jest.fn().mockResolvedValue(opciones.diseno === undefined ? { id: 3, nombre: 'Ejemplo · Bodega', clienteId: null, cotizacionId: null } : opciones.diseno), update: jest.fn().mockResolvedValue({}) },
    cotizacion: { findFirst: jest.fn().mockResolvedValue(opciones.cotizacion ?? null) },
    product: { findFirst: jest.fn().mockResolvedValue(null) },
    cctvEquipo: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const busqueda = {
    getProduct: jest.fn().mockResolvedValue({ data: oferta() }),
    search: jest.fn().mockResolvedValue({ data: [oferta()], meta: {} }),
    lineFromOffer: jest.fn((o: { id: number; costMxn?: number; sellPriceSuggested: number }, qty: number) => ({ productCtId: o.id, qty, unitPrice: o.sellPriceSuggested, unitCost: 3000, supplierCode: 'CT', supplierSku: 'NVRDAH700', tax: 16 })),
  };
  const lectura = { equipoDesdeFrase: jest.fn().mockResolvedValue({ familia: 'grabacion', tipo: 'nvr', marca: '', modelo: '', descripcion: 'Grabador', color: 'negro', cajaTrasera: false, lucesVisibles: 0, datos: [], caracteristicas: [], ms: 700 }) };
  const catalogo = { createProduct: jest.fn().mockResolvedValue({ id: 40, sku: 'DS-1' }) };
  const cotizaciones = {
    create: jest.fn().mockResolvedValue({ id: 500, quoteNumber: 'NX-500' }),
    update: jest.fn().mockResolvedValue({}),
    findOne: jest.fn().mockResolvedValue({ items: opciones.items ?? [], planos: [] }),
    agregarPlano: jest.fn().mockResolvedValue({}),
    quitarPlano: jest.fn().mockResolvedValue({}),
  };
  const s = new ExistenciasCctvService(prisma as never, busqueda as never, lectura as never, catalogo as never, cotizaciones as never);
  return { s, prisma, busqueda, lectura, catalogo, cotizaciones };
}

const FILA_CT = { id: 77, clave: 'NVRDAH700', modelo: 'DHI-NVR4108HS-8P-4KS3', numParte: 'DHI-NVR4108HS-8P-4KS3', marca: 'Dahua Technology', hay: false };
const actor = { id: 1, email: 'a@b.c' };

describe('disponibilidad', () => {
  const pedido = { clave: 'db-8', marca: 'Dahua', modelo: 'DHI-NVR4108HS-8P-4KS3', productId: null, ct: null };

  it('suma lo de Almacén menos lo apartado, y lee CT por modelo', async () => {
    const { s } = armar({ productos: [{ id: 5, sku: 'DHI-NVR4108HS-8P-4KS3', price: null }], ct: [FILA_CT] });
    const [d] = await s.disponibilidad(1, [pedido]);
    expect(d.almacen).toEqual({ productId: 5, sku: 'DHI-NVR4108HS-8P-4KS3', piezas: 5 });
    expect(d.ct).toMatchObject({ clave: 'NVRDAH700', piezas: 4, cerca: 1, ligado: 'modelo' });
  });

  it('el precio que enseña es el mismo que va a decir la cotización: costo más 30 %', async () => {
    const { s } = armar({ ct: [FILA_CT] });
    const [d] = await s.disponibilidad(1, [pedido]);
    expect(d.ct?.precio).toBe(3900);
  });

  it('nunca enseña el costo de CT', async () => {
    const { s } = armar({ ct: [FILA_CT] });
    const [d] = await s.disponibilidad(1, [pedido]);
    expect(JSON.stringify(d)).not.toMatch(/cost/i);
  });

  it('sin coincidencia no hay nada, ni en Almacén ni en CT', async () => {
    const { s } = armar();
    expect((await s.disponibilidad(1, [pedido]))[0]).toEqual({ clave: 'db-8', almacen: null, ct: null });
  });

  it('el mismo modelo de otra marca no cuenta', async () => {
    const { s } = armar({ ct: [{ ...FILA_CT, marca: 'Hikvision' }] });
    expect((await s.disponibilidad(1, [pedido]))[0].ct).toBeNull();
  });

  it('lo elegido a mano gana y queda dicho', async () => {
    const { s } = armar({ ct: [FILA_CT] });
    const [d] = await s.disponibilidad(1, [{ ...pedido, modelo: 'Otro nombre', ct: 'NVRDAH700' }]);
    expect(d.ct).toMatchObject({ clave: 'NVRDAH700', ligado: 'manual' });
  });

  it('una lista vacía no consulta', async () => {
    const { s, prisma } = armar();
    expect(await s.disponibilidad(1, [])).toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('pasar a cotización', () => {
  it('crea en borrador con sus partidas y queda ligada al diseño', async () => {
    const { s, cotizaciones, prisma } = armar({ ct: [FILA_CT] });
    const r = await s.pasarACotizacion(actor, 3, { lineas: [linea()] }, 1);
    expect(r).toMatchObject({ cotizacionId: 500, quoteNumber: 'NX-500', creada: true, partidas: 1, sinPrecio: 0 });
    const dto = cotizaciones.create.mock.calls[0][0];
    expect(dto).toMatchObject({ segmento: 'COMERCIAL', trabajo: 'Ejemplo · Bodega', clienteSinAlta: true, clientName: 'Cliente por definir' });
    expect(dto.items[0]).toMatchObject({ paqueteClave: 'cctv:3', productCtId: 77, qty: 2, unitCost: 3000, marginPercent: 30, supplierCode: 'CT', name: 'Grabador' });
    expect(prisma.cctvDiseno.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { cotizacionId: 500 } });
  });

  it('con cliente en el diseño, la cotización lleva ese cliente y no da de alta otro', async () => {
    const { s, cotizaciones } = armar({ diseno: { id: 3, nombre: 'X', clienteId: 9, cotizacionId: null } });
    await s.pasarACotizacion(actor, 3, { lineas: [linea()] }, 1);
    const dto = cotizaciones.create.mock.calls[0][0];
    expect(dto.salesClientId).toBe(9);
    expect(dto).not.toHaveProperty('clienteSinAlta');
  });

  it('lo que no tiene precio va en cero y se cuenta', async () => {
    const { s, cotizaciones } = armar();
    const r = await s.pasarACotizacion(actor, 3, { lineas: [linea({ modelo: 'SIN-CT-1' })] }, 1);
    expect(r.sinPrecio).toBe(1);
    expect(cotizaciones.create.mock.calls[0][0].items[0]).toMatchObject({ unitPrice: 0, notes: SIN_PRECIO });
  });

  it('un precio de la pantalla se ignora', async () => {
    const { s, cotizaciones } = armar({ ct: [FILA_CT] });
    await s.pasarACotizacion(actor, 3, { lineas: [linea({ unitPrice: 1, unitCost: 1 })] }, 1);
    expect(cotizaciones.create.mock.calls[0][0].items[0].unitPrice).toBe(4752);
  });

  it('al actualizar reemplaza solo las suyas: lo capturado a mano se queda', async () => {
    const mano = { id: 1, paqueteClave: null, name: 'Mano de obra', qty: 1, unitPrice: 5000 };
    const vieja = { id: 2, paqueteClave: 'cctv:3', name: 'Grabador viejo', qty: 9, unitPrice: 1 };
    const { s, cotizaciones } = armar({ diseno: { id: 3, nombre: 'X', clienteId: null, cotizacionId: 500 }, cotizacion: { id: 500, status: 'DRAFT', quoteNumber: 'NX-500' }, items: [mano, vieja], ct: [FILA_CT] });
    const r = await s.pasarACotizacion(actor, 3, { lineas: [linea()] }, 1);
    expect(r).toMatchObject({ creada: false, conservadas: 1, partidas: 1 });
    expect(cotizaciones.create).not.toHaveBeenCalled();
    const items = cotizaciones.update.mock.calls[0][1].items;
    expect(items).toHaveLength(2);
    expect(items[0]).toBe(mano);
    expect(items[1]).toMatchObject({ name: 'Grabador', qty: 2 });
  });

  it('la que ya salió al cliente no se reabre desde aquí', async () => {
    const { s, cotizaciones } = armar({ diseno: { id: 3, nombre: 'X', clienteId: null, cotizacionId: 500 }, cotizacion: { id: 500, status: 'SENT', quoteNumber: 'NX-500' } });
    await expect(s.pasarACotizacion(actor, 3, { lineas: [linea()] }, 1)).rejects.toThrow(ConflictException);
    await expect(s.pasarACotizacion(actor, 3, { lineas: [linea()] }, 1)).rejects.toThrow(/ya salió al cliente/);
    expect(cotizaciones.update).not.toHaveBeenCalled();
    expect(cotizaciones.create).not.toHaveBeenCalled();
  });

  it('«crear otra» hace una nueva aunque ya tenga una', async () => {
    const { s, cotizaciones } = armar({ diseno: { id: 3, nombre: 'X', clienteId: null, cotizacionId: 500 }, cotizacion: { id: 500, status: 'SENT', quoteNumber: 'NX-500' } });
    const r = await s.pasarACotizacion(actor, 3, { lineas: [linea()], nueva: true }, 1);
    expect(r.creada).toBe(true);
    expect(cotizaciones.update).not.toHaveBeenCalled();
  });

  it('si la cotización ligada ya no existe, crea una', async () => {
    const { s, cotizaciones } = armar({ diseno: { id: 3, nombre: 'X', clienteId: null, cotizacionId: 500 }, cotizacion: null });
    await s.pasarACotizacion(actor, 3, { lineas: [linea()] }, 1);
    expect(cotizaciones.create).toHaveBeenCalled();
  });

  it('un ejemplo no gasta el consecutivo de nadie', async () => {
    const { s, cotizaciones } = armar();
    await s.pasarACotizacion(actor, 3, { lineas: [linea()] }, 1, { folioManual: 'EJ-CCTV-3' });
    expect(cotizaciones.create.mock.calls[0][0].quoteNumber).toBe('EJ-CCTV-3');
  });

  it('un diseño de otra empresa o archivado no existe', async () => {
    const { s } = armar({ diseno: null });
    await expect(s.pasarACotizacion(actor, 3, { lineas: [linea()] }, 1)).rejects.toThrow(NotFoundException);
  });
});

describe('buscar en CT', () => {
  it('«domo dahua 5mp» busca a Dahua dentro de los domos y pone primero los de 5 MP', async () => {
    const { s, busqueda } = armar();
    busqueda.search.mockResolvedValue({ data: [oferta({ clave: 'A', descripcion: 'Domo 2 MP' }), oferta({ clave: 'B', descripcion: 'Domo 5 MP' })], meta: {} });
    const r = await s.buscarCt('domo dahua 5mp', '');
    expect(busqueda.search).toHaveBeenCalledWith(expect.objectContaining({ q: 'dahua', subcategory: 'domo', inStockOnly: false }));
    expect(r.resultados.map((x) => x.clave)).toEqual(['B', 'A']);
  });

  it('si con todas las palabras no hay nada, quita las últimas', async () => {
    const { s, busqueda } = armar();
    busqueda.search.mockResolvedValueOnce({ data: [], meta: {} }).mockResolvedValueOnce({ data: [oferta()], meta: {} });
    const r = await s.buscarCt('dahua exterior', '');
    expect(busqueda.search.mock.calls.map((c: Array<{ q: string }>) => c[0].q)).toEqual(['dahua exterior', 'dahua']);
    expect(r.resultados).toHaveLength(1);
  });

  it('con familia, se queda sin palabras antes que sin resultados', async () => {
    const { s, busqueda } = armar();
    busqueda.search.mockResolvedValueOnce({ data: [], meta: {} }).mockResolvedValueOnce({ data: [oferta()], meta: {} });
    await s.buscarCt('nvr canales', '');
    expect(busqueda.search.mock.calls.map((c: Array<{ q: string; subcategory: string }>) => [c[0].q, c[0].subcategory])).toEqual([['canales', 'Grabadores'], ['', 'Grabadores']]);
  });

  it('sin familia no se queda sin palabras: sería todo el catálogo', async () => {
    const { s, busqueda } = armar();
    busqueda.search.mockResolvedValue({ data: [], meta: {} });
    expect((await s.buscarCt('xyzzy', '')).resultados).toEqual([]);
    expect(busqueda.search).toHaveBeenCalledTimes(1);
  });

  it('sin texto ni familia no busca', async () => {
    const { s, busqueda } = armar();
    expect(await s.buscarCt('', '')).toEqual({ resultados: [] });
    expect(busqueda.search).not.toHaveBeenCalled();
  });

  it('nunca enseña el costo', async () => {
    const { s } = armar();
    const r = await s.buscarCt('dahua', '');
    expect(JSON.stringify(r)).not.toMatch(/cost/i);
  });
});

describe('ficha desde CT', () => {
  it('lee con IA lo que dice CT', async () => {
    const { s, lectura } = armar();
    const f = await s.fichaDesdeCt(1, 'NVRDAH700');
    expect(lectura.equipoDesdeFrase.mock.calls[0][1]).toContain('modelo DHI-NVR4108HS-8P-4KS3');
    expect(f).toMatchObject({ tipo: 'nvr', familia: 'grabacion', marca: 'Dahua', modelo: 'DHI-NVR4108HS-8P-4KS3', ct: 'NVRDAH700', sinLectura: false });
  });

  it('sin IA queda con lo de CT y lo dice', async () => {
    const { s, lectura } = armar();
    lectura.equipoDesdeFrase.mockRejectedValue(new Error('sin puerta'));
    expect(await s.fichaDesdeCt(1, 'NVRDAH700')).toMatchObject({ tipo: 'nvr', sinLectura: true, datos: [] });
  });

  it('si ya no está en CT lo dice', async () => {
    const { s, busqueda } = armar();
    busqueda.getProduct.mockResolvedValue(null);
    await expect(s.fichaDesdeCt(1, 'X')).rejects.toThrow(NotFoundException);
    await expect(s.fichaDesdeCt(1, '')).rejects.toThrow(BadRequestException);
  });
});

describe('dar de alta en Almacén', () => {
  it('crea el producto en el inventario de siempre y lo liga', async () => {
    const { s, catalogo, prisma } = armar();
    const r = await s.altaEnAlmacen(1, { marca: 'Hikvision', modelo: 'ds-1', equipoId: 4 });
    expect(catalogo.createProduct).toHaveBeenCalledWith(expect.objectContaining({ sku: 'DS-1', name: 'Hikvision ds-1', tipoArticulo: 'EQUIPO', companyId: 1 }));
    expect(prisma.cctvEquipo.updateMany).toHaveBeenCalledWith({ where: { id: 4, companyId: 1 }, data: { productId: 40 } });
    expect(r).toEqual({ productId: 40, sku: 'DS-1', yaExistia: false });
  });

  it('si ya estaba, no lo duplica: solo lo liga', async () => {
    const { s, catalogo, prisma } = armar();
    prisma.product.findFirst.mockResolvedValue({ id: 7, sku: 'DS-1' });
    const r = await s.altaEnAlmacen(1, { modelo: 'DS-1' });
    expect(catalogo.createProduct).not.toHaveBeenCalled();
    expect(r.yaExistia).toBe(true);
  });

  it('sin modelo no hay alta', async () => {
    const { s } = armar();
    await expect(s.altaEnAlmacen(1, {})).rejects.toThrow(BadRequestException);
  });
});

describe('plano en la cotización', () => {
  it('reemplaza el suyo y no toca los demás anexos', async () => {
    const { s, cotizaciones } = armar({ diseno: { id: 3, nombre: 'X', clienteId: null, cotizacionId: 500 } });
    cotizaciones.findOne.mockResolvedValue({ items: [], planos: [{ nombre: 'Plano de videovigilancia', url: '/u/a.png' }, { nombre: 'Levantamiento', url: '/u/b.png' }] });
    await s.adjuntarPlano(3, { buffer: Buffer.from('x') }, 'Plano de videovigilancia', 1);
    expect(cotizaciones.quitarPlano).toHaveBeenCalledTimes(1);
    expect(cotizaciones.quitarPlano).toHaveBeenCalledWith(500, '/u/a.png', 1);
    expect(cotizaciones.agregarPlano).toHaveBeenCalledWith(500, expect.anything(), 'Plano de videovigilancia', 1);
  });

  it('sin cotización no hay dónde', async () => {
    const { s } = armar();
    await expect(s.adjuntarPlano(3, { buffer: Buffer.from('x') }, 'x', 1)).rejects.toThrow(BadRequestException);
  });
});
