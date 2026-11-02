import { armarCatalogo, compararCosto, conCostoDeHoy, modelosComparables, modelosDePartidas, propuestaConCostos, type FilaCt } from './costo-de-hoy';
import type { PartidaPropuesta } from './cotizar-frase';

const AHORA = new Date('2026-11-02T18:00:00Z');
const HACE_UNA_HORA = new Date('2026-11-02T17:00:00Z');
const TIPO = 20;

const fila = (cambios: Partial<FilaCt>): FilaCt => ({
  clave: 'ACP1',
  modelo: 'EAP660 HD',
  numParte: 'EAP660 HD',
  precio: 250,
  moneda: 'USD',
  tipoCambio: TIPO,
  existencia: { '14A': 6 },
  ...cambios,
});

const catalogo = (filas: FilaCt[], sincronizo: Date | null = HACE_UNA_HORA) => armarCatalogo(filas, TIPO, sincronizo);

describe('compararCosto', () => {
  it('compara en pesos, sin guiones ni espacios, y dice en qué dirección', () => {
    const r = compararCosto(6250, 'EAP660HD', catalogo([fila({})]), AHORA);
    expect(r).toMatchObject({ costo: 5000, piezas: 6, clave: 'ACP1', alDia: true });
    expect(r!.diferencia).toBeCloseTo(-0.2, 5);
  });

  it('también por número de parte: el modelo de CT puede ser otro nombre', () => {
    const c = catalogo([fila({ modelo: 'ZC300', numParte: 'ZC32-000C000LA00', precio: 1200 })]);
    expect(compararCosto(22000, 'ZC32000C000LA00', c, AHORA)).toMatchObject({ costo: 24000 });
  });

  it('también por la clave de CT', () => {
    const c = catalogo([fila({ clave: 'ACP1', modelo: null, numParte: null })]);
    expect(compararCosto(6250, 'ACP1', c, AHORA)).toMatchObject({ costo: 5000 });
  });

  it('hasta 3 % no avisa, en ninguna dirección', () => {
    const c = catalogo([fila({ precio: 100, moneda: 'MXN', tipoCambio: 1 })]);
    expect(compararCosto(100, 'EAP660HD', c, AHORA)).toBeNull();
    expect(compararCosto(103, 'EAP660HD', c, AHORA)).toBeNull();
    expect(compararCosto(97.09, 'EAP660HD', c, AHORA)).toBeNull();
    expect(compararCosto(90, 'EAP660HD', c, AHORA)).not.toBeNull();
    expect(compararCosto(110, 'EAP660HD', c, AHORA)).not.toBeNull();
  });

  it('sin costo guardado no hay con qué comparar', () => {
    const c = catalogo([fila({})]);
    expect(compararCosto(0, 'EAP660HD', c, AHORA)).toBeNull();
    expect(compararCosto(null, 'EAP660HD', c, AHORA)).toBeNull();
  });

  it('varias versiones a distinto precio no se comparan: ZC300 da una cinta y una impresora', () => {
    const c = catalogo([
      fila({ clave: 'CAR1', modelo: 'ZC300', numParte: 'ZC300-C1', precio: 40 }),
      fila({ clave: 'IMP1', modelo: 'ZC300', numParte: 'ZC300-I1', precio: 1200 }),
    ]);
    expect(compararCosto(23000, 'ZC300', c, AHORA)).toBeNull();
  });

  it('dos filas casi al mismo precio son una: gana la que tiene piezas', () => {
    const c = catalogo([
      fila({ clave: 'CPU2', modelo: 'QC24251', numParte: 'XHVWF', precio: 21950, moneda: 'MXN', tipoCambio: 1, existencia: {} }),
      fila({ clave: 'CPU1', modelo: 'QC24251', numParte: '5J2JR', precio: 22000, moneda: 'MXN', tipoCambio: 1 }),
    ]);
    expect(compararCosto(25000, 'QC24251', c, AHORA)).toMatchObject({ clave: 'CPU1', costo: 22000, piezas: 6 });
  });

  it('una fila en dólares que no siguió el tipo de cambio del día no dice «hoy»', () => {
    const c = catalogo([fila({ tipoCambio: 18 })]);
    expect(compararCosto(6250, 'EAP660HD', c, AHORA)).toBeNull();
  });

  it('sin tipo de cambio no se adivina uno', () => {
    const sinTipo = armarCatalogo([fila({ tipoCambio: null })], null, HACE_UNA_HORA);
    expect(compararCosto(6250, 'EAP660HD', sinTipo, AHORA)).toBeNull();
  });

  it('sin piezas también avisa: es «sobre pedido»', () => {
    expect(compararCosto(6250, 'EAP660HD', catalogo([fila({ existencia: {} })]), AHORA)).toMatchObject({ piezas: 0 });
  });

  it('con más de 24 horas sin sincronizar deja de estar al día y dice de cuándo es', () => {
    const r = compararCosto(6250, 'EAP660HD', catalogo([fila({})], new Date('2026-11-01T17:00:00Z')), AHORA);
    expect(r).toMatchObject({ alDia: false, fecha: '2026-11-01T17:00:00.000Z' });
    expect(compararCosto(6250, 'EAP660HD', catalogo([fila({})], null), AHORA)).toMatchObject({ alDia: false, fecha: null });
  });
});

describe('modelosComparables', () => {
  const base = { name: 'Access point', model: 'EAP660HD', unit: 'Pieza', unitCost: 100 };

  it('quita guiones y no repite', () => {
    expect(modelosComparables([{ ...base, model: 'TL-SG1428PE' }, { ...base, model: 'tl sg1428pe' }])).toEqual(['TLSG1428PE']);
  });

  it('deja fuera lo que no se puede comparar', () => {
    expect(
      modelosComparables([
        { ...base, unitCost: null },
        { ...base, unit: 'Metro' },
        { ...base, unit: 'Servicio' },
        { ...base, model: 'N/A' },
        { ...base, model: 'A1' },
        { ...base, model: null },
      ]),
    ).toEqual([]);
  });

  it('lee el modelo de una fila de Excel pegada entera', () => {
    expect(modelosComparables([{ ...base, model: '4\tPza\tNVR 32 Canales\tDHI-NVR5432-EI2\t$100.00' }])).toEqual(['DHINVR5432EI2']);
  });

  it('sin unidad o con otra forma de decir pieza sí se compara', () => {
    expect(modelosComparables([{ ...base, unit: null }, { ...base, unit: 'Pza', model: 'MC220L' }])).toEqual(['EAP660HD', 'MC220L']);
  });
});

describe('conCostoDeHoy', () => {
  it('sin aviso la partida queda igual, sin el campo', () => {
    const p = { name: 'Access point', model: 'SINCT123', unit: 'Pieza', unitCost: 100 };
    expect(conCostoDeHoy(p, catalogo([fila({})]), AHORA)).toEqual(p);
  });

  it('no cambia ni el costo ni el precio', () => {
    const p = { name: 'Access point', model: 'EAP660HD', unit: 'Pieza', unitCost: 6250, unitPrice: 6250 };
    expect(conCostoDeHoy(p, catalogo([fila({})]), AHORA)).toMatchObject({ unitCost: 6250, unitPrice: 6250, costoDeHoy: { costo: 5000 } });
  });
});

describe('la propuesta', () => {
  const opcion = {
    fuente: 'usada' as const,
    name: 'Access point Omada',
    description: null,
    brand: 'Omada',
    model: 'EAP660HD',
    unit: 'Pieza',
    unitCost: 6250,
    unitPrice: 6250,
    grupo: null,
    imagenUrl: null,
    veces: 1,
    ultimaVez: null,
    stock: null,
    productCtId: null,
  };
  const partida = (cambios: Partial<PartidaPropuesta>): PartidaPropuesta => ({
    pedido: 'Access point',
    cantidad: 1,
    unidad: 'Pieza',
    fuente: 'usada',
    seguridad: 'alta',
    name: 'Access point Omada',
    description: null,
    brand: 'Omada',
    model: 'EAP660HD',
    unitCost: 6250,
    unitPrice: 6250,
    grupo: null,
    imagenUrl: null,
    veces: 1,
    ultimaVez: null,
    stock: null,
    productCtId: null,
    alternativas: [],
    ...cambios,
  });

  it('solo revisa lo ya cotizado: lo del mayorista ya trae el costo de hoy', () => {
    const lista = [partida({}), partida({ fuente: 'catalogo', model: 'MC220L', unitCost: 300 }), partida({ fuente: 'libre', model: null, unitCost: null })];
    expect(modelosDePartidas(lista)).toEqual(['EAP660HD']);
    const [usada, delMayorista, libre] = propuestaConCostos(lista, catalogo([fila({}), fila({ clave: 'ACC1', modelo: 'MC220L', numParte: 'MC220L', precio: 15 })]), AHORA);
    expect(usada!.costoDeHoy).toMatchObject({ costo: 5000 });
    expect(delMayorista).not.toHaveProperty('costoDeHoy');
    expect(libre).not.toHaveProperty('costoDeHoy');
  });

  it('las opciones también traen su aviso, para cuando se elijan', () => {
    const lista = [partida({ fuente: 'libre', seguridad: 'media', model: null, unitCost: null, alternativas: [opcion] })];
    expect(modelosDePartidas(lista)).toEqual(['EAP660HD']);
    expect(propuestaConCostos(lista, catalogo([fila({})]), AHORA)[0]!.alternativas[0]!.costoDeHoy).toMatchObject({ costo: 5000 });
  });

  it('un renglón por metro no se compara aunque el modelo exista', () => {
    const lista = [partida({ unidad: 'Metro' })];
    expect(modelosDePartidas(lista)).toEqual([]);
    expect(propuestaConCostos(lista, catalogo([fila({})]), AHORA)[0]).not.toHaveProperty('costoDeHoy');
  });
});
