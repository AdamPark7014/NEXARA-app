import {
  RANGO,
  agruparHerramientas,
  busquedaRapida,
  estadoDeHerramientas,
  existenciaDeArticulo,
  normalizarLimite,
  normalizarTipoBusqueda,
  rangoDeCoincidencia,
  textoExistencia,
  tokensDeBusqueda,
  ubicacionDeNiveles,
  type ArticuloCandidato,
  type HerramientaCandidata,
  type NivelExistencia,
} from './busqueda-rapida.js';

const taladro = (id: number, status: string, extra: Partial<HerramientaCandidata> = {}): HerramientaCandidata => ({
  id,
  toolName: 'Taladro DeWalt',
  model: 'DCD771',
  serialNumber: `SN-${id}`,
  codigoInterno: `TAL-SN-${id}`,
  barcode: `TAL-SN-${id}`,
  status,
  actualizadoEn: new Date('2026-10-01T10:00:00Z'),
  ...extra,
});

const HERRAMIENTAS: HerramientaCandidata[] = [
  taladro(1, 'AVAILABLE'),
  taladro(2, 'ASSIGNED'),
  taladro(3, 'AVAILABLE', { toolName: '  taladro dewalt ', model: 'dcd771' }),
  taladro(4, 'RETIRED'),
  {
    id: 10,
    toolName: 'Multímetro Fluke',
    model: '87V',
    serialNumber: 'F-777',
    codigoInterno: null,
    barcode: null,
    status: 'IN_REPAIR',
    actualizadoEn: '2026-10-05T10:00:00Z',
  },
];

const CINCHO: ArticuloCandidato = {
  id: 100,
  nombre: 'Cincho negro 20 cm',
  sku: 'CIN-20N',
  tipo: 'CONSUMIBLE',
  marca: 'Thorsman',
  categoria: 'Fijación',
  codigoBarras: '7501234567890',
  empaques: [{ id: 1, nombre: 'Bote', piezasPorUnidad: 100, esDefaultCompra: true, codigoBarras: 'BOTE-CIN-20' }],
  actualizadoEn: '2026-10-07T10:00:00Z',
};

const UTP: ArticuloCandidato = {
  id: 101,
  nombre: 'Cable UTP Cat6',
  sku: 'UTP-C6',
  tipo: 'MEDIDA',
  marca: 'Condumex',
  empaques: [{ id: 2, nombre: 'Bobina', piezasPorUnidad: 305 }],
  actualizadoEn: '2026-10-02T10:00:00Z',
};

const CAMARA: ArticuloCandidato = {
  id: 102,
  nombre: 'Cámara bala 4 MP',
  sku: 'CAM-4MP',
  tipo: 'EQUIPO',
  marca: 'Hikvision',
  modelo: 'DS-2CD1043G2',
  // Una caja de compra no cambia que el equipo se cuente por pieza.
  empaques: [{ id: 3, nombre: 'Caja', piezasPorUnidad: 10, esDefaultCompra: true }],
  actualizadoEn: '2026-09-30T10:00:00Z',
};

const VIEJO: ArticuloCandidato = {
  id: 103,
  nombre: 'Taquete de plástico 1/4',
  sku: 'TAQ-14',
  tipo: null,
  empaques: [{ id: 4, nombre: 'Bolsa', piezasPorUnidad: 50 }],
  actualizadoEn: '2026-09-01T10:00:00Z',
};

const ARTICULOS = [CINCHO, UTP, CAMARA, VIEJO];

describe('normalización de la caja', () => {
  it('quita acentos, mayúsculas y repetidas', () => {
    expect(tokensDeBusqueda('  Cámara   CÁMARA bala ')).toEqual(['camara', 'bala']);
    expect(tokensDeBusqueda('')).toEqual([]);
  });

  it('tipo desconocido o vacío es TODOS; acepta minúsculas', () => {
    expect(normalizarTipoBusqueda('consumible')).toBe('CONSUMIBLE');
    expect(normalizarTipoBusqueda('herramienta')).toBe('HERRAMIENTA');
    expect(normalizarTipoBusqueda('SIN_TIPO')).toBe('TODOS');
    expect(normalizarTipoBusqueda(undefined)).toBe('TODOS');
  });

  it('el límite va de 1 a 100 y por omisión es 30', () => {
    expect(normalizarLimite(undefined)).toBe(30);
    expect(normalizarLimite('0')).toBe(30);
    expect(normalizarLimite('5')).toBe(5);
    expect(normalizarLimite(5000)).toBe(100);
  });
});

describe('agruparHerramientas', () => {
  it('junta las piezas iguales sin importar mayúsculas ni espacios, y deja fuera las retiradas', () => {
    const grupos = agruparHerramientas(HERRAMIENTAS);
    expect(grupos).toHaveLength(2);
    const taladros = grupos.find((g) => g.nombre === 'Taladro DeWalt');
    expect(taladros?.piezas.map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it('cuenta disponibles, prestadas y en reparación', () => {
    expect(estadoDeHerramientas([{ status: 'AVAILABLE' }, { status: 'AVAILABLE' }, { status: 'ASSIGNED' }])).toEqual({
      texto: '2 disponibles · 1 prestada',
      tono: 'success',
    });
    expect(
      estadoDeHerramientas([{ status: 'ASSIGNED' }, { status: 'ASSIGNED' }, { status: 'IN_REPAIR' }]),
    ).toEqual({ texto: '2 prestadas · 1 en reparación', tono: 'warning' });
    expect(estadoDeHerramientas([{ status: 'AVAILABLE' }]).texto).toBe('1 disponible');
  });
});

describe('textoExistencia', () => {
  const bote = { nombre: 'Bote', piezasPorUnidad: 100 };
  const bobina = { nombre: 'Bobina', piezasPorUnidad: 305 };

  it('consumible: empaques completos más piezas sueltas, con el total', () => {
    expect(textoExistencia(340, bote, 'pz')).toBe('3 botes + 40 pz (340 pz)');
    expect(textoExistencia(300, bote, 'pz')).toBe('3 botes (300 pz)');
    expect(textoExistencia(100, bote, 'pz')).toBe('1 bote (100 pz)');
  });

  it('por medida: bobinas y metros', () => {
    expect(textoExistencia(730, bobina, 'm')).toBe('2 bobinas + 120 m (730 m)');
    expect(textoExistencia(12.5, bobina, 'm')).toBe('12.5 m');
  });

  it('sin empaque, sin existencia o negativa: solo la unidad base', () => {
    expect(textoExistencia(4, null, 'pz')).toBe('4 pz');
    expect(textoExistencia(0, bote, 'pz')).toBe('Sin existencia');
    expect(textoExistencia(40, bote, 'pz')).toBe('40 pz');
    expect(textoExistencia(-3, bote, 'pz')).toBe('-3 pz');
  });
});

describe('existenciaDeArticulo', () => {
  const niveles: NivelExistencia[] = [
    { cantidad: 300, minimo: 100, almacen: 'Bodega', ubicacion: 'A-2' },
    { cantidad: 40, minimo: 50, almacen: 'Camioneta 2' },
  ];

  it('suma todos los almacenes y usa el empaque de compra', () => {
    expect(existenciaDeArticulo(CINCHO, niveles)).toEqual({
      cantidad: 340,
      unidad: 'pz',
      texto: '3 botes + 40 pz (340 pz)',
      bajoMinimo: true,
    });
  });

  it('por medida cuenta en metros con la bobina más grande si ninguna es la de compra', () => {
    expect(existenciaDeArticulo(UTP, [{ cantidad: 730 }])).toMatchObject({
      unidad: 'm',
      texto: '2 bobinas + 120 m (730 m)',
      bajoMinimo: false,
    });
  });

  it('el equipo va por pieza aunque tenga caja de compra', () => {
    expect(existenciaDeArticulo(CAMARA, [{ cantidad: 4 }]).texto).toBe('4 pz');
  });

  it('sin tipo respeta la unidad capturada si es por metro', () => {
    expect(existenciaDeArticulo({ tipo: null, unidad: 'metros', empaques: [] }, [{ cantidad: 3 }])).toMatchObject({
      unidad: 'm',
      texto: '3 m',
    });
  });
});

describe('ubicacionDeNiveles', () => {
  it('un solo lugar con existencia: almacén y ubicación', () => {
    expect(
      ubicacionDeNiveles([
        { cantidad: 10, almacen: 'Bodega', ubicacion: 'A-2' },
        { cantidad: 0, almacen: 'Camioneta 2' },
      ]),
    ).toBe('Bodega A-2');
  });

  it('repartido: cuántas ubicaciones', () => {
    expect(
      ubicacionDeNiveles([
        { cantidad: 10, almacen: 'Bodega', ubicacion: 'A-2' },
        { cantidad: 5, almacen: 'Bodega', ubicacion: 'B-1' },
        { cantidad: 1, almacen: 'Camioneta 2' },
      ]),
    ).toBe('3 ubicaciones');
  });

  it('sin niveles: null', () => {
    expect(ubicacionDeNiveles([])).toBeNull();
  });
});

describe('rangoDeCoincidencia', () => {
  const entrada = { nombre: 'Cincho negro 20 cm', campos: ['Thorsman', 'Fijación'], codigos: ['CIN-20N'] };

  it('código exacto primero; luego nombre que empieza; luego nombre; luego otros campos', () => {
    expect(rangoDeCoincidencia(entrada, tokensDeBusqueda('cin-20n'), 'cin-20n')).toBe(RANGO.CODIGO_EXACTO);
    expect(rangoDeCoincidencia(entrada, tokensDeBusqueda('cincho ne'), 'cincho ne')).toBe(RANGO.NOMBRE_EMPIEZA);
    expect(rangoDeCoincidencia(entrada, tokensDeBusqueda('negro cincho'), 'negro cincho')).toBe(RANGO.NOMBRE);
    expect(rangoDeCoincidencia(entrada, tokensDeBusqueda('cincho fijacion'), 'cincho fijacion')).toBe(
      RANGO.OTROS_CAMPOS,
    );
  });

  it('todas las palabras deben estar', () => {
    expect(rangoDeCoincidencia(entrada, tokensDeBusqueda('cincho blanco'), 'cincho blanco')).toBeNull();
  });
});

describe('busquedaRapida', () => {
  const base = { herramientas: HERRAMIENTAS, articulos: ARTICULOS, incluyeAlmacen: true };

  it('cuenta por tipo antes de filtrar por el chip', () => {
    const r = busquedaRapida({ ...base, q: '', tipo: 'CONSUMIBLE' });
    expect(r.conteos).toEqual({ TODOS: 6, HERRAMIENTA: 2, EQUIPO: 1, CONSUMIBLE: 1, MEDIDA: 1, SIN_TIPO: 1 });
    expect(r.resultados.map((x) => x.id)).toEqual([100]);
    expect(r.tipo).toBe('CONSUMIBLE');
  });

  it('sin texto enseña lo más reciente primero, hasta el límite', () => {
    const r = busquedaRapida({ ...base, q: '  ', limite: 3 });
    expect(r.resultados.map((x) => `${x.origen}:${x.id}`)).toEqual(['articulo:100', 'herramienta:10', 'articulo:101']);
  });

  it('busca sin acentos en nombre, marca y categoría', () => {
    const r = busquedaRapida({ ...base, q: 'camara hikvision' });
    expect(r.resultados.map((x) => x.id)).toEqual([102]);
    expect(r.resultados[0]).toMatchObject({
      origen: 'articulo',
      tipo: 'EQUIPO',
      detalle: 'DS-2CD1043G2 · Hikvision · CAM-4MP',
      href: '/erp/almacen?producto=102',
    });
    expect(busquedaRapida({ ...base, q: 'MULTIMETRO' }).resultados[0]).toMatchObject({
      origen: 'herramienta',
      nombre: 'Multímetro Fluke',
      estado: { texto: '1 en reparación', tono: 'warning' },
    });
  });

  it('el código exacto gana y, si es el del bote, se devuelve como código de barras', () => {
    const r = busquedaRapida({
      ...base,
      q: 'bote-cin-20',
      nivelesPorProducto: new Map([[100, [{ cantidad: 340, almacen: 'Bodega', ubicacion: 'A-2' }]]]),
    });
    expect(r.resultados[0]).toMatchObject({
      id: 100,
      codigo: 'CIN-20N',
      codigoBarras: 'BOTE-CIN-20',
      existencia: { cantidad: 340, unidad: 'pz', texto: '3 botes + 40 pz (340 pz)', bajoMinimo: false },
      ubicacion: 'Bodega A-2',
    });
  });

  it('herramientas: un renglón por grupo, con la pieza escaneada primero y quién la tiene', () => {
    const r = busquedaRapida({
      ...base,
      q: 'tal-sn-2',
      tipo: 'HERRAMIENTA',
      quienLaTiene: new Map([[2, 'José Antonio']]),
    });
    expect(r.resultados).toHaveLength(1);
    const grupo = r.resultados[0];
    expect(grupo).toMatchObject({
      origen: 'herramienta',
      id: 2,
      tipo: 'HERRAMIENTA',
      nombre: 'Taladro DeWalt',
      detalle: 'DCD771',
      codigo: 'TAL-SN-2',
      estado: { texto: '2 disponibles · 1 prestada', tono: 'success' },
      existencia: null,
      href: '/erp/almacen/herramientas?herramienta=2',
    });
    expect(grupo.piezas).toEqual([
      { id: 2, codigo: 'TAL-SN-2', estado: 'Prestada', quienLaTiene: 'José Antonio' },
      { id: 1, codigo: 'TAL-SN-1', estado: 'Disponible', quienLaTiene: null },
      { id: 3, codigo: 'TAL-SN-3', estado: 'Disponible', quienLaTiene: null },
    ]);
  });

  it('la herramienta sin código guardado se encuentra por el que calcula la nomenclatura', () => {
    const r = busquedaRapida({ ...base, q: 'MUL-F-777' });
    expect(r.resultados[0]).toMatchObject({ id: 10, codigo: 'MUL-F-777', codigoBarras: 'MUL-F-777' });
  });

  it('por nombre: primero los que empiezan con lo buscado, luego el nombre, luego otros campos', () => {
    const articulo = (id: number, nombre: string, categoria: string | null = null): ArticuloCandidato => ({
      id,
      nombre,
      sku: `A-${id}`,
      tipo: 'CONSUMIBLE',
      categoria,
    });
    const r = busquedaRapida({
      herramientas: [],
      incluyeAlmacen: true,
      q: 'cincho',
      articulos: [
        articulo(1, 'Fijador de pared', 'Cinchos y fijación'),
        articulo(2, 'Abrazadera para cincho'),
        articulo(3, 'Cincho negro 20 cm'),
        articulo(4, 'Cincho blanco 30 cm'),
        articulo(5, 'Taquete 1/4'),
      ],
    });
    expect(r.resultados.map((x) => x.nombre)).toEqual([
      'Cincho blanco 30 cm',
      'Cincho negro 20 cm',
      'Abrazadera para cincho',
      'Fijador de pared',
    ]);
  });

  it('sin permiso de almacén solo salen herramientas y los conteos de almacén quedan en cero', () => {
    const r = busquedaRapida({ ...base, incluyeAlmacen: false, q: '', totalesArticulos: { EQUIPO: 9 } });
    expect(r.incluyeAlmacen).toBe(false);
    expect(r.resultados.every((x) => x.origen === 'herramienta')).toBe(true);
    expect(r.conteos).toEqual({ TODOS: 2, HERRAMIENTA: 2, EQUIPO: 0, CONSUMIBLE: 0, MEDIDA: 0, SIN_TIPO: 0 });
  });

  it('los totales de la base sustituyen el conteo de artículos cuando no se trajo todo', () => {
    const r = busquedaRapida({
      ...base,
      q: '',
      articulos: [CINCHO],
      totalesArticulos: { EQUIPO: 4, CONSUMIBLE: 12, MEDIDA: 3, SIN_TIPO: 7 },
    });
    expect(r.conteos).toEqual({ TODOS: 28, HERRAMIENTA: 2, EQUIPO: 4, CONSUMIBLE: 12, MEDIDA: 3, SIN_TIPO: 7 });
  });

  it('sin coincidencias: lista vacía y conteos en cero', () => {
    const r = busquedaRapida({ ...base, q: 'xyz inexistente' });
    expect(r.resultados).toEqual([]);
    expect(r.conteos.TODOS).toBe(0);
  });
});
