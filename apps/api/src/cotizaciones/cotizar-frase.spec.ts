import {
  CLIENTE_GENERICO,
  armarPropuesta,
  bastaConElCodigo,
  leerFrase,
  leerLista,
  leerRenglon,
  margenDeFrase,
  padronDeCotizar,
  proyectoPorOmision,
  resolverCliente,
  segmentoDeFrase,
  sinIvaDeFrase,
  type DependenciasCotizar,
} from './cotizar-frase';
import { candidatosDeUsadas, type CandidatoPartida } from './emparejar-partidas';
import type { FilaCotizada } from './partidas-frecuentes';

const fila = (id: number, cotizacionId: number, name: string, datos: Partial<FilaCotizada> = {}): FilaCotizada => ({
  id,
  cotizacionId,
  name,
  unit: 'Pieza',
  unitCost: 100,
  unitPrice: 120,
  createdAt: '2026-10-01T12:00:00Z',
  ...datos,
});

const FILAS = [
  fila(1, 10, 'Cámara IP domo 4 MP lente 2.8 mm', { brand: 'Hikvision', model: 'DS-2CD1143G2', unitCost: 1450, unitPrice: 1740 }),
  fila(2, 10, 'NVR 32 canales 4K', { brand: 'Hikvision', model: 'DS-7632NXI', unitCost: 7800, unitPrice: 9360 }),
  fila(3, 11, 'Disco duro 6 TB para videovigilancia', { model: 'HDWT860', unitCost: 3100, unitPrice: 3720 }),
  fila(4, 10, 'Instalación de cámara de seguridad', { unit: 'Servicio', unitPrice: 350 }),
];

const PADRON = [
  { id: 1, name: CLIENTE_GENERICO },
  { id: 2, name: 'Hotel Portal de Analco' },
  { id: 5, name: 'Bodega de' },
  { id: 6, name: 'Licencia' },
  { id: 8, name: 'Hotel Aurora' },
];

function deps(cambios: Partial<DependenciasCotizar<string>> = {}): DependenciasCotizar<string> {
  return {
    padron: PADRON,
    usados: [{ nombre: 'Materiales Pronto', salesClientId: 5 }],
    generico: { id: 1 },
    candidatos: candidatosDeUsadas(FILAS),
    buscarCatalogo: async () => [],
    preguntarIa: jest.fn(async () => {
      throw new Error('no debía llamarse');
    }),
    ...cambios,
  };
}

describe('leerRenglon', () => {
  it('lee cantidad, unidad, concepto y precio', () => {
    expect(leerRenglon('- 4 pzas NVR 32 canales $16,019.37')).toEqual({ cantidad: 4, unidad: null, concepto: 'NVR 32 canales', precio: 16019.37 });
    expect(leerRenglon('120 metros de cable UTP')).toMatchObject({ cantidad: 120, unidad: 'Metro', concepto: 'cable UTP' });
    expect(leerRenglon('cámara domo x14')).toMatchObject({ cantidad: 14, concepto: 'cámara domo' });
    expect(leerRenglon('catorce cámaras domo')).toMatchObject({ cantidad: 14, concepto: 'cámaras domo' });
  });

  it('una licencia sigue siendo el producto, no la unidad', () => {
    expect(leerRenglon('60 licencias Omada')).toMatchObject({ cantidad: 60, unidad: null, concepto: 'licencias Omada' });
  });

  it('lee las columnas que se pegan de Excel', () => {
    expect(leerRenglon('4\tPza\tNVR 32 Canales IP 8K\tDS-7632NXI\t7,800.00')).toEqual({
      cantidad: 4,
      unidad: 'Pieza',
      concepto: 'NVR 32 Canales IP 8K',
      modelo: 'DS-7632NXI',
      marca: null,
      precio: 7800,
    });
    expect(leerRenglon('1\tLote\tConfiguración lógica\tNEX-CONF\t4,500.00')).toMatchObject({ modelo: 'NEX-CONF', unidad: 'Lote' });
  });

  it('no toma cabeceras ni totales por partidas', () => {
    expect(leerRenglon('Cantidad\tUnidad\tDescripción\tPrecio')).toBeNull();
    expect(leerRenglon('Subtotal\t\t\t141,875.00')).toBeNull();
    expect(leerRenglon('IVA')).toBeNull();
  });
});

describe('leerLista', () => {
  it('una frase no es una lista', () => {
    expect(leerLista('14 cámaras domo con NVR de 32 para Hotel Aurora')).toBeNull();
  });

  it('lista con viñetas y el cliente en el encabezado', () => {
    const lista = leerLista('Propuesta para Hotel Aurora\n- 10 cámaras domo\n- 1 NVR 32 canales\n- instalación x10');
    expect(lista?.destino).toBe('Hotel Aurora');
    expect(lista?.lineas.map((l) => [l.cantidad, l.concepto])).toEqual([
      [10, 'cámaras domo'],
      [1, 'NVR 32 canales'],
      [10, 'instalación'],
    ]);
  });

  it('una sola fila con columnas también cuenta', () => {
    expect(leerLista('6\tPieza\tLaptop Lenovo V14\t23,600.00')?.lineas).toHaveLength(1);
  });
});

describe('leerFrase', () => {
  it('saca el destino y parte en renglones', () => {
    const f = leerFrase('Cotízame 14 cámaras domo con NVR de 32 y canalización para la bodega de Materiales Pronto');
    expect(f.destino).toBe('bodega de Materiales Pronto');
    expect(f.lineas.map((l) => l.concepto)).toEqual(['cámaras domo', 'NVR de 32', 'canalización']);
    expect(f.lineas[0]!.cantidad).toBe(14);
  });

  it('«para una oficina» no es un cliente', () => {
    expect(leerFrase('20 conectores RJ45 para una oficina').destino).toBeNull();
  });

  it('lo que se dice de la cotización no se vuelve renglón', () => {
    expect(leerFrase('10 cámaras domo sin factura con margen de 22').lineas.map((l) => l.concepto)).toEqual(['cámaras domo']);
  });
});

describe('lo que se dice aparte de las partidas', () => {
  it('margen, IVA y segmento', () => {
    expect(margenDeFrase('35 routers con margen de 22')).toBe(22);
    expect(margenDeFrase('10 cámaras al 15 %')).toBe(15);
    expect(margenDeFrase('14 cámaras a 8 MP')).toBeNull();
    expect(sinIvaDeFrase('10 cámaras sin factura')).toBe(true);
    expect(segmentoDeFrase('póliza de mantenimiento')).toBe('SERVICIO');
    expect(segmentoDeFrase('14 cámaras')).toBe('COMERCIAL');
  });
});

describe('resolverCliente', () => {
  const conocidos = padronDeCotizar(PADRON, [{ nombre: 'Materiales Pronto', salesClientId: 5 }]);

  it('sin decir cliente queda el genérico, como 19 de 56', () => {
    expect(resolverCliente(null, conocidos, { id: 1 })).toMatchObject({ salesClientId: 1, nombre: CLIENTE_GENERICO, seguridad: 'generico' });
  });

  it('reconoce el nombre dentro de lo dicho, con el que ya se cotizó', () => {
    expect(resolverCliente('bodega de Materiales Pronto', conocidos, null)).toMatchObject({ salesClientId: 5, nombre: 'Materiales Pronto', seguridad: 'alta' });
  });

  it('«Bodega de», basura del padrón, no se reconoce sola', () => {
    expect(conocidos.some((c) => c.name === 'Bodega de')).toBe(false);
    expect(resolverCliente('Zapatos del Centro', conocidos, null)).toMatchObject({ salesClientId: null, nombre: 'Zapatos del Centro', seguridad: 'nuevo' });
  });
});

describe('bastaConElCodigo', () => {
  const candidatos = candidatosDeUsadas(FILAS);
  const conocidos = padronDeCotizar(PADRON, []);

  it('una lista siempre', () => {
    const lectura = leerLista('10 cámaras domo\n1 algo que nunca se cotizó')!;
    expect(bastaConElCodigo(lectura, candidatos, resolverCliente(null, conocidos, null))).toBe(true);
  });

  it('una frase solo si reconoce todo', () => {
    const generico = resolverCliente(null, conocidos, null);
    expect(bastaConElCodigo(leerFrase('4 NVR 32 canales, 8 discos duros de 6 TB'), candidatos, generico)).toBe(true);
    expect(bastaConElCodigo(leerFrase('4 NVR 32 canales con pantalla'), candidatos, generico)).toBe(false);
    expect(bastaConElCodigo(leerFrase('4 NVR 32 canales'), candidatos, resolverCliente('Zapatos del Centro', conocidos, null))).toBe(false);
  });
});

describe('armarPropuesta', () => {
  it('una lista no gasta tokens y respeta lo pegado', async () => {
    const d = deps();
    const r = await armarPropuesta('2\tPza\tGabinete de pared 6U\tSR-1906\t2,474.54\n4\tPza\tNVR 32 canales\tDS-7632NXI\t7,800.00', d);
    expect(d.preguntarIa).not.toHaveBeenCalled();
    expect(r.via).toBe('lista');
    expect(r.uso).toBeNull();
    expect(r.partidas[0]).toMatchObject({ cantidad: 2, model: 'SR-1906', unitPrice: 2474.54, fuente: 'libre' });
    expect(r.partidas[1]).toMatchObject({ cantidad: 4, model: 'DS-7632NXI', unitPrice: 7800, fuente: 'usada' });
  });

  it('si la frase no se reconoce pregunta a la IA y empareja lo que devuelve', async () => {
    const preguntarIa = jest.fn(async () => ({
      cliente: 'Hotel Portal de Analco',
      proyecto: 'Videovigilancia en recepción',
      lineas: [
        { cant: 6, unidad: null, concepto: 'Cámara IP domo 4 MP' },
        { cant: 1, unidad: 'Lote', concepto: 'Canalización' },
      ],
      uso: 'medido',
    }));
    const r = await armarPropuesta('seis domos de cuatro megas y la canalización para el portal de analco', deps({ preguntarIa }));
    expect(preguntarIa).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ via: 'ia', uso: 'medido', proyecto: 'Videovigilancia en recepción' });
    expect(r.cliente).toMatchObject({ salesClientId: 2, seguridad: 'alta' });
    expect(r.partidas[0]).toMatchObject({ cantidad: 6, model: 'DS-2CD1143G2', unitPrice: 1740, fuente: 'usada', seguridad: 'alta' });
    expect(r.partidas[1]).toMatchObject({ cantidad: 1, unidad: 'Lote', fuente: 'libre', unitPrice: 0 });
    expect(r.avisos.join(' ')).toContain('no tiene precio');
  });

  it('si la IA falla queda lo que leyó el código, con aviso', async () => {
    const r = await armarPropuesta('6 domos de 4 megas para algo raro', deps());
    expect(r.via).toBe('codigo');
    expect(r.partidas[0]).toMatchObject({ cantidad: 6 });
    expect(r.avisos[0]).toContain('La IA no respondió');
  });

  it('sin saber a quién: el genérico', async () => {
    const r = await armarPropuesta('4 NVR 32 canales, 8 discos duros de 6 TB', deps());
    expect(r.via).toBe('codigo');
    expect(r.cliente).toMatchObject({ salesClientId: 1, nombre: CLIENTE_GENERICO });
  });

  it('lo del mayorista lleva el margen dicho; lo que no es seguro no mete su precio', async () => {
    const ct = (name: string, model: string, brand: string, costo: number): CandidatoPartida => ({
      fuente: 'catalogo', name, description: null, brand, model, unit: 'Pieza', unitCost: costo, unitPrice: 0, grupo: 'EQUIPOS',
      imagenUrl: null, veces: 0, ultimaVez: null, stock: 3, productCtId: 9, cotizaciones: [],
    });
    const r = await armarPropuesta('2 reguladores 2000 VA y 3 inyectores PoE con margen de 10', deps({
      buscarCatalogo: async (c) => /regulador/i.test(c)
        ? [ct('Regulador 2000 VA', 'CL2000VR', 'CyberPower', 700)]
        : [ct('Inyector PoE TP-Link', 'TL-POE150S', 'TP-Link', 300), ct('Inyector PoE Ubiquiti', 'U-POE-AT', 'Ubiquiti', 200)],
    }));
    expect(r.margen).toBe(10);
    expect(r.partidas[0]).toMatchObject({ fuente: 'catalogo', unitCost: 700, unitPrice: 770, seguridad: 'alta' });
    expect(r.partidas[1]).toMatchObject({ fuente: 'libre', unitPrice: 0 });
    expect(r.partidas[1]!.alternativas.map((a) => a.model)).toEqual(['U-POE-AT', 'TL-POE150S']);
  });

  it('ofrece lo que suele ir con esto y reconoce una cotización casi igual', async () => {
    const r = await armarPropuesta('4 NVR 32 canales, 8 cámaras domo', deps());
    expect(r.parecida).toMatchObject({ id: 10, enComun: 2, deLineas: 2 });
    const complementos = r.complementos.map((c) => c.pedido);
    expect(complementos).toContain('Disco duro para videovigilancia');
    expect(complementos).toContain('Instalación de cámara');
    const instalacion = r.complementos.find((c) => c.pedido === 'Instalación de cámara')!;
    expect(instalacion).toMatchObject({ cantidad: 8, unitPrice: 350 });
  });
});

describe('proyectoPorOmision', () => {
  it('nombra lo que se cotiza en corto', () => {
    expect(proyectoPorOmision([{ concepto: 'cámaras domo' }, { concepto: 'NVR 32 canales' }])).toBe('Cámaras domo y NVR 32 canales');
    expect(proyectoPorOmision([])).toBe('');
  });
});
