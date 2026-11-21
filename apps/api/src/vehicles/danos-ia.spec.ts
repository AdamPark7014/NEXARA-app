import {
  CONFIANZA_MINIMA,
  ESQUEMA_DANOS,
  PARES_POR_LLAMADA,
  TOPE_HALLAZGOS,
  enLotes,
  limpiarHallazgos,
  paresParaComparar,
  textoDelLote,
  type ParFotos,
} from './danos-ia';

const foto = (slot: string, momento: string) => ({ slot, url: `/uploads/vehicles/${momento}-${slot}.jpg` });

describe('paresParaComparar', () => {
  it('captura guiada: compara la vuelta, asientos y tablero; nunca el acercamiento al odómetro', () => {
    const slots = ['vuelta-1', 'vuelta-5', 'asientos-traseros', 'tablero', 'km-gasolina'];
    const pares = paresParaComparar(
      slots.map((s) => foto(s, 'salida')),
      slots.map((s) => foto(s, 'devolucion')),
      2,
    );
    expect(pares.map((p) => p.zona)).toEqual(['vuelta-1', 'vuelta-5', 'asientos-traseros', 'tablero']);
    expect(pares[0]).toEqual({
      zona: 'vuelta-1',
      etiqueta: 'Frente',
      salidaUrl: '/uploads/vehicles/salida-vuelta-1.jpg',
      devolucionUrl: '/uploads/vehicles/devolucion-vuelta-1.jpg',
    });
  });

  it('checklist de 7 fotos: el «tablero» es el odómetro y no se compara', () => {
    const slots = ['frontal', 'lateral-der', 'tablero'];
    const pares = paresParaComparar(slots.map((s) => foto(s, 's')), slots.map((s) => foto(s, 'd')), 1);
    expect(pares.map((p) => p.zona)).toEqual(['frontal', 'lateral-der']);
    expect(pares[0].etiqueta).toBe('Frente');
  });

  it('solo vistas que existen en los dos momentos', () => {
    const pares = paresParaComparar([foto('vuelta-1', 's')], [foto('vuelta-1', 'd'), foto('vuelta-2', 'd'), { slot: '', url: 'x' }], 2);
    expect(pares.map((p) => p.zona)).toEqual(['vuelta-1']);
  });
});

describe('lotes y texto', () => {
  it('parte en lotes de 6 pares (12 fotos) para no pasar el límite de la petición', () => {
    expect(enLotes(Array.from({ length: 11 }, (_, i) => i)).map((l) => l.length)).toEqual([PARES_POR_LLAMADA, 5]);
  });

  it('el texto numera los pares y dice qué foto es cuál', () => {
    const t = textoDelLote([
      { zona: 'vuelta-1', etiqueta: 'Frente', salidaUrl: 'a', devolucionUrl: 'b' },
      { zona: 'tablero', etiqueta: 'Tablero completo', salidaUrl: 'c', devolucionUrl: 'd' },
    ]);
    expect(t).toMatch(/Par 1: Frente\. Foto 1 = salida, foto 2 = devolución\./);
    expect(t).toMatch(/Par 2: Tablero completo\. Foto 3 = salida, foto 4 = devolución\./);
  });

  it('el esquema pide par, descripción, severidad y confianza', () => {
    const item = (ESQUEMA_DANOS as any).properties.hallazgos.items;
    expect(item.required).toEqual(['par', 'descripcion', 'severidad', 'confianza']);
    expect(item.properties.severidad.enum).toEqual(['leve', 'media', 'grave']);
  });
});

describe('limpiarHallazgos', () => {
  const pares: ParFotos[] = [
    { zona: 'vuelta-3', etiqueta: 'Lado derecho', salidaUrl: 's3', devolucionUrl: 'd3' },
    { zona: 'tablero', etiqueta: 'Tablero completo', salidaUrl: 'st', devolucionUrl: 'dt' },
  ];

  it('liga cada hallazgo a su par y sus dos fotos; ordena por confianza', () => {
    const r = limpiarHallazgos(
      {
        hallazgos: [
          { par: 1, descripcion: ' rayón de 20 cm en la puerta trasera derecha ', severidad: 'leve', confianza: 0.62 },
          { par: 2, descripcion: 'testigo de motor encendido', severidad: 'media', confianza: 0.91 },
        ],
      },
      pares,
    );
    expect(r.map((h) => h.zona)).toEqual(['tablero', 'vuelta-3']);
    expect(r[1]).toEqual({
      zona: 'vuelta-3',
      descripcion: 'rayón de 20 cm en la puerta trasera derecha',
      severidad: 'leve',
      confianza: 0.62,
      fotoSalidaUrl: 's3',
      fotoDevolucionUrl: 'd3',
    });
  });

  it('descarta lo dudoso, lo que no tiene par válido y lo mal formado', () => {
    const r = limpiarHallazgos(
      {
        hallazgos: [
          { par: 1, descripcion: 'quizá un rayón', severidad: 'leve', confianza: CONFIANZA_MINIMA - 0.01 },
          { par: 3, descripcion: 'par que no existe', severidad: 'leve', confianza: 0.9 },
          { par: 1, descripcion: '', severidad: 'leve', confianza: 0.9 },
          { par: 1, descripcion: 'golpe', severidad: 'terrible', confianza: 0.9 },
          'basura',
        ],
      },
      pares,
    );
    expect(r).toEqual([]);
    expect(limpiarHallazgos(null, pares)).toEqual([]);
  });

  it(`nunca más de ${TOPE_HALLAZGOS}`, () => {
    const muchos = Array.from({ length: 20 }, (_, i) => ({ par: 1, descripcion: `rayón ${i}`, severidad: 'leve', confianza: 0.9 }));
    expect(limpiarHallazgos({ hallazgos: muchos }, pares)).toHaveLength(TOPE_HALLAZGOS);
  });
});
